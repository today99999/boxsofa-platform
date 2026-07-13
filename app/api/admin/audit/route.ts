import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/server/admin-auth";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: unknown;
  after_data: unknown;
  created_at: string;
};

export async function GET() {
  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: true, mode: "local", logs: [] });
  }

  const adminAccess = await requireAdminAccess();
  if (!adminAccess.ok) {
    return NextResponse.json({ ok: false, message: "Merchant login is required." }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("id, actor_id, action, entity_type, entity_id, before_data, after_data, created_at")
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    return NextResponse.json(
      { ok: false, message: "Could not load admin audit logs.", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, mode: "supabase", logs: (data || []) as AuditLogRow[] });
}
