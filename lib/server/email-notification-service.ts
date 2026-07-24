import {
  EMAIL_DELIVERY_LEASE_SECONDS,
  getEmailDeliveryIdempotencyKey
} from "./email-notification-delivery.ts";

export type DeliverableEmailNotification = {
  id: string;
  customerEmail: string;
  subject: string;
  bodyText: string;
};

export type EmailProviderResult = {
  ok: boolean;
  provider: string;
  providerMessageId?: string;
  error?: string;
};

export type EmailDeliveryRepository = {
  claim(notificationId: string, leaseSeconds: number): Promise<{ claimed: boolean; leaseToken: string | null }>;
  finalize(input: {
    notificationId: string;
    leaseToken: string;
    succeeded: boolean;
    provider: string;
    providerMessageId: string | null;
    error: string | null;
  }): Promise<{ finalized: boolean; notification: unknown | null }>;
};

export type TransactionalEmailSender = (input: {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}) => Promise<EmailProviderResult>;

export type EmailDeliveryResult =
  | { state: "conflict" }
  | { state: "finalization_failed" }
  | { state: "delivered"; notification: unknown; providerResult: EmailProviderResult }
  | { state: "provider_failed"; notification: unknown; providerResult: EmailProviderResult };

export async function deliverEmailNotification(
  notification: DeliverableEmailNotification,
  repository: EmailDeliveryRepository,
  send: TransactionalEmailSender,
  leaseSeconds = EMAIL_DELIVERY_LEASE_SECONDS
): Promise<EmailDeliveryResult> {
  const claim = await repository.claim(notification.id, leaseSeconds);
  if (!claim.claimed || !claim.leaseToken) return { state: "conflict" };

  let providerResult: EmailProviderResult;
  try {
    providerResult = await send({
      to: notification.customerEmail,
      subject: notification.subject,
      text: notification.bodyText,
      idempotencyKey: getEmailDeliveryIdempotencyKey(notification.id)
    });
  } catch {
    providerResult = { ok: false, provider: "resend", error: "Email provider request failed." };
  }

  const finalized = await repository.finalize({
    notificationId: notification.id,
    leaseToken: claim.leaseToken,
    succeeded: providerResult.ok,
    provider: providerResult.provider,
    providerMessageId: providerResult.providerMessageId ?? null,
    error: providerResult.error ?? null
  });

  if (!finalized.finalized || !finalized.notification) return { state: "finalization_failed" };
  return providerResult.ok
    ? { state: "delivered", notification: finalized.notification, providerResult }
    : { state: "provider_failed", notification: finalized.notification, providerResult };
}
