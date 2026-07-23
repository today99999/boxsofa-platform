import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const consentSchema = z.object({
  visitorId: z.string().trim().min(8).max(120),
  consent: z.enum(["necessary", "analytics"]),
  locale: z.enum(["zh", "en", "es", "fr", "de"]).default("en"),
  version: z.string().trim().min(1).max(40)
});

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, { key: "analytics:consent", limit: 30, windowMs: 60_000 });
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit.resetAt);
  }

  const payload = consentSchema.safeParse(await readJson(request));
  if (!payload.success) {
    return NextResponse.json({ ok: false, issues: payload.error.flatten() }, { status: 400 });
  }

  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
  }

  const { error } = await createSupabaseServiceRoleClient().from("analytics_consents").insert({
    visitor_id: payload.data.visitorId,
    consent: payload.data.consent,
    locale: payload.data.locale,
    consent_version: payload.data.version
  });

  if (error) {
    return NextResponse.json({ ok: false, message: "Could not save consent." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
