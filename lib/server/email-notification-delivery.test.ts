import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  EMAIL_DELIVERY_LEASE_SECONDS,
  canTransitionEmailNotification,
  getEmailDeliveryIdempotencyKey,
  isRetryableEmailNotificationStatus
} from "./email-notification-delivery.ts";
import { deliverEmailNotification } from "./email-notification-service.ts";

const migration = readFileSync(
  new URL("../../supabase/migrations/202607240013_harden_task5_production_safety.sql", import.meta.url),
  "utf8"
).toLowerCase();
const finalMigration = readFileSync(
  new URL("../../supabase/migrations/202607240016_finalize_task5_email_state_machine.sql", import.meta.url),
  "utf8"
).toLowerCase();
const bootstrapSchema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8").toLowerCase();
const provider = readFileSync(new URL("./email-provider.ts", import.meta.url), "utf8");

test("email delivery uses a stable provider idempotency key for a notification", () => {
  const notificationId = "7b024ddc-78f9-40ee-bcd0-8a2bf1d35601";
  assert.equal(getEmailDeliveryIdempotencyKey(notificationId), `boxsofa-email/${notificationId}`);
  assert.ok(getEmailDeliveryIdempotencyKey(notificationId).length <= 256);
  assert.match(provider, /"Idempotency-Key"/);
});

test("only queued, failed, or expired sending notifications are retryable", () => {
  const now = Date.parse("2026-07-24T12:00:00.000Z");
  assert.equal(EMAIL_DELIVERY_LEASE_SECONDS, 300);
  assert.equal(isRetryableEmailNotificationStatus("queued", null, now), true);
  assert.equal(isRetryableEmailNotificationStatus("failed", null, now), true);
  assert.equal(isRetryableEmailNotificationStatus("sending", "2026-07-24T11:59:59.000Z", now), true);
  assert.equal(isRetryableEmailNotificationStatus("sending", "2026-07-24T12:00:01.000Z", now), false);
  assert.equal(isRetryableEmailNotificationStatus("sent", null, now), false);
  assert.equal(isRetryableEmailNotificationStatus("skipped", null, now), false);
});

test("email outbox migration claims atomically, recovers stale leases, and finalizes by token", () => {
  for (const contract of [
    "status in ('queued', 'sending', 'sent', 'failed', 'skipped')",
    "create or replace function public.claim_email_notification_delivery",
    "notification_row.status in ('queued', 'failed')",
    "notification_row.status = 'sending'",
    "delivery_lease_expires_at <= now()",
    "delivery_lease_token = v_lease_token",
    "create or replace function public.finalize_email_notification_delivery",
    "notification_row.delivery_lease_token = p_lease_token",
    "case when p_succeeded then 'sent' else 'failed' end",
    "grant execute on function public.claim_email_notification_delivery(uuid, integer) to service_role"
  ]) {
    assert.match(migration, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("email state machine keeps sent and skipped notifications terminal", () => {
  assert.equal(canTransitionEmailNotification("queued", "send"), true);
  assert.equal(canTransitionEmailNotification("failed", "requeue"), true);
  assert.equal(canTransitionEmailNotification("failed", "skip"), true);
  assert.equal(canTransitionEmailNotification("sending", "skip"), false);
  assert.equal(canTransitionEmailNotification("sent", "send"), false);
  assert.equal(canTransitionEmailNotification("sent", "requeue"), false);
  assert.equal(canTransitionEmailNotification("sent", "skip"), false);
  assert.equal(canTransitionEmailNotification("skipped", "send"), false);
  for (const contract of [
    "create or replace function public.transition_email_notification",
    "if v_notification.status in ('sent', 'skipped')",
    "delivery_in_progress",
    "grant execute on function public.transition_email_notification(uuid, text) to service_role",
    "create trigger enforce_email_notification_state_machine"
  ]) {
    assert.match(finalMigration, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(bootstrapSchema, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("injected delivery repository permits one concurrent provider call and stable retry idempotency", async () => {
  const notification = {
    id: "7b024ddc-78f9-40ee-bcd0-8a2bf1d35601",
    customerEmail: "buyer@example.test",
    subject: "Payment confirmed",
    bodyText: "Your order is confirmed."
  };
  let claimed = false;
  let providerCalls = 0;
  const repository = {
    async claim() {
      if (claimed) return { claimed: false, leaseToken: null };
      claimed = true;
      return { claimed: true, leaseToken: "lease-a" };
    },
    async finalize() {
      return { finalized: true, notification: { status: "sent" } };
    }
  };
  const send = async (input: { idempotencyKey: string }) => {
    providerCalls += 1;
    assert.equal(input.idempotencyKey, getEmailDeliveryIdempotencyKey(notification.id));
    return { ok: true, provider: "resend", providerMessageId: "email-1" };
  };
  const [left, right] = await Promise.all([
    deliverEmailNotification(notification, repository, send),
    deliverEmailNotification(notification, repository, send)
  ]);
  assert.equal(providerCalls, 1);
  assert.equal([left.state, right.state].filter((state) => state === "delivered").length, 1);
  assert.equal([left.state, right.state].filter((state) => state === "conflict").length, 1);

  let attempts = 0;
  const retryKeys: string[] = [];
  const retryRepository = {
    async claim() {
      attempts += 1;
      return { claimed: true, leaseToken: `lease-${attempts}` };
    },
    async finalize() {
      return attempts === 1
        ? { finalized: false, notification: null }
        : { finalized: true, notification: { status: "sent" } };
    }
  };
  const retrySend = async (input: { idempotencyKey: string }) => {
    retryKeys.push(input.idempotencyKey);
    return { ok: true, provider: "resend", providerMessageId: "email-1" };
  };
  assert.equal((await deliverEmailNotification(notification, retryRepository, retrySend)).state, "finalization_failed");
  assert.equal((await deliverEmailNotification(notification, retryRepository, retrySend)).state, "delivered");
  assert.deepEqual(retryKeys, [getEmailDeliveryIdempotencyKey(notification.id), getEmailDeliveryIdempotencyKey(notification.id)]);
});
