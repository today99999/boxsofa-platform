import {
  createAnalyticsConsentIntentHandler,
  createSupabaseAnalyticsRepository,
  createUnavailableAnalyticsRepository
} from "@/lib/server/analytics-ingestion";
import { createRuntimeAnalyticsSecurity } from "@/lib/server/analytics-security";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return createAnalyticsConsentIntentHandler({
    repository: hasSupabaseServiceRoleConfig()
      ? createSupabaseAnalyticsRepository(createSupabaseServiceRoleClient())
      : createUnavailableAnalyticsRepository(),
    attributionService: createRuntimeAnalyticsSecurity()
  })(request);
}
