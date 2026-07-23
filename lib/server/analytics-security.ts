import {
  createAnalyticsAttributionService,
  type AnalyticsAttributionService
} from "./analytics-attribution.ts";

export function createRuntimeAnalyticsSecurity(): AnalyticsAttributionService | null {
  const secret = process.env.ANALYTICS_TOKEN_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return null;

  try {
    return createAnalyticsAttributionService(secret);
  } catch {
    return null;
  }
}
