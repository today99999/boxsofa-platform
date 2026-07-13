import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  hasSupabasePublicConfig,
  hasSupabaseServiceRoleConfig
} from "@/lib/supabase/server";

const ADMIN_ROLES = new Set(["owner", "service"]);

export async function requireAdminAccess() {
  if (!hasSupabasePublicConfig() || !hasSupabaseServiceRoleConfig()) {
    return { ok: false as const, reason: "supabase_not_configured" as const };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false as const, reason: "not_authenticated" as const };
  }

  const serviceSupabase = createSupabaseServiceRoleClient();
  const { data: profile, error: profileError } = await serviceSupabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) {
    return { ok: false as const, reason: "not_authorized" as const };
  }

  return { ok: true as const, userId: user.id, role: profile.role as "owner" | "service" };
}
