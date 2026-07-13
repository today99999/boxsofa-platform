import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderEmailPreview } from "@/lib/email-notifications";

type QueueResult = {
  queued: boolean;
  warning: string | null;
};

export async function queueOrderEmailPreview(
  supabase: SupabaseClient,
  orderId: string | null,
  orderNumber: string,
  preview: OrderEmailPreview | null
): Promise<QueueResult> {
  if (!preview) {
    return { queued: false, warning: null };
  }

  const { error } = await supabase.from("email_notifications").insert({
    order_id: orderId,
    order_number: orderNumber,
    customer_email: preview.to,
    event: preview.event,
    subject: preview.subject,
    preview_text: preview.previewText,
    body_text: preview.bodyText,
    provider: preview.provider,
    status: "queued",
    attempts: 0
  });

  return {
    queued: !error,
    warning: error?.message ?? null
  };
}
