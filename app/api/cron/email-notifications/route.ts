import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/server/email-cron-auth";
import {
  dispatchEmailNotifications,
  type EmailNotificationDispatchRepository
} from "@/lib/server/email-notification-dispatcher";
import { hasEmailProviderConfig, sendTransactionalEmail } from "@/lib/server/email-provider";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  if (!hasSupabaseServiceRoleConfig() || !hasEmailProviderConfig()) {
    return NextResponse.json({ ok: false, message: "Service unavailable." }, { status: 503 });
  }

  try {
    const repository = createSupabaseServiceRoleClient() as unknown as EmailNotificationDispatchRepository;
    const summary = await dispatchEmailNotifications(repository, sendTransactionalEmail);
    return NextResponse.json({
      ok: true,
      scanned: summary.scanned,
      delivered: summary.delivered,
      failed: summary.failed,
      conflicted: summary.conflicted
    });
  } catch {
    return NextResponse.json({ ok: false, message: "Could not process email notifications." }, { status: 500 });
  }
}
