import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { emailNotificationAuditSnapshot } from "./email-notification-audit.ts";

const notificationRoute = readFileSync(
  new URL("../../app/api/admin/notifications/[notificationId]/route.ts", import.meta.url),
  "utf8"
);
const testNotificationRoute = readFileSync(
  new URL("../../app/api/admin/notifications/test/route.ts", import.meta.url),
  "utf8"
);

test("notification audit snapshots retain only safe metadata", () => {
  const snapshot = emailNotificationAuditSnapshot({
    id: "70000000-0000-4000-8000-000000000001",
    order_number: "BS-7001",
    customer_email: "buyer@example.test",
    event: "payment_confirmed",
    subject: "Private subject",
    preview_text: "Private preview",
    body_text: "Private body",
    status: "failed",
    attempts: 3,
    provider: "buyer@example.test",
    last_error: "buyer@example.test BODY: private provider response",
    sent_at: null,
    created_at: "2026-07-24T10:00:00.000Z",
    updated_at: "2026-07-24T10:05:00.000Z"
  });

  assert.deepEqual(snapshot, {
    notificationId: "70000000-0000-4000-8000-000000000001",
    orderNumber: "BS-7001",
    event: "payment_confirmed",
    status: "failed",
    attempts: 3,
    provider: "unknown",
    lastError: "email_provider_failed",
    createdAt: "2026-07-24T10:00:00.000Z",
    updatedAt: "2026-07-24T10:05:00.000Z"
  });
  assert.doesNotMatch(JSON.stringify(snapshot), /buyer@example|Private subject|Private preview|Private body/);
});

test("notification admin routes never write full message snapshots to audit data", () => {
  assert.match(notificationRoute, /beforeData:\s*emailNotificationAuditSnapshot\(beforeNotification\)/);
  assert.match(notificationRoute, /afterData:\s*emailNotificationAuditSnapshot\(notification\)/);
  assert.doesNotMatch(notificationRoute, /beforeData:\s*beforeNotification/);
  assert.doesNotMatch(notificationRoute, /afterData:\s*notification\b/);

  assert.doesNotMatch(testNotificationRoute, /afterData:\s*\{[\s\S]*?\bto:/);
  assert.doesNotMatch(testNotificationRoute, /providerMessageId:/);
  assert.doesNotMatch(testNotificationRoute, /error:\s*sendResult\.error/);
});
