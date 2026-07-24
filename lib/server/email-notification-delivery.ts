export const EMAIL_DELIVERY_LEASE_SECONDS = 5 * 60;

export function getEmailDeliveryIdempotencyKey(notificationId: string) {
  return `boxsofa-email/${notificationId}`;
}

export function isRetryableEmailNotificationStatus(status: string, leaseExpiresAt: string | null, now = Date.now()) {
  if (status === "queued" || status === "failed") return true;
  if (status !== "sending" || !leaseExpiresAt) return false;
  return Date.parse(leaseExpiresAt) <= now;
}

export type EmailNotificationAction = "requeue" | "skip" | "send";

export function canTransitionEmailNotification(status: string, action: EmailNotificationAction) {
  if (status === "sent" || status === "skipped" || status === "sending") return false;
  if (action === "send") return status === "queued" || status === "failed";
  if (action === "requeue") return status === "failed";
  return action === "skip" && (status === "queued" || status === "failed");
}
