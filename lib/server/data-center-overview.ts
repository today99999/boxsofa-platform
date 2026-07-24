import { calculateCommerceMetrics, calculateCommerceMetricsFromCents, type CommerceMetricInput } from "../data-center/metrics.ts";
import type { DataCenterOverview, DataFreshness, DashboardAlert } from "../data-center/types.ts";
import type { createSupabaseServiceRoleClient } from "../supabase/server.ts";

const MADRID_TIME_ZONE = "Europe/Madrid";
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

export type OverviewAggregateRow = {
  paid_gmv_cents: number | string;
  succeeded_refund_cents: number | string;
  paid_order_count: number | string;
  unique_visitor_count: number | string;
  open_after_sales_count: number | string;
};

export class DataCenterOverviewLoadError extends Error {
  readonly sourceKey: string;
  readonly reason: "query_failed";

  constructor(sourceKey: string, reason: "query_failed" = "query_failed") {
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

export function buildOverviewMetricsFromAggregate(row: OverviewAggregateRow) {
  return calculateCommerceMetricsFromCents({
    paidGmvCents: asSafeCents(row.paid_gmv_cents),
    succeededRefundCents: asSafeCents(row.succeeded_refund_cents),
    paidOrders: asSafeCount(row.paid_order_count),
    uniqueVisitors: asSafeCount(row.unique_visitor_count)
  });
}

export function toPublicOverviewErrorMessage(_error: unknown) {
  return OVERVIEW_ERROR_MESSAGE;
}

export async function loadDataCenterOverview(rangeValue: string | null): Promise<DataCenterOverview> {
  const range = getOverviewDateRange(rangeValue);
  const { createSupabaseServiceRoleClient } = await import("../supabase/server.ts");
  const supabase = createSupabaseServiceRoleClient();
  const [aggregateResult, alertsResult, healthResult] = await Promise.all([
    supabase.rpc("get_data_center_overview", { p_start_at: range.startAt, p_end_at: range.endAt }),
    supabase
      .from("dashboard_alerts")
      .select("id, alert_type, severity, title, detail, entity_type, entity_id, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("data_source_health")
      .select("source_key, state, last_success_at, record_count, last_error")
      .order("source_key")
  ]);

  const sourceFailure = getOverviewSourceFailure([
    ["overview", aggregateResult.error],
    ["orders", alertsResult.error],
    ["orders", healthResult.error]
  ]);
  if (sourceFailure) {
    await markOverviewSourceFailure(supabase);
    throw sourceFailure;
  }

  const aggregate = Array.isArray(aggregateResult.data) ? aggregateResult.data[0] : null;
  if (!aggregate) {
    await markOverviewSourceFailure(supabase);
    throw new DataCenterOverviewLoadError("overview");
  }

  const aggregateRow = aggregate as OverviewAggregateRow;
  const paidOrderCount = asSafeCount(aggregateRow.paid_order_count);
  const visitors = asSafeCount(aggregateRow.unique_visitor_count);
  const now = new Date().toISOString();
  const ordersHealthCurrent = await markOrdersHealthCurrent(supabase, paidOrderCount, now);

  return {
    range: range.key,
    metrics: buildOverviewMetricsFromAggregate(aggregateRow),
    visitors,
    openAfterSales: asSafeCount(aggregateRow.open_after_sales_count),
    alerts: toAlerts(alertsResult.data ?? []),
    freshness: toFreshness(healthResult.data ?? [], now, paidOrderCount, ordersHealthCurrent)
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
  return failed ? new DataCenterOverviewLoadError(failed[0]) : null;
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

async function markOverviewSourceFailure(supabase: ServiceClient) {
  const now = new Date().toISOString();
  await Promise.all([
    ["orders", "database"],
    ["website_analytics", "website"],
    ["stripe", "stripe"]
  ].map(async ([sourceKey, sourceType]) => {
    await supabase.from("data_source_health").upsert(
      {
        source_key: sourceKey,
        source_type: sourceType,
        state: "failed",
        last_attempt_at: now,
        last_error: "overview_query_failed"
      },
      { onConflict: "source_key" }
    );
  }));
}

function asSafeCents(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new DataCenterOverviewLoadError("overview");
  }
  return parsed;
}

function asSafeCount(value: number | string): number {
  return asSafeCents(value);
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
    const state = publicHealthState(row.state);
    return {
      sourceKey,
      label: labels[sourceKey],
      state,
      lastSuccessAt: typeof row.last_success_at === "string" ? row.last_success_at : null,
      recordCount: Number(row.record_count ?? 0),
      ...(typeof row.last_error === "string" ? { message: publicHealthMessage(state) } : {})
    } satisfies DataFreshness;
  });
}

function publicHealthState(value: unknown): DataFreshness["state"] {
  return value === "current" ||
    value === "delayed" ||
    value === "failed" ||
    value === "disconnected" ||
    value === "manual" ||
    value === "partial"
    ? value
    : "failed";
}

function publicHealthMessage(state: DataFreshness["state"]) {
  const messages: Record<DataFreshness["state"], string> = {
    current: "数据源运行正常。",
    delayed: "数据同步存在延迟。",
    failed: "最近一次数据同步失败。",
    disconnected: "数据源尚未连接。",
    manual: "此数据源需要手动更新。",
    partial: "当前仅有部分数据可用。"
  };
  return messages[state];
}
