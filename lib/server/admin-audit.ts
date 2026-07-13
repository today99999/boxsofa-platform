import type { SupabaseClient } from "@supabase/supabase-js";

type AuditInput = {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
};

export async function writeAdminAuditLog(supabase: SupabaseClient, input: AuditInput) {
  const { error } = await supabase.from("admin_audit_log").insert({
    actor_id: input.actorId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    before_data: input.beforeData ?? null,
    after_data: input.afterData ?? null
  });

  if (error) {
    console.warn("BoxSofa admin audit log failed:", error.message);
  }
}
