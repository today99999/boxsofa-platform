export const EMAIL_DELIVERY_LEASE_SECONDS = 5 * 60;

export function getEmailDeliveryIdempotencyKey(notificationId: string) {
  return `boxsofa-email/${notificationId}`;
}

export function isRetryableEmailNotificationStatus(status: string, leaseExpiresAt: string | null, now = Date.now()) {
  if (status === "queued" || status === "failed") return true;
  if (status !== "sending" || !leaseExpiresAt) return false;
  return Date.parse(leaseExpiresAt) <= now;
}
