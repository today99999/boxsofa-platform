import {
  createAnalyticsEventHandler,
  createSupabaseAnalyticsRepository,
  createUnavailableAnalyticsRepository
} from "@/lib/server/analytics-ingestion";
import { checkRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, { key: "analytics:event", limit: 120, windowMs: 60_000 });
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit.resetAt);
  }

  return createAnalyticsEventHandler({
    repository: hasSupabaseServiceRoleConfig()
      ? createSupabaseAnalyticsRepository(createSupabaseServiceRoleClient())
      : createUnavailableAnalyticsRepository()
  })(request);
}
