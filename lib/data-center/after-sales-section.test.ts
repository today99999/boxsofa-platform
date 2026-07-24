import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const section = readFileSync(
  new URL("../../components/data-center/AfterSalesSection.tsx", import.meta.url),
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
const types = readFileSync(
  new URL("./types.ts", import.meta.url),
  "utf8"
);

test("after-sales application loads one bounded real case set and filters it locally", () => {
  assert.match(section, /fetch\("\/api\/admin\/after-sales\?limit=200"/);
  assert.match(section, /result\.cases\.length > 200/);
  assert.match(section, /item\.caseNumber\.toLocaleLowerCase\(\)\.includes\(query\)/);
  assert.match(section, /item\.orderNumber\.toLocaleLowerCase\(\)\.includes\(query\)/);
  assert.match(section, /item\.customerName\.toLocaleLowerCase\(\)\.includes\(query\)/);
  assert.doesNotMatch(section, /searchParams\.set\("search"/);
  assert.doesNotMatch(section, /[?&]search=/);
});

test("after-sales application exposes explicit request and empty states", () => {
  assert.match(section, /type RequestState = "loading" \| "ready" \| "error"/);
  assert.match(section, /正在载入售后工单/);
  assert.match(section, /售后工单载入失败/);
  assert.match(section, /还没有售后工单/);
  assert.match(section, /没有符合筛选条件的工单/);
  assert.match(section, /setReloadVersion/);
});

test("case mutations preserve drafts, send versions, and confirm before network calls", () => {
  const createConfirm = section.indexOf("const confirmed = window.confirm");
  const createFetch = section.indexOf('fetch("/api/admin/after-sales"', createConfirm);
  assert.ok(createConfirm >= 0 && createConfirm < createFetch);
  assert.match(section.slice(createConfirm, createFetch), /if \(!confirmed\) return/);

  const terminalConfirm = section.indexOf("terminalStatuses.has(editDraft.status)");
  const patchFetch = section.indexOf("method: \"PATCH\"", terminalConfirm);
  assert.ok(terminalConfirm >= 0 && terminalConfirm < patchFetch);
  assert.match(section.slice(terminalConfirm, patchFetch), /return;/);
  assert.match(section, /version: selectedCase\.version/);
  assert.match(section, /if \(editDraft\.status !== selectedCase\.status\) changes\.status/);
  assert.match(section, /Object\.keys\(changes\)\.length === 1/);
  assert.match(section, /已保留填写内容/);
  assert.match(section, /已保留编辑内容/);
});

test("refund entry is explicit bookkeeping and never calls a Stripe endpoint", () => {
  assert.match(section, /记录退款金额（EUR）/);
  assert.match(section, /仅作售后台账记录，不会触发 Stripe 退款/);
  assert.doesNotMatch(section, /fetch\([^)]*stripe/i);
});

test("after-sales API response types include every mapped field", () => {
  for (const field of ["responsibility", "requestedRemedy", "internalNote", "version"]) {
    assert.match(types, new RegExp(`${field}:`));
  }
  assert.match(types, /AfterSalesListResponse/);
  assert.match(types, /AfterSalesMutationResponse/);
});

test("data center routes after-sales into the real section and keeps support reachable", () => {
  assert.match(app, /<AfterSalesSection \/>/);
  assert.match(app, /selectSection\("after-sales"\)/);
  assert.doesNotMatch(app, /id: "after-sales"[\s\S]{0,100}href: "\/admin\/support"/);
  assert.match(section, /href="\/admin\/support"/);
});

test("Madrid overdue display and 390px forms stay explicit", () => {
  assert.match(section, /timeZone: "Europe\/Madrid"/);
  assert.match(section, /Date\.parse\(item\.dueAt\) < Date\.now\(\)/);
  assert.match(styles, /@media \(max-width: 390px\)/);
  assert.match(styles, /\.dc-case-filters \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(styles, /\.dc-form-actions > button \{ width: 100%; \}/);
  assert.match(section, /className=\{`dc-case-row[\s\S]*type="button"/);
});

test("after-sales saves reject stale UI responses and duplicate submissions", () => {
  assert.match(section, /selectedIdRef\.current === caseId/);
  assert.match(section, /saveMutationId\.current/);
  assert.match(section, /saveInFlight\.current/);
  assert.match(section, /createInFlight\.current/);
});

test("after-sales editor follows the canonical workflow and maps business failures", () => {
  assert.match(section, /canTransitionAfterSalesStatus/);
  assert.match(section, /statusOptions\.length === 1/);
  assert.match(section, /code === "invalid_transition"/);
  assert.match(section, /code === "refund_not_verified"/);
  assert.match(section, /status === 409/);
});

test("equivalent refund amounts compare exact cents before mutation", () => {
  assert.match(section, /parseRefundAmountEur\(nextRefundText\)/);
  assert.match(section, /nextRefundCents !== currentRefundCents/);
});
