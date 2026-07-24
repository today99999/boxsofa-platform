import { NextResponse } from "next/server";
import { z } from "zod";
import { sendTransactionalEmail } from "@/lib/server/email-provider";
import { deliverEmailNotification } from "@/lib/server/email-notification-service";
import { emailNotificationAuditSnapshot } from "@/lib/server/email-notification-audit";
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
  const adminAccess = await requireOwnerAccess();
  if (!adminAccess.ok) {
    if (adminAccess.reason === "supabase_not_configured") {
      return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
    }
    return NextResponse.json(
      { ok: false, message: adminAccess.reason === "not_authenticated" ? "Merchant login is required." : "Owner access is required." },
      { status: adminAccess.reason === "not_authenticated" ? 401 : 403 }
    );
  }

  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Notification update is incomplete." }, { status: 400 });
  }
  const payload = updateNotificationSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json({ ok: false, message: "Notification update is incomplete." }, { status: 400 });
  }

  const notificationId = decodeURIComponent(params.notificationId);
  const supabase = createSupabaseServiceRoleClient();
  const { data: beforeNotification, error: loadError } = await supabase
    .from("email_notifications")
    .select("id, order_number, customer_email, event, subject, preview_text, body_text, status, provider, attempts, last_error, sent_at, created_at, updated_at")
    .eq("id", notificationId)
    .single();

  if (loadError || !beforeNotification) {
    return NextResponse.json(
      { ok: false, message: "Email notification was not found." },
      { status: 404 }
    );
  }

  if (payload.data.action === "send") {
    let delivery;
    try {
      delivery = await deliverEmailNotification(
        {
          id: notificationId,
          customerEmail: beforeNotification.customer_email,
          subject: beforeNotification.subject,
          bodyText: beforeNotification.body_text
        },
        {
          async claim(id, leaseSeconds) {
            const { data, error } = await supabase.rpc("claim_email_notification_delivery", {
              p_notification_id: id,
              p_lease_seconds: leaseSeconds,
              p_automatic: false
            });
            if (error) throw error;
            const row = Array.isArray(data) ? data[0] : null;
            return { claimed: row?.claimed === true, leaseToken: typeof row?.lease_token === "string" ? row.lease_token : null };
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
            const row = Array.isArray(data) ? data[0] : null;
            return { finalized: row?.finalized === true, notification: row?.notification ?? null };
          }
        },
        sendTransactionalEmail
      );
    } catch {
      return NextResponse.json(
        { ok: false, message: "Could not process email notification." },
        { status: 500 }
      );
    }

    if (delivery.state === "conflict") {
      return NextResponse.json(
        { ok: false, message: "Email notification is already being delivered or has been sent." },
        { status: 409 }
      );
    }

    if (delivery.state === "finalization_failed") {
      return NextResponse.json(
        { ok: false, message: "Email delivery result could not be recorded." },
        { status: 500 }
      );
    }

    const notification = delivery.notification;
    const sendResult = delivery.providerResult;

    await writeAdminAuditLog(supabase, {
      actorId: adminAccess.userId,
      action: sendResult.ok ? "email_notification_sent" : "email_notification_send_failed",
      entityType: "email_notification",
      entityId: notificationId,
      beforeData: emailNotificationAuditSnapshot(beforeNotification),
      afterData: emailNotificationAuditSnapshot(notification)
    });

    return NextResponse.json({
      ok: delivery.state === "delivered",
      mode: "supabase",
      notification,
      message: delivery.state === "delivered" ? "Email notification sent." : "Email sending failed."
    }, { status: delivery.state === "delivered" ? 200 : 502 });
  }

  const { data: transitionRows, error: transitionError } = await supabase.rpc("transition_email_notification", {
    p_notification_id: notificationId,
    p_action: payload.data.action
  });
  const transition = Array.isArray(transitionRows) ? transitionRows[0] : null;
  if (transitionError || !transition) {
    return NextResponse.json(
      { ok: false, message: "Could not update email notification." },
      { status: 500 }
    );
  }
  if (transition.transitioned !== true) {
    if (transition.error_code === "notification_not_found") {
      return NextResponse.json({ ok: false, message: "Email notification was not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: false, message: "Email notification cannot change in its current state." }, { status: 409 });
  }
  const notification = transition.notification;

  await writeAdminAuditLog(supabase, {
    actorId: adminAccess.userId,
    action: "email_notification_" + payload.data.action,
    entityType: "email_notification",
    entityId: notificationId,
    beforeData: emailNotificationAuditSnapshot(beforeNotification),
    afterData: emailNotificationAuditSnapshot(notification)
  });

  return NextResponse.json({ ok: true, mode: "supabase", notification });
}
