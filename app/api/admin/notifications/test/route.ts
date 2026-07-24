import { NextResponse } from "next/server";
import { getEmailProviderStatus, sendTransactionalEmail } from "@/lib/server/email-provider";
import { writeAdminAuditLog } from "@/lib/server/admin-audit";
import { requireOwnerAccess } from "@/lib/server/admin-auth";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
  }

  const adminAccess = await requireOwnerAccess();
  if (!adminAccess.ok) {
    return NextResponse.json({ ok: false, message: "Merchant login is required." }, { status: 401 });
  }

  if (!adminAccess.email) {
    return NextResponse.json({ ok: false, message: "Merchant account email is missing." }, { status: 400 });
  }

  const providerStatus = getEmailProviderStatus();
  if (!providerStatus.configured) {
    return NextResponse.json(
      { ok: false, message: providerStatus.issues.join(" ") || "Email provider is not configured." },
      { status: 503 }
    );
  }

  const sentAt = new Date().toISOString();
  const sendResult = await sendTransactionalEmail({
    to: adminAccess.email,
    subject: "BoxSofa test email",
    text: [
      "BoxSofa email provider test",
      "",
      "This confirms that the production email sender is connected.",
      `Sent at: ${sentAt}`,
      "",
      "Payment remains disabled until the final Stripe step."
    ].join("\n")
  });

  const supabase = createSupabaseServiceRoleClient();
  await writeAdminAuditLog(supabase, {
    actorId: adminAccess.userId,
    action: sendResult.ok ? "email_test_sent" : "email_test_failed",
    entityType: "email_provider",
    entityId: null,
    beforeData: null,
    afterData: {
      to: adminAccess.email,
      provider: sendResult.provider,
      providerMessageId: sendResult.providerMessageId ?? null,
      error: sendResult.error ?? null
    }
  });

  return NextResponse.json(
    {
      ok: sendResult.ok,
      provider: sendResult.provider,
      message: sendResult.ok ? `Test email sent to ${adminAccess.email}.` : sendResult.error || "Email sending failed."
    },
    { status: sendResult.ok ? 200 : 502 }
  );
}
