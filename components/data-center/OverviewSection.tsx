"use client";

import Link from "next/link";
import { AlertCircle, Info, RefreshCw, ShieldAlert, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardAlert, DataCenterOverview, DataFreshness as Freshness } from "@/lib/data-center/types";
import { DataFreshness } from "./DataFreshness";

type OverviewRange = DataCenterOverview["range"];
type RequestState = "loading" | "ready" | "error" | "unauthorized";

const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "EUR" });
const integer = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const percentage = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });
const alertTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Europe/Madrid",
  dateStyle: "short",
  timeStyle: "short"
});

const ranges: Array<{ value: OverviewRange; label: string }> = [
  { value: "today", label: "今天" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" }
];

const alertRank: Record<DashboardAlert["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isAlert(value: unknown): value is DashboardAlert {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DashboardAlert>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.type === "string" &&
    (candidate.severity === "critical" || candidate.severity === "warning" || candidate.severity === "info") &&
    typeof candidate.title === "string" &&
    typeof candidate.createdAt === "string"
  );
}

function isFreshness(value: unknown): value is Freshness {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Freshness>;
  return (
    typeof candidate.sourceKey === "string" &&
    typeof candidate.label === "string" &&
    ["current", "delayed", "failed", "disconnected", "manual", "partial"].includes(candidate.state ?? "") &&
    (candidate.lastSuccessAt === null || typeof candidate.lastSuccessAt === "string") &&
    isFiniteNumber(candidate.recordCount)
  );
}

function isOverview(value: unknown): value is DataCenterOverview {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DataCenterOverview>;
  const metrics = candidate.metrics;
  return (
    (candidate.range === "today" || candidate.range === "7d" || candidate.range === "30d") &&
    Boolean(metrics) &&
    isFiniteNumber(metrics?.gmvEur) &&
    isFiniteNumber(metrics?.netSalesEur) &&
    isFiniteNumber(metrics?.paidOrders) &&
    isFiniteNumber(metrics?.averageOrderValueEur) &&
    (metrics?.conversionRate === null || isFiniteNumber(metrics?.conversionRate)) &&
    isFiniteNumber(candidate.visitors) &&
    isFiniteNumber(candidate.openAfterSales) &&
    Array.isArray(candidate.alerts) &&
    candidate.alerts.every(isAlert) &&
    Array.isArray(candidate.freshness) &&
    candidate.freshness.every(isFreshness)
  );
}

function formatAlertTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : alertTime.format(date);
}

export function OverviewSection() {
  const [range, setRange] = useState<OverviewRange>("7d");
  const [requestState, setRequestState] = useState<RequestState>("loading");
  const [overview, setOverview] = useState<DataCenterOverview | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const requestId = useRef(0);

  const loadOverview = useCallback((selectedRange: OverviewRange, signal: AbortSignal, id: number) => {
    setRequestState("loading");
    setOverview(null);

    void fetch(`/api/admin/data-center/overview?range=${selectedRange}`, {
      credentials: "include",
      cache: "no-store",
      signal
    })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          if (id === requestId.current) setRequestState("unauthorized");
          return;
        }
        if (!response.ok) throw new Error("overview unavailable");
        const payload = await response.json() as { overview?: unknown };
        if (!isOverview(payload.overview) || payload.overview.range !== selectedRange) {
          throw new Error("invalid overview");
        }
        if (id !== requestId.current) return;
        setOverview(payload.overview);
        setRequestState("ready");
      })
      .catch((error: unknown) => {
        if (signal.aborted || id !== requestId.current) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRequestState("error");
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const id = ++requestId.current;
    loadOverview(range, controller.signal, id);
    return () => controller.abort();
  }, [loadOverview, range, requestVersion]);

  const alerts = useMemo(
    () => overview
      ? [...overview.alerts].sort((left, right) => {
        const severity = alertRank[left.severity] - alertRank[right.severity];
        if (severity !== 0) return severity;
        return Date.parse(right.createdAt) - Date.parse(left.createdAt);
      })
      : [],
    [overview]
  );

  const isEmpty = Boolean(
    overview &&
    overview.metrics.gmvEur === 0 &&
    overview.metrics.netSalesEur === 0 &&
    overview.metrics.paidOrders === 0 &&
    overview.visitors === 0 &&
    overview.openAfterSales === 0
  );

  return (
    <section className="dc-overview" aria-labelledby="dc-overview-heading">
      <div className="dc-overview-toolbar">
        <div>
          <h2 id="dc-overview-heading">经营概况</h2>
          <p>欧洲马德里时间</p>
        </div>
        <div className="dc-range-control" role="group" aria-label="数据统计区间">
          {ranges.map((item) => (
            <button
              key={item.value}
              type="button"
              className={range === item.value ? "is-active" : ""}
              aria-pressed={range === item.value}
              onClick={() => setRange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {requestState === "loading" && <OverviewLoading />}
      {requestState === "error" && (
        <OverviewMessage
          icon={AlertCircle}
          title="经营数据暂时无法载入"
          detail="连接数据源时出现问题，请稍后重试。"
          action={
            <button type="button" className="dc-retry-button" onClick={() => setRequestVersion((value) => value + 1)}>
              <RefreshCw aria-hidden size={16} />
              重新加载
            </button>
          }
        />
      )}
      {requestState === "unauthorized" && (
        <OverviewMessage
          icon={ShieldAlert}
          title="登录状态已失效"
          detail="重新登录店主账号后可继续查看经营数据。"
          action={<Link className="dc-retry-button" href="/login">前往登录</Link>}
        />
      )}
      {requestState === "ready" && overview && (
        <div className="dc-overview-ready">
          <div className="dc-metric-grid">
            <Metric label="GMV" value={money.format(overview.metrics.gmvEur)} />
            <Metric label="净销售额" value={money.format(overview.metrics.netSalesEur)} />
            <Metric label="已付款订单" value={integer.format(overview.metrics.paidOrders)} />
            <Metric label="独立访客" value={integer.format(overview.visitors)} />
            <Metric label="转化率" value={overview.metrics.conversionRate === null ? "—" : percentage.format(overview.metrics.conversionRate)} />
            <Metric label="待处理售后" value={integer.format(overview.openAfterSales)} />
          </div>

          {isEmpty && (
            <div className="dc-zero-state" role="status">
              当前区间还没有经营活动，以上均为实时返回的零值。
            </div>
          )}

          <div className="dc-operation-grid">
            <section className="dc-panel" aria-labelledby="dc-alerts-heading">
              <div className="dc-panel-heading">
                <div>
                  <h3 id="dc-alerts-heading">经营告警</h3>
                  <p>按处理优先级排序</p>
                </div>
                <span>{alerts.length}</span>
              </div>
              {alerts.length === 0 ? (
                <div className="dc-panel-empty">当前没有待处理告警</div>
              ) : (
                <ul className="dc-alert-list">
                  {alerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)}
                </ul>
              )}
            </section>

            <section className="dc-panel" aria-labelledby="dc-freshness-heading">
              <div className="dc-panel-heading">
                <div>
                  <h3 id="dc-freshness-heading">数据新鲜度</h3>
                  <p>各来源最近同步状态</p>
                </div>
              </div>
              {overview.freshness.length === 0 ? (
                <div className="dc-panel-empty">尚无数据源状态</div>
              ) : (
                <ul className="dc-freshness-list">
                  {overview.freshness.map((item) => <DataFreshness key={item.sourceKey} item={item} />)}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <section className="dc-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function AlertRow({ alert }: { alert: DashboardAlert }) {
  const Icon = alert.severity === "critical" ? AlertCircle : alert.severity === "warning" ? TriangleAlert : Info;
  const time = formatAlertTime(alert.createdAt);
  return (
    <li className={`dc-alert ${alert.severity}`}>
      <Icon aria-hidden size={18} />
      <span>
        <strong>{alert.title}</strong>
        {alert.detail && <small>{alert.detail}</small>}
      </span>
      {time && <time dateTime={alert.createdAt}>{time}</time>}
    </li>
  );
}

function OverviewLoading() {
  return (
    <div className="dc-overview-loading" aria-busy="true" aria-live="polite">
      <span className="dc-visually-hidden">正在载入经营数据</span>
      <div className="dc-metric-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <section className="dc-metric" key={index} aria-hidden="true">
            <span className="dc-skeleton dc-skeleton-label" />
            <strong className="dc-skeleton dc-skeleton-value" />
          </section>
        ))}
      </div>
      <div className="dc-operation-grid">
        <section className="dc-panel dc-panel-skeleton" aria-hidden="true"><span className="dc-skeleton" /></section>
        <section className="dc-panel dc-panel-skeleton" aria-hidden="true"><span className="dc-skeleton" /></section>
      </div>
    </div>
  );
}

function OverviewMessage({
  icon: Icon,
  title,
  detail,
  action
}: {
  icon: typeof AlertCircle;
  title: string;
  detail: string;
  action: React.ReactNode;
}) {
  return (
    <section className="dc-overview-message" role="alert">
      <Icon aria-hidden size={28} />
      <h2>{title}</h2>
      <p>{detail}</p>
      {action}
    </section>
  );
}
