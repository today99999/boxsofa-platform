import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  hasSupabasePublicConfig,
  hasSupabaseServiceRoleConfig
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasSupabasePublicConfig() || !hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Not signed in." }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, message: "Not signed in." }, { status: 401 });
  }

  const serviceSupabase = createSupabaseServiceRoleClient();
  const { data: profile, error: profileError } = await serviceSupabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { ok: false, message: "Could not load profile.", detail: profileError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    mode: "supabase",
    profile: profile ?? {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name ?? "",
      role: "customer"
    }
  });
}
