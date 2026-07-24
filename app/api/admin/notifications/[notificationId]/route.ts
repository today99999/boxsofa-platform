import { NextResponse } from "next/server";
import { z } from "zod";
import { sendTransactionalEmail } from "@/lib/server/email-provider";
import { EMAIL_DELIVERY_LEASE_SECONDS, getEmailDeliveryIdempotencyKey } from "@/lib/server/email-notification-delivery";
import { writeAdminAuditLog } from "@/lib/server/admin-audit";
import { requireOwnerAccess } from "@/lib/server/admin-auth";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const updateNotificationSchema = z.object({
  action: z.enum(["requeue", "skip", "send"])
});

type RouteContext = {
  params: {
    notificationId: string;
  };
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const payload = updateNotificationSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { ok: false, message: "Notification update is incomplete.", issues: payload.error.flatten() },
      { status: 400 }
    );
  }

  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
  }

  const adminAccess = await requireOwnerAccess();
  if (!adminAccess.ok) {
    return NextResponse.json({ ok: false, message: "Merchant login is required." }, { status: 401 });
  }

  const notificationId = decodeURIComponent(params.notificationId);
  const supabase = createSupabaseServiceRoleClient();
  const { data: beforeNotification, error: loadError } = await supabase
    .from("email_notifications")
    .select("id, order_number, customer_email, event, subject, preview_text, body_text, status, provider, attempts, last_error, sent_at")
    .eq("id", notificationId)
    .single();

  if (loadError || !beforeNotification) {
    return NextResponse.json(
      { ok: false, message: "Email notification was not found." },
      { status: 404 }
    );
  }

  if (payload.data.action === "send") {
    const { data: claimRows, error: claimError } = await supabase.rpc("claim_email_notification_delivery", {
      p_notification_id: notificationId,
      p_lease_seconds: EMAIL_DELIVERY_LEASE_SECONDS
    });
    const claim = Array.isArray(claimRows) ? claimRows[0] : null;

    if (claimError || !claim) {
      return NextResponse.json(
        { ok: false, message: "Could not claim email notification for delivery." },
        { status: 500 }
      );
    }

    if (claim.claimed !== true) {
      return NextResponse.json(
        { ok: false, message: "Email notification is already being delivered or has been sent." },
        { status: 409 }
      );
    }

    let sendResult;
    try {
      sendResult = await sendTransactionalEmail({
        to: beforeNotification.customer_email,
        subject: beforeNotification.subject,
        text: beforeNotification.body_text,
        idempotencyKey: getEmailDeliveryIdempotencyKey(notificationId)
      });
    } catch {
      sendResult = { ok: false, provider: "resend", error: "Email provider request failed." };
    }

    const { data: finalizedRows, error: finalizeError } = await supabase.rpc("finalize_email_notification_delivery", {
      p_notification_id: notificationId,
      p_lease_token: claim.lease_token,
      p_succeeded: sendResult.ok,
      p_provider: sendResult.provider,
      p_provider_message_id: sendResult.providerMessageId ?? null,
      p_error: sendResult.error ?? null
    });
    const finalized = Array.isArray(finalizedRows) ? finalizedRows[0] : null;

    if (finalizeError || !finalized || finalized.finalized !== true) {
      return NextResponse.json(
        { ok: false, message: "Email delivery result could not be recorded." },
        { status: 500 }
      );
    }

    const notification = finalized.notification;

    await writeAdminAuditLog(supabase, {
      actorId: adminAccess.userId,
      action: sendResult.ok ? "email_notification_sent" : "email_notification_send_failed",
      entityType: "email_notification",
      entityId: notificationId,
      beforeData: beforeNotification,
      afterData: notification
    });

    return NextResponse.json({
      ok: sendResult.ok,
      mode: "supabase",
      notification,
      message: sendResult.ok ? "Email notification sent." : "Email sending failed."
    }, { status: sendResult.ok ? 200 : 502 });
  }

  const update = payload.data.action === "requeue"
    ? { status: "queued", provider: "pending", last_error: null, sent_at: null }
    : { status: "skipped", last_error: null, sent_at: null };

  const { data: notification, error: updateError } = await supabase
    .from("email_notifications")
    .update(update)
    .eq("id", notificationId)
    .neq("status", "sending")
    .select("id, order_number, customer_email, event, subject, preview_text, body_text, provider, status, attempts, last_error, sent_at, created_at, updated_at")
    .single();

  if (updateError || !notification) {
    return NextResponse.json(
      { ok: false, message: "Could not update email notification." },
      { status: 500 }
    );
  }

  await writeAdminAuditLog(supabase, {
    actorId: adminAccess.userId,
    action: "email_notification_" + payload.data.action,
    entityType: "email_notification",
    entityId: notificationId,
    beforeData: beforeNotification,
    afterData: notification
  });

  return NextResponse.json({ ok: true, mode: "supabase", notification });
}
