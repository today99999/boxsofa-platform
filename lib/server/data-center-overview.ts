import { calculateCommerceMetrics, type CommerceMetricInput } from "../data-center/metrics.ts";
import type { DataCenterOverview, DataFreshness, DashboardAlert } from "../data-center/types.ts";
import type { createSupabaseServiceRoleClient } from "../supabase/server.ts";

const MADRID_TIME_ZONE = "Europe/Madrid";
const ORDER_QUERY_LIMIT = 10_000;
const REFUND_QUERY_LIMIT = 10_000;
const VISITOR_QUERY_LIMIT = 50_000;
const OVERVIEW_ERROR_MESSAGE = "Could not load data center overview.";

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type OverviewRange = {
  key: "today" | "7d" | "30d";
  days: 1 | 7 | 30;
};

export type OverviewDateRange = OverviewRange & {
  startAt: string;
  endAt: string;
};

export class DataCenterOverviewLoadError extends Error {
  readonly sourceKey: string;
  readonly reason: "query_failed" | "result_limit_exceeded";

  constructor(sourceKey: string, reason: "query_failed" | "result_limit_exceeded") {
    super("Data center overview source is unavailable.");
    this.sourceKey = sourceKey;
    this.reason = reason;
  }
}

export function parseOverviewRange(value: string | null): OverviewRange {
  if (value === "today") return { key: "today", days: 1 };
  if (value === "30d") return { key: "30d", days: 30 };
  return { key: "7d", days: 7 };
}

export function getOverviewDateRange(value: string | null, now = new Date()): OverviewDateRange {
  const range = parseOverviewRange(value);
  const today = madridDateParts(now);
  const startDate = shiftCalendarDate(today, -(range.days - 1));
  const endDate = shiftCalendarDate(today, 1);
  return {
    ...range,
    startAt: madridMidnightToUtc(startDate).toISOString(),
    endAt: madridMidnightToUtc(endDate).toISOString()
  };
}

export function buildOverviewMetrics(input: CommerceMetricInput) {
  return calculateCommerceMetrics(input);
}

export function toPublicOverviewErrorMessage(_error: unknown) {
  return OVERVIEW_ERROR_MESSAGE;
}

export async function loadDataCenterOverview(rangeValue: string | null): Promise<DataCenterOverview> {
  const range = getOverviewDateRange(rangeValue);
  const { createSupabaseServiceRoleClient } = await import("../supabase/server.ts");
  const supabase = createSupabaseServiceRoleClient();
  const [ordersResult, visitorsResult, refundsResult, alertsResult, healthResult, afterSalesResult] = await Promise.all([
    supabase
      .from("orders")
      .select("id, payment_status, total_eur")
      .eq("payment_provider", "stripe")
      .in("payment_status", ["paid", "refunded"])
      .gte("paid_at", range.startAt)
      .lt("paid_at", range.endAt)
      .limit(ORDER_QUERY_LIMIT + 1),
    supabase
      .from("analytics_events")
      .select("visitor_id")
      .eq("event_type", "page_view")
      .gte("created_at", range.startAt)
      .lt("created_at", range.endAt)
      .limit(VISITOR_QUERY_LIMIT + 1),
    supabase
      .from("payment_refunds")
      .select("order_id, amount_eur")
      .eq("provider", "stripe")
      .eq("currency", "EUR")
      .eq("status", "succeeded")
      .gte("updated_at", range.startAt)
      .lt("updated_at", range.endAt)
      .limit(REFUND_QUERY_LIMIT + 1),
    supabase
      .from("dashboard_alerts")
      .select("id, alert_type, severity, title, detail, entity_type, entity_id, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("data_source_health")
      .select("source_key, state, last_success_at, record_count, last_error")
      .order("source_key"),
    supabase
      .from("after_sales_cases")
      .select("id", { count: "exact", head: true })
      .not("status", "in", '("resolved","rejected")')
  ]);

  const sourceFailure = getOverviewSourceFailure([
    ["orders", ordersResult.error],
    ["website_analytics", visitorsResult.error],
    ["stripe", refundsResult.error],
    ["orders", alertsResult.error],
    ["orders", afterSalesResult.error],
    ["orders", healthResult.error]
  ]);
  if (sourceFailure) {
    await markSourceHealthFailure(supabase, sourceFailure.sourceKey, "query_failed");
    throw sourceFailure;
  }

  if ((ordersResult.data?.length ?? 0) > ORDER_QUERY_LIMIT) {
    await markSourceHealthFailure(supabase, "orders", "result_limit_exceeded");
    throw new DataCenterOverviewLoadError("orders", "result_limit_exceeded");
  }
  if ((refundsResult.data?.length ?? 0) > REFUND_QUERY_LIMIT) {
    await markSourceHealthFailure(supabase, "stripe", "result_limit_exceeded");
    throw new DataCenterOverviewLoadError("stripe", "result_limit_exceeded");
  }
  if ((visitorsResult.data?.length ?? 0) > VISITOR_QUERY_LIMIT) {
    await markSourceHealthFailure(supabase, "website_analytics", "result_limit_exceeded");
    throw new DataCenterOverviewLoadError("website_analytics", "result_limit_exceeded");
  }

  const now = new Date().toISOString();
  const ordersHealthCurrent = await markOrdersHealthCurrent(supabase, ordersResult.data?.length ?? 0, now);
  const metrics = buildOverviewMetrics({
    orders: (ordersResult.data ?? []).map((order) => ({
      id: order.id,
      paymentStatus: order.payment_status,
      totalEur: Number(order.total_eur)
    })),
    refunds: (refundsResult.data ?? []).map((refund) => ({
      orderId: refund.order_id,
      amountEur: Number(refund.amount_eur),
      completed: true
    })),
    uniqueVisitors: new Set((visitorsResult.data ?? []).map((event) => event.visitor_id)).size
  });

  return {
    range: range.key,
    metrics,
    visitors: new Set((visitorsResult.data ?? []).map((event) => event.visitor_id)).size,
    openAfterSales: afterSalesResult.count ?? 0,
    alerts: toAlerts(alertsResult.data ?? []),
    freshness: toFreshness(healthResult.data ?? [], now, ordersResult.data?.length ?? 0, ordersHealthCurrent)
  };
}

function madridDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MADRID_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function shiftCalendarDate(value: { year: number; month: number; day: number }, offsetDays: number) {
  const shifted = new Date(Date.UTC(value.year, value.month - 1, value.day + offsetDays));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function madridMidnightToUtc(value: { year: number; month: number; day: number }) {
  const assumedUtcMidnight = new Date(Date.UTC(value.year, value.month - 1, value.day));
  const localized = new Intl.DateTimeFormat("en-CA", {
    timeZone: MADRID_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(assumedUtcMidnight);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(localized.find((part) => part.type === type)?.value);
  const localizedAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return new Date(assumedUtcMidnight.getTime() - (localizedAsUtc - assumedUtcMidnight.getTime()));
}

export function getOverviewSourceFailure(entries: Array<[string, { message?: string } | null]>) {
  const failed = entries.find(([, error]) => Boolean(error));
  return failed ? new DataCenterOverviewLoadError(failed[0], "query_failed") : null;
}

async function markOrdersHealthCurrent(supabase: ServiceClient, recordCount: number, now: string) {
  const { error } = await supabase.from("data_source_health").upsert(
    {
      source_key: "orders",
      source_type: "database",
      state: "current",
      last_attempt_at: now,
      last_success_at: now,
      last_error: null,
      record_count: recordCount
    },
    { onConflict: "source_key" }
  );
  return !error;
}

async function markSourceHealthFailure(supabase: ServiceClient, sourceKey: string, reason: "query_failed" | "result_limit_exceeded") {
  const sourceType = sourceKey === "stripe" ? "stripe" : sourceKey === "website_analytics" ? "website" : "database";
  await supabase.from("data_source_health").upsert(
    {
      source_key: sourceKey,
      source_type: sourceType,
      state: reason === "query_failed" ? "failed" : "partial",
      last_attempt_at: new Date().toISOString(),
      last_error: reason
    },
    { onConflict: "source_key" }
  );
}

function toAlerts(rows: Array<Record<string, unknown>>): DashboardAlert[] {
  const severityRank = { critical: 0, warning: 1, info: 2 } as const;
  return rows
    .map((row) => ({
      id: String(row.id),
      type: String(row.alert_type),
      severity: row.severity as DashboardAlert["severity"],
      title: String(row.title),
      detail: typeof row.detail === "string" ? row.detail : undefined,
      entityType: typeof row.entity_type === "string" ? row.entity_type : undefined,
      entityId: typeof row.entity_id === "string" ? row.entity_id : undefined,
      createdAt: String(row.created_at)
    }))
    .sort((left, right) => severityRank[left.severity] - severityRank[right.severity]);
}

function toFreshness(
  rows: Array<Record<string, unknown>>,
  now: string,
  orderCount: number,
  ordersHealthCurrent: boolean
): DataFreshness[] {
  const labels: Record<string, string> = {
    orders: "订单与付款",
    website_analytics: "网站分析",
    stripe: "Stripe 退款"
  };
  const bySource = new Map(rows.map((row) => [String(row.source_key), row]));

  return Object.keys(labels).map((sourceKey) => {
    if (sourceKey === "orders") {
      return {
        sourceKey,
        label: labels[sourceKey],
        state: ordersHealthCurrent ? "current" : "partial",
        lastSuccessAt: now,
        recordCount: orderCount,
        ...(ordersHealthCurrent ? {} : { message: "The health record could not be updated." })
      } satisfies DataFreshness;
    }
    const row = bySource.get(sourceKey);
    if (!row) {
      return {
        sourceKey,
        label: labels[sourceKey],
        state: "disconnected",
        lastSuccessAt: null,
        recordCount: 0,
        message: "No source health record is available."
      } satisfies DataFreshness;
    }
    return {
      sourceKey,
      label: labels[sourceKey],
      state: row.state as DataFreshness["state"],
      lastSuccessAt: typeof row.last_success_at === "string" ? row.last_success_at : null,
      recordCount: Number(row.record_count ?? 0),
      ...(typeof row.last_error === "string" ? { message: row.last_error } : {})
    } satisfies DataFreshness;
  });
}
