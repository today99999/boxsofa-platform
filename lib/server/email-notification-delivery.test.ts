import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  EMAIL_DELIVERY_LEASE_SECONDS,
  getEmailDeliveryIdempotencyKey,
  isRetryableEmailNotificationStatus
} from "./email-notification-delivery.ts";

const migration = readFileSync(
  new URL("../../supabase/migrations/202607240013_harden_task5_production_safety.sql", import.meta.url),
  "utf8"
).toLowerCase();
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
