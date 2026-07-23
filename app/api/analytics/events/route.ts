import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const eventSchema = z.object({
  eventKey: z.string().trim().min(8).max(160),
  type: z.enum(["page_view", "product_view", "add_to_cart", "begin_checkout", "order_submit"]),
  createdAt: z.string().datetime(),
  visitorId: z.string().trim().min(8).max(120),
  sessionId: z.string().trim().min(8).max(120),
  path: z.string().trim().startsWith("/").max(500),
  source: z.string().trim().min(1).max(80),
  medium: z.string().trim().max(80).optional(),
  campaign: z.string().trim().max(160).optional(),
  referrerDomain: z.string().trim().max(255).optional(),
  deviceType: z.enum(["desktop", "mobile", "tablet"]).optional(),
  productName: z.string().trim().max(300).optional(),
  valueEur: z.number().nonnegative().optional()
});

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, { key: "analytics:event", limit: 120, windowMs: 60_000 });
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit.resetAt);
  }

  const payload = eventSchema.safeParse(await readJson(request));
  if (!payload.success) {
    return NextResponse.json({ ok: false, issues: payload.error.flatten() }, { status: 400 });
  }

  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 503 });
  }

  const event = payload.data;
  const supabase = createSupabaseServiceRoleClient();
  const { data: consent, error: consentError } = await supabase
    .from("analytics_consents")
    .select("id, consent")
    .eq("visitor_id", event.visitorId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (consentError) {
    return NextResponse.json({ ok: false, message: "Could not verify analytics consent." }, { status: 500 });
  }

  if (!consent || consent.consent !== "analytics") {
    return NextResponse.json({ ok: false, message: "Analytics consent is required." }, { status: 403 });
  }

  const { error } = await supabase.from("analytics_events").upsert({
    event_key: event.eventKey,
    event_type: event.type,
    created_at: event.createdAt,
    visitor_id: event.visitorId,
    session_id: event.sessionId,
    path: event.path,
    source: event.source,
    medium: event.medium ?? null,
    campaign: event.campaign ?? null,
    referrer_domain: event.referrerDomain ?? null,
    device_type: event.deviceType ?? null,
    product_name: event.productName ?? null,
    value_eur: event.valueEur ?? null,
    consent_id: consent.id
  }, { onConflict: "event_key", ignoreDuplicates: true });

  if (error) {
    return NextResponse.json({ ok: false, message: "Could not save analytics event." }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { error: healthError } = await supabase.from("data_source_health").upsert({
    source_key: "website_analytics",
    source_type: "website",
    state: "current",
    last_attempt_at: now,
    last_success_at: now,
    last_error: null
  }, { onConflict: "source_key" });

  if (healthError) {
    return NextResponse.json({ ok: false, message: "Could not update analytics health." }, { status: 500 });
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
