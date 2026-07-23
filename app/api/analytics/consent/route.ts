import {
  createAnalyticsConsentHandler,
  createAnalyticsConsentStatusHandler,
  createSupabaseAnalyticsRepository,
  createUnavailableAnalyticsRepository
} from "@/lib/server/analytics-ingestion";
import { createRuntimeAnalyticsSecurity } from "@/lib/server/analytics-security";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function attributionService() {
  return createRuntimeAnalyticsSecurity();
}

export async function GET(request: Request) {
  return createAnalyticsConsentStatusHandler({ attributionService: attributionService() })(request);
}

export async function POST(request: Request) {
  return createAnalyticsConsentHandler({
    repository: hasSupabaseServiceRoleConfig()
      ? createSupabaseAnalyticsRepository(createSupabaseServiceRoleClient())
      : createUnavailableAnalyticsRepository(),
    attributionService: attributionService()
  })(request);
}
