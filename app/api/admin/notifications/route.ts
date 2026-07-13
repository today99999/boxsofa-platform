import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/server/admin-auth";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type EmailNotificationRow = {
  id: string;
  order_id: string | null;
  order_number: string;
  customer_email: string;
  event: string;
  subject: string;
  preview_text: string;
  body_text: string;
  provider: string;
  status: string;
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET() {
  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
  }

  const adminAccess = await requireAdminAccess();
  if (!adminAccess.ok) {
    return NextResponse.json({ ok: false, message: "Merchant login is required." }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("email_notifications")
    .select("id, order_id, order_number, customer_email, event, subject, preview_text, body_text, provider, status, attempts, last_error, sent_at, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(120);

  if (error) {
    return NextResponse.json(
      { ok: false, message: "Could not load email notifications.", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, mode: "supabase", notifications: (data || []) as EmailNotificationRow[] });
}
