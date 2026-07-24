import { isRetryableEmailNotificationStatus } from "./email-notification-delivery.ts";
import {
  deliverEmailNotification,
  type TransactionalEmailSender,
  type EmailDeliveryRepository
} from "./email-notification-service.ts";

const EMAIL_NOTIFICATION_BATCH_SIZE = 20;

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
  status: string;
  delivery_lease_expires_at: string | null;
};

type EmailNotificationListQuery = {
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
        p_lease_seconds: leaseSeconds
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
  const { data, error } = await supabase
    .from("email_notifications")
    .select("id, customer_email, subject, body_text, status, delivery_lease_expires_at")
    .or(`status.in.(queued,failed),and(status.eq.sending,delivery_lease_expires_at.lte.${now.toISOString()})`)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(EMAIL_NOTIFICATION_BATCH_SIZE);

  if (error) throw error;
  const snapshots = data ?? [];
  const summary: DispatchSummary = { scanned: snapshots.length, delivered: 0, failed: 0, conflicted: 0 };
  const deliveryRepository = createDeliveryRepository(supabase);

  for (const snapshot of snapshots) {
    if (!isRetryableEmailNotificationStatus(snapshot.status, snapshot.delivery_lease_expires_at, now.getTime())) continue;

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
  }

  return summary;
}
