import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const overview = readFileSync(
  new URL("../../components/data-center/OverviewSection.tsx", import.meta.url),
  "utf8"
);
const freshness = readFileSync(
  new URL("../../components/data-center/DataFreshness.tsx", import.meta.url),
  "utf8"
);
const app = readFileSync(
  new URL("../../components/data-center/DataCenterApp.tsx", import.meta.url),
  "utf8"
);
const styles = readFileSync(
  new URL("../../app/data-center/data-center.css", import.meta.url),
  "utf8"
);
const overviewServer = readFileSync(
  new URL("../server/data-center-overview.ts", import.meta.url),
  "utf8"
);

test("operations cockpit only loads bounded ranges from the real owner API", () => {
  assert.match(overview, /"today"/);
  assert.match(overview, /"7d"/);
  assert.match(overview, /"30d"/);
  assert.match(overview, /fetch\(`\/api\/admin\/data-center\/overview\?range=\$\{selectedRange\}`/);
  assert.match(overview, /payload\.overview/);
  assert.doesNotMatch(overview, /\b(mock|demo|sample|fallback)\b/i);
});

test("operations cockpit renders all six requested metrics from the response", () => {
  for (const field of [
    "overview.metrics.gmvEur",
    "overview.metrics.netSalesEur",
    "overview.metrics.paidOrders",
    "overview.visitors",
    "overview.metrics.conversionRate",
    "overview.openAfterSales"
  ]) {
    assert.ok(overview.includes(field), `missing real metric field ${field}`);
  }
  assert.match(overview, /conversionRate === null \? "—"/);
  assert.match(overview, /money\.format/);
});

test("operations cockpit has stable request, empty, and authorization states", () => {
  assert.match(overview, /type RequestState = "loading" \| "ready" \| "error" \| "unauthorized" \| "forbidden"/);
  assert.match(overview, /<OverviewLoading \/>/);
  assert.match(overview, /setRequestVersion/);
  assert.match(overview, /当前区间还没有经营活动/);
  assert.match(overview, /href="\/login"/);
  assert.match(overview, /此账号没有店主权限/);
  assert.match(overview, /setOverview\(null\)/);
});

test("alerts and source freshness stay explicit and operational", () => {
  assert.match(overview, /critical: 0/);
  assert.match(overview, /warning: 1/);
  assert.match(overview, /info: 2/);
  assert.match(overview, /<DataFreshness/);
  assert.match(freshness, /timeZone: "Europe\/Madrid"/);
  assert.match(freshness, /尚未同步/);
  assert.match(freshness, /CircleCheck/);
  assert.match(freshness, /Unplug/);
});

test("shell persists non-sensitive section state in the URL", () => {
  assert.match(app, /searchParams\.get\("section"\)/);
  assert.match(app, /searchParams\.set\("section", section\)/);
  assert.match(app, /window\.history\.pushState/);
  assert.doesNotMatch(app, /localStorage|sessionStorage/);
});

test("range selection survives reload and browser history", () => {
  assert.match(overview, /searchParams\.get\("range"\)/);
  assert.match(overview, /searchParams\.set\("range", selectedRange\)/);
  assert.match(overview, /window\.addEventListener\("popstate", syncRange\)/);
  assert.match(overview, /if \(!rangeReady\) return/);
});

test("source health exposes only bounded public messages", () => {
  assert.match(overviewServer, /publicHealthState\(row\.state\)/);
  assert.match(overviewServer, /publicHealthMessage\(state\)/);
  assert.doesNotMatch(overviewServer, /message:\s*row\.last_error/);
  assert.match(overviewServer, /最近一次数据同步失败/);
});

test("cockpit keeps a two-column metric grid and fixed navigation at 390px", () => {
  assert.match(styles, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /@media \(max-width: 390px\)/);
  assert.match(styles, /\.dc-mobile-nav[\s\S]*position: fixed/);
  assert.match(styles, /\.dc-content \{ min-width: 0;/);
  assert.match(styles, /\.dc-range-control \{ width: 100%; \}/);
});
