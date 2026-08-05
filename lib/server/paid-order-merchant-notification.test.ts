import assert from "node:assert/strict";
import test from "node:test";
import {
  sendPaidOrderMerchantNotification,
  type PaidOrderMerchantNotificationRepository
} from "./paid-order-merchant-notification.ts";

const paidOrder = {
  id: "0b6bfc93-89fa-4fd9-b2bf-18522723e420",
  orderNumber: "BS-2026-0088",
  customerName: "Ana Garcia",
  customerEmail: "ana@example.com",
  customerPhone: "+34 600 000 000",
  countryCode: "ES",
  totalEur: 699,
  items: [{ name: "Compressed Modular Sofa", color: "Warm white", quantity: 1 }]
};

test("sends one Chinese merchant email with an order-stable idempotency key", async () => {
  const sent: Array<{ to: string; subject: string; text: string; idempotencyKey: string }> = [];
  const repository: PaidOrderMerchantNotificationRepository = {
    async loadPaidOrder(orderId) {
      assert.equal(orderId, paidOrder.id);
      return paidOrder;
    }
  };

  const result = await sendPaidOrderMerchantNotification({
    orderId: paidOrder.id,
    repository,
    recipient: "info@boxsofa.eu",
    siteUrl: "https://boxsofa.eu",
    async send(input) {
      sent.push(input);
      return { ok: true, provider: "resend", providerMessageId: "email-1" };
    }
  });

  assert.equal(result.state, "delivered");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "info@boxsofa.eu");
  assert.match(sent[0].subject, /新订单/);
  assert.match(sent[0].text, /Stripe 已确认付款/);
  assert.equal(sent[0].idempotencyKey, `boxsofa-merchant-paid/${paidOrder.id}`);
});

test("does not send when the order is not confirmed as paid", async () => {
  let sendCount = 0;
  const result = await sendPaidOrderMerchantNotification({
    orderId: paidOrder.id,
    repository: {
      async loadPaidOrder() {
        return null;
      }
    },
    recipient: "info@boxsofa.eu",
    siteUrl: "https://boxsofa.eu",
    async send() {
      sendCount += 1;
      return { ok: true, provider: "resend" };
    }
  });

  assert.deepEqual(result, { state: "not_paid" });
  assert.equal(sendCount, 0);
});

test("reports provider failure so Stripe can retry the webhook", async () => {
  const result = await sendPaidOrderMerchantNotification({
    orderId: paidOrder.id,
    repository: {
      async loadPaidOrder() {
        return paidOrder;
      }
    },
    recipient: "info@boxsofa.eu",
    siteUrl: "https://boxsofa.eu",
    async send() {
      return { ok: false, provider: "resend", error: "Temporary provider error." };
    }
  });

  assert.equal(result.state, "provider_failed");
});
