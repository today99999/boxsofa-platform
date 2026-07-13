import { NextResponse } from "next/server";
import { z } from "zod";
import { sendTransactionalEmail } from "@/lib/server/email-provider";
import { writeAdminAuditLog } from "@/lib/server/admin-audit";
import { requireAdminAccess } from "@/lib/server/admin-auth";
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
    return NextResponse.json({ ok: true, mode: "local" });
  }

  const adminAccess = await requireAdminAccess();
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
      { ok: false, message: "Email notification was not found.", detail: loadError?.message },
      { status: 404 }
    );
  }

  if (payload.data.action === "send") {
    const sendResult = await sendTransactionalEmail({
      to: beforeNotification.customer_email,
      subject: beforeNotification.subject,
      text: beforeNotification.body_text
    });

    const sendUpdate = sendResult.ok
      ? {
          status: "sent",
          provider: sendResult.provider,
          attempts: (beforeNotification.attempts ?? 0) + 1,
          last_error: null,
          sent_at: new Date().toISOString()
        }
      : {
          status: "failed",
          provider: sendResult.provider,
          attempts: (beforeNotification.attempts ?? 0) + 1,
          last_error: sendResult.error || "Email sending failed.",
          sent_at: null
        };

    const { data: notification, error: updateError } = await supabase
      .from("email_notifications")
      .update(sendUpdate)
      .eq("id", notificationId)
      .select("id, order_number, customer_email, event, subject, preview_text, body_text, provider, status, attempts, last_error, sent_at, created_at, updated_at")
      .single();

    if (updateError || !notification) {
      return NextResponse.json(
        { ok: false, message: "Could not update email notification.", detail: updateError?.message },
        { status: 500 }
      );
    }

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
      message: sendResult.ok ? "Email notification sent." : sendResult.error || "Email sending failed."
    }, { status: sendResult.ok ? 200 : 502 });
  }

  const update = payload.data.action === "requeue"
    ? { status: "queued", provider: "pending", last_error: null, sent_at: null }
    : { status: "skipped", last_error: null, sent_at: null };

  const { data: notification, error: updateError } = await supabase
    .from("email_notifications")
    .update(update)
    .eq("id", notificationId)
    .select("id, order_number, customer_email, event, subject, preview_text, body_text, provider, status, attempts, last_error, sent_at, created_at, updated_at")
    .single();

  if (updateError || !notification) {
    return NextResponse.json(
      { ok: false, message: "Could not update email notification.", detail: updateError?.message },
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
