import {
  createAnalyticsConsentHandler,
  createSupabaseAnalyticsRepository,
  createUnavailableAnalyticsRepository
} from "@/lib/server/analytics-ingestion";
import { checkRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, { key: "analytics:consent", limit: 30, windowMs: 60_000 });
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit.resetAt);
  }

  return createAnalyticsConsentHandler({
    repository: hasSupabaseServiceRoleConfig()
      ? createSupabaseAnalyticsRepository(createSupabaseServiceRoleClient())
      : createUnavailableAnalyticsRepository()
  })(request);
}
