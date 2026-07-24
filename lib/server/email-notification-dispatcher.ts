import { isRetryableEmailNotificationStatus } from "./email-notification-delivery.ts";
import {
  deliverEmailNotification,
  type TransactionalEmailSender,
  type EmailDeliveryRepository
} from "./email-notification-service.ts";

const EMAIL_NOTIFICATION_BATCH_SIZE = 20;
export const EMAIL_NOTIFICATION_MAX_AUTOMATIC_ATTEMPTS = 5;

export type DispatchSummary = {
  scanned: number;
  delivered: number;
  failed: number;
  conflicted: number;
};

type EmailNotificationSnapshot = {
  id: string;
  customer_email: string;
  subject: string;
  body_text: string;
  event: string;
  automatic_delivery_eligible: boolean;
  automatic_quarantined_at: string | null;
  attempts: number;
  next_attempt_at: string | null;
  status: string;
  delivery_lease_expires_at: string | null;
};

type EmailNotificationListQuery = {
  eq(column: string, value: unknown): EmailNotificationListQuery;
  is(column: string, value: null): EmailNotificationListQuery;
  lt(column: string, value: number): EmailNotificationListQuery;
  or(filter: string): EmailNotificationListQuery;
  order(column: string, options?: { ascending: boolean }): EmailNotificationListQuery;
  limit(count: number): PromiseLike<{ data: EmailNotificationSnapshot[] | null; error: unknown }>;
};

export type EmailNotificationDispatchRepository = {
  from(table: "email_notifications"): {
    select(columns: string): EmailNotificationListQuery;
  };
  rpc(name: string, input: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

function asFirstRpcRow(data: unknown): Record<string, unknown> | null {
  if (!Array.isArray(data) || data.length === 0 || !data[0] || typeof data[0] !== "object") return null;
  return data[0] as Record<string, unknown>;
}

function createDeliveryRepository(supabase: EmailNotificationDispatchRepository): EmailDeliveryRepository {
  return {
    async claim(notificationId, leaseSeconds) {
      const { data, error } = await supabase.rpc("claim_email_notification_delivery", {
        p_notification_id: notificationId,
        p_lease_seconds: leaseSeconds,
        p_automatic: true
      });
      if (error) throw error;
      const row = asFirstRpcRow(data);
      return {
        claimed: row?.claimed === true,
        leaseToken: typeof row?.lease_token === "string" ? row.lease_token : null
      };
    },
    async finalize(input) {
      const { data, error } = await supabase.rpc("finalize_email_notification_delivery", {
        p_notification_id: input.notificationId,
        p_lease_token: input.leaseToken,
        p_succeeded: input.succeeded,
        p_provider: input.provider,
        p_provider_message_id: input.providerMessageId,
        p_error: input.error
      });
      if (error) throw error;
      const row = asFirstRpcRow(data);
      return {
        finalized: row?.finalized === true,
        notification: row?.notification ?? null
      };
    }
  };
}

export async function dispatchEmailNotifications(
  supabase: EmailNotificationDispatchRepository,
  send: TransactionalEmailSender,
  now = new Date()
): Promise<DispatchSummary> {
  const nowIso = now.toISOString();
  const { data, error } = await supabase
    .from("email_notifications")
    .select("id, customer_email, subject, body_text, event, automatic_delivery_eligible, automatic_quarantined_at, attempts, next_attempt_at, status, delivery_lease_expires_at")
    .eq("event", "payment_confirmed")
    .eq("automatic_delivery_eligible", true)
    .is("automatic_quarantined_at", null)
    .lt("attempts", EMAIL_NOTIFICATION_MAX_AUTOMATIC_ATTEMPTS)
    .or(`and(status.in.(queued,failed),or(next_attempt_at.is.null,next_attempt_at.lte.${nowIso})),and(status.eq.sending,delivery_lease_expires_at.lte.${nowIso})`)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(EMAIL_NOTIFICATION_BATCH_SIZE);

  if (error) throw error;
  const snapshots = data ?? [];
  const summary: DispatchSummary = { scanned: snapshots.length, delivered: 0, failed: 0, conflicted: 0 };
  const deliveryRepository = createDeliveryRepository(supabase);

  for (const snapshot of snapshots) {
    if (
      snapshot.event !== "payment_confirmed"
      || snapshot.automatic_delivery_eligible !== true
      || snapshot.automatic_quarantined_at !== null
      || snapshot.attempts >= EMAIL_NOTIFICATION_MAX_AUTOMATIC_ATTEMPTS
      || (
        snapshot.next_attempt_at !== null
        && Date.parse(snapshot.next_attempt_at) > now.getTime()
      )
    ) continue;
    if (!isRetryableEmailNotificationStatus(snapshot.status, snapshot.delivery_lease_expires_at, now.getTime())) continue;

    try {
      const result = await deliverEmailNotification({
        id: snapshot.id,
        customerEmail: snapshot.customer_email,
        subject: snapshot.subject,
        bodyText: snapshot.body_text
      }, deliveryRepository, send);

      if (result.state === "delivered") {
        summary.delivered += 1;
      } else if (result.state === "conflict") {
        summary.conflicted += 1;
      } else {
        summary.failed += 1;
      }
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
}
