import { NextResponse } from "next/server";
import { getEmailProviderStatus, hasEmailProviderConfig } from "@/lib/server/email-provider";
import { hasStripeConfig } from "@/lib/server/stripe";
import { hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";
import { localVerifyNonce } from "@/lib/server/local-verify";

export const dynamic = "force-dynamic";

export async function GET() {
  const emailProviderStatus = getEmailProviderStatus();

  const response = NextResponse.json({
    ok: true,
    service: "boxsofa-platform",
    checkedAt: new Date().toISOString(),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "not_configured",
    supabaseConfigured: hasSupabaseServiceRoleConfig(),
    emailProviderConfigured: hasEmailProviderConfig(),
    emailProviderStatus,
    paymentEnabled: hasStripeConfig()
  });
  const nonce = localVerifyNonce();
  if (nonce) {
    response.headers.set("X-BoxSofa-Local-Verify-Nonce", nonce);
  }
  return response;
}
