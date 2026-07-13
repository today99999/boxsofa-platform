import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  hasSupabasePublicConfig,
  hasSupabaseServiceRoleConfig
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const customerProfileSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(60).optional(),
  preferredLocale: z.enum(["zh", "en", "es", "fr", "de"]).optional(),
  marketingConsent: z.boolean().optional(),
  address: z
    .object({
      recipient: z.string().trim().max(120).optional(),
      phone: z.string().trim().max(60).optional(),
      countryCode: z.string().trim().min(2).max(2).optional(),
      line1: z.string().trim().max(220).optional(),
      line2: z.string().trim().max(220).optional(),
      city: z.string().trim().max(120).optional(),
      province: z.string().trim().max(120).optional(),
      postalCode: z.string().trim().max(40).optional()
    })
    .optional()
});

async function getCurrentUser() {
  if (!hasSupabasePublicConfig() || !hasSupabaseServiceRoleConfig()) {
    return { mode: "local" as const, user: null };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { mode: "supabase" as const, user: null };
  }

  return { mode: "supabase" as const, user };
}

export async function GET() {
  const current = await getCurrentUser();
  if (!current.user) {
    if (current.mode === "local") {
      return NextResponse.json({ ok: true, mode: "local", profile: null, address: null });
    }

    return NextResponse.json(
      { ok: false, mode: "supabase", message: "Customer login is required.", profile: null, address: null },
      { status: 401 }
    );
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, preferred_locale, total_paid_eur, is_member, member_since, marketing_consent")
    .eq("id", current.user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { ok: false, message: "Could not load customer profile.", detail: profileError.message },
      { status: 500 }
    );
  }

  const { data: address, error: addressError } = await supabase
    .from("addresses")
    .select("id, country_code, recipient, phone, line1, line2, city, province, postal_code, is_default")
    .eq("customer_id", current.user.id)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (addressError) {
    return NextResponse.json(
      { ok: false, message: "Could not load customer address.", detail: addressError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    mode: "supabase",
    profile: profile ?? {
      id: current.user.id,
      email: current.user.email,
      full_name: current.user.user_metadata?.full_name ?? "",
      phone: "",
      preferred_locale: "en",
      total_paid_eur: 0,
      is_member: false,
      member_since: null,
      marketing_consent: false
    },
    address: address ?? null
  });
}

export async function PUT(request: Request) {
  const current = await getCurrentUser();
  if (!current.user) {
    return NextResponse.json({ ok: false, message: "Customer login is required." }, { status: 401 });
  }

  const payload = customerProfileSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json(
      { ok: false, message: "Customer profile information is incomplete.", issues: payload.error.flatten() },
      { status: 400 }
    );
  }

  const input = payload.data;
  const supabase = createSupabaseServiceRoleClient();
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: current.user.id,
    email: current.user.email ?? "",
    full_name: input.fullName ?? "",
    phone: input.phone ?? "",
    preferred_locale: input.preferredLocale ?? "en",
    marketing_consent: input.marketingConsent ?? false,
    last_login_at: new Date().toISOString()
  });

  if (profileError) {
    return NextResponse.json(
      { ok: false, message: "Could not save customer profile.", detail: profileError.message },
      { status: 500 }
    );
  }

  const address = input.address;
  const hasAddress =
    address &&
    (address.recipient || address.phone || address.line1 || address.city || address.province || address.postalCode);

  if (hasAddress && address) {
    const { data: existingAddress, error: addressLoadError } = await supabase
      .from("addresses")
      .select("id")
      .eq("customer_id", current.user.id)
      .eq("is_default", true)
      .maybeSingle();

    if (addressLoadError) {
      return NextResponse.json(
        { ok: false, message: "Could not load customer address.", detail: addressLoadError.message },
        { status: 500 }
      );
    }

    const addressRow = {
      customer_id: current.user.id,
      country_code: (address.countryCode || "ES").toUpperCase(),
      recipient: address.recipient || input.fullName || current.user.email || "Customer",
      phone: address.phone || input.phone || "",
      line1: address.line1 || "",
      line2: address.line2 || "",
      city: address.city || "",
      province: address.province || "",
      postal_code: address.postalCode || "",
      is_default: true
    };

    const addressResult = existingAddress
      ? await supabase.from("addresses").update(addressRow).eq("id", existingAddress.id)
      : await supabase.from("addresses").insert(addressRow);

    if (addressResult.error) {
      return NextResponse.json(
        { ok: false, message: "Could not save customer address.", detail: addressResult.error.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, mode: "supabase" });
}
