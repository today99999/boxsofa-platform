import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isSafeOwnerSearchHref,
  normalizeOwnerSearchQuery,
  quotePostgrestIlikeValue
} from "./universal-search.ts";

const route = readFileSync(
  new URL("../../app/api/admin/data-center/search/route.ts", import.meta.url),
  "utf8"
);
const component = readFileSync(
  new URL("../../components/data-center/UniversalSearch.tsx", import.meta.url),
  "utf8"
);
const app = readFileSync(
  new URL("../../components/data-center/DataCenterApp.tsx", import.meta.url),
  "utf8"
);
const authAudit = readFileSync(
  new URL("../../scripts/api-auth-audit.mjs", import.meta.url),
  "utf8"
);

test("owner search trims and bounds Unicode queries", () => {
  assert.deepEqual(normalizeOwnerSearchQuery("  sofa  "), { ok: true, value: "sofa" });
  assert.equal(normalizeOwnerSearchQuery(" a ").ok, false);
  assert.equal(normalizeOwnerSearchQuery("a".repeat(101)).ok, false);
  assert.equal(normalizeOwnerSearchQuery("🛋️🛋️").ok, true);
  assert.equal(normalizeOwnerSearchQuery("😀".repeat(100)).ok, true);
  assert.equal(normalizeOwnerSearchQuery("😀".repeat(101)).ok, false);
});

test("PostgREST OR values quote grammar and escape LIKE wildcards", () => {
  const value = quotePostgrestIlikeValue('50%_off,x).id.neq.null\\"');
  assert.equal(value, '"%50\\%\\_off,x).id.neq.null\\\\\\"%"');
  assert.equal(value.startsWith('"'), true);
  assert.equal(value.endsWith('"'), true);
  assert.equal(value.split('"').length, 4);
});

test("search result navigation is constrained to known internal destinations", () => {
  for (const href of [
    "/admin/orders",
    "/admin/customers",
    "/admin/products",
    "/data-center?section=after-sales"
  ]) {
    assert.equal(isSafeOwnerSearchHref(href), true);
  }
  for (const href of ["https://evil.example", "//evil.example", "/login", "javascript:alert(1)"]) {
    assert.equal(isSafeOwnerSearchHref(href), false);
  }
});

test("search API authenticates before four bounded parallel database queries", () => {
  assert.match(route, /await requireOwnerAccess\(\)/);
  assert.ok(route.indexOf("await requireOwnerAccess()") < route.indexOf('from("orders")'));
  assert.match(route, /Promise\.all\(/);
  for (const table of ["orders", "profiles", "products", "after_sales_cases"]) {
    assert.match(route, new RegExp(`from\\("${table}"\\)`));
  }
  assert.equal(route.match(/\.limit\(8\)/g)?.length, 4);
  assert.match(route, /quotePostgrestIlikeValue/);
});

test("search API selects display-safe fields and fails closed on source errors", () => {
  const selectedFields = Array.from(route.matchAll(/\.select\("([^"]+)"\)/g), (match) => match[1]).join(",");
  for (const forbidden of [
    "address_snapshot",
    "payment_reference",
    "payment_method_note",
    "order_lookup_token",
    "internal_note",
    "reason",
    "evidence",
    "phone"
  ]) {
    assert.doesNotMatch(selectedFields, new RegExp(forbidden));
  }
  assert.match(route, /Search is temporarily unavailable\./);
  assert.doesNotMatch(route, /error\.message|error\.details|JSON\.stringify\(error/);
});

test("universal search implements accessible, race-safe keyboard interaction", () => {
  assert.match(component, /<Search/);
  assert.match(component, /aria-label="搜索订单、客户、产品和售后"/);
  assert.match(component, /role="combobox"/);
  assert.match(component, /setTimeout\([\s\S]*250/);
  assert.match(component, /new AbortController\(\)/);
  assert.match(component, /requestIdRef\.current/);
  assert.match(component, /isComposing/);
  assert.match(component, /onCompositionStart/);
  assert.match(component, /onCompositionEnd/);
  assert.ok(component.indexOf("setResults([])") < component.indexOf("window.setTimeout"));
  for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape"]) {
    assert.match(component, new RegExp(`"${key}"`));
  }
  assert.match(component, /role="group"/);
  assert.match(component, /正在搜索/);
  assert.match(component, /没有找到匹配结果/);
  assert.match(component, /搜索暂时不可用/);
  assert.match(component, /clearSearch\(\)/);
  assert.match(component, /isSafeOwnerSearchHref/);
});

test("universal search is mounted in the data center and covered by auth audit", () => {
  assert.match(app, /<UniversalSearch \/>/);
  assert.match(authAudit, /\/api\/admin\/data-center\/search\?q=test/);
});
