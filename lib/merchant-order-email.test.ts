import assert from "node:assert/strict";
import test from "node:test";
import { buildPaidOrderMerchantEmail } from "./merchant-order-email.ts";

test("builds a Chinese paid-order email for the BoxSofa merchant", () => {
  const email = buildPaidOrderMerchantEmail({
    orderNumber: "BS-2026-0088",
    customerName: "Ana Garcia",
    customerEmail: "ana@example.com",
    customerPhone: "+34 600 000 000",
    countryCode: "ES",
    totalEur: 699,
    items: [
      {
        name: "Compressed Modular Sofa",
        color: "Warm white",
        quantity: 1
      }
    ],
    siteUrl: "https://boxsofa.eu"
  });

  assert.equal(email.to, "info@boxsofa.eu");
  assert.match(email.subject, /新订单/);
  assert.match(email.subject, /BS-2026-0088/);
  assert.match(email.bodyText, /付款状态：Stripe 已确认付款/);
  assert.match(email.bodyText, /订单金额：EUR 699\.00/);
  assert.match(email.bodyText, /Compressed Modular Sofa/);
  assert.match(email.bodyText, /Warm white/);
  assert.match(email.bodyText, /数量：1/);
  assert.match(email.bodyText, /配送国家：西班牙（ES）/);
  assert.match(email.bodyText, /客户姓名：Ana Garcia/);
  assert.match(email.bodyText, /https:\/\/boxsofa\.eu\/admin/);
  assert.doesNotMatch(email.bodyText, /card|银行卡|payment_intent/i);
});

test("uses the configured merchant recipient and handles missing optional order details", () => {
  const email = buildPaidOrderMerchantEmail({
    orderNumber: "BS-2026-0099",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    countryCode: "",
    totalEur: 399.5,
    items: [],
    recipient: "orders@example.com",
    siteUrl: "https://boxsofa.eu/"
  });

  assert.equal(email.to, "orders@example.com");
  assert.match(email.bodyText, /客户姓名：未提供/);
  assert.match(email.bodyText, /配送国家：未提供/);
  assert.match(email.bodyText, /商品明细：请登录商家后台查看/);
  assert.match(email.bodyText, /https:\/\/boxsofa\.eu\/admin/);
});
