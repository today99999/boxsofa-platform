import {
  buildPaidOrderMerchantEmail,
  type PaidOrderMerchantEmailInput
} from "../merchant-order-email.ts";
import type { EmailProviderResult, TransactionalEmailSender } from "./email-notification-service.ts";

export type PaidOrderMerchantOrder = Omit<
  PaidOrderMerchantEmailInput,
  "recipient" | "siteUrl"
> & {
  id: string;
};

export type PaidOrderMerchantNotificationRepository = {
  loadPaidOrder(orderId: string): Promise<PaidOrderMerchantOrder | null>;
};

type PaidOrderMerchantNotificationInput = {
  orderId: string;
  repository: PaidOrderMerchantNotificationRepository;
  recipient: string;
  siteUrl: string;
  send: TransactionalEmailSender;
};

export type PaidOrderMerchantNotificationResult =
  | { state: "not_paid" }
  | { state: "delivered"; providerResult: EmailProviderResult }
  | { state: "provider_failed"; providerResult: EmailProviderResult };

export async function sendPaidOrderMerchantNotification(
  input: PaidOrderMerchantNotificationInput
): Promise<PaidOrderMerchantNotificationResult> {
  const order = await input.repository.loadPaidOrder(input.orderId);
  if (!order) return { state: "not_paid" };

  const email = buildPaidOrderMerchantEmail({
    ...order,
    recipient: input.recipient,
    siteUrl: input.siteUrl
  });
  const providerResult = await input.send({
    to: email.to,
    subject: email.subject,
    text: email.bodyText,
    idempotencyKey: `boxsofa-merchant-paid/${order.id}`
  });

  return providerResult.ok
    ? { state: "delivered", providerResult }
    : { state: "provider_failed", providerResult };
}
