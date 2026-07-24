import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  hasSupabasePublicConfig,
  hasSupabaseServiceRoleConfig
} from "@/lib/supabase/server";
import { isOwnerAdminRole } from "./admin-roles";

export async function requireAdminAccess() {
  if (!hasSupabasePublicConfig() || !hasSupabaseServiceRoleConfig()) {
    return { ok: false as const, reason: "supabase_not_configured" as const };
  }

  const supabase = await createSupabaseServerClient();
  let user;
  let userError;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    userError = result.error;
  } catch {
    return { ok: false as const, reason: "not_authenticated" as const };
  }

  if (userError || !user) {
    return { ok: false as const, reason: "not_authenticated" as const };
  }

  const serviceSupabase = createSupabaseServiceRoleClient();
  const { data: profile, error: profileError } = await serviceSupabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || !isOwnerAdminRole(profile.role)) {
    return { ok: false as const, reason: "not_authorized" as const };
  }

  return { ok: true as const, userId: user.id, email: user.email ?? "", role: profile.role as "owner" };
}

export async function requireOwnerAccess() {
  const access = await requireAdminAccess();
  if (!access.ok) return access;
  return access;
}
