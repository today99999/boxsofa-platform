import { NextResponse } from "next/server";
import { getEmailProviderStatus, hasEmailProviderConfig } from "@/lib/server/email-provider";
import { hasStripeConfig } from "@/lib/server/stripe";
import { hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const emailProviderStatus = getEmailProviderStatus();

  return NextResponse.json({
    ok: true,
    service: "boxsofa-platform",
    checkedAt: new Date().toISOString(),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "not_configured",
    supabaseConfigured: hasSupabaseServiceRoleConfig(),
    emailProviderConfigured: hasEmailProviderConfig(),
    emailProviderStatus,
    paymentEnabled: hasStripeConfig()
  });
}
