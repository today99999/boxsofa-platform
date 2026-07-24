import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canTransitionAfterSalesStatus,
  createAfterSalesCaseNumber,
  eurToCents
} from "./after-sales.ts";

const migration = readFileSync(
  new URL("../../supabase/migrations/202607240018_after_sales_foundation.sql", import.meta.url),
  "utf8"
);
const createRoute = readFileSync(
  new URL("../../app/api/admin/after-sales/route.ts", import.meta.url),
  "utf8"
);
const patchRoute = readFileSync(
  new URL("../../app/api/admin/after-sales/[caseId]/route.ts", import.meta.url),
  "utf8"
);

test("after-sales case numbers are recognizable and collision-resistant per timestamp", () => {
  assert.equal(createAfterSalesCaseNumber(1784820000000, () => 0), "AS-4820000000-000000");
  assert.match(createAfterSalesCaseNumber(1784820000000, () => 0.5), /^AS-\d{10}-[A-Z0-9]{6}$/);
  assert.notEqual(
    createAfterSalesCaseNumber(1784820000000, () => 0.1),
    createAfterSalesCaseNumber(1784820000000, () => 0.2)
  );
});

test("after-sales workflow prevents terminal and backward transitions", () => {
  assert.equal(canTransitionAfterSalesStatus("requested", "reviewing"), true);
  assert.equal(canTransitionAfterSalesStatus("reviewing", "requested"), false);
  assert.equal(canTransitionAfterSalesStatus("refunded", "reviewing"), false);
});

test("after-sales amounts remain exact integer cents", () => {
  assert.equal(eurToCents(12.34), 1234);
  assert.equal(eurToCents(0.1 + 0.2), null);
  assert.equal(eurToCents(-1), null);
});

test("after-sales database contract serializes case numbers, audits writes, and protects updates", () => {
  for (const contract of [
    "create sequence if not exists public.after_sales_case_number_seq",
    "nextval('public.after_sales_case_number_seq')",
    "for update;",
    "add column if not exists version bigint not null default 1",
    "v_case.version <> p_expected_version",
    "insert into public.admin_audit_log",
    "v_case.status in ('refunded', 'resolved', 'rejected')",
    "v_successful_refund_cents",
    "v_other_case_refund_cents",
    "pg_advisory_xact_lock(hashtextextended('after-sales-refund:'",
    "refund_not_verified",
    "grant execute on function public.create_after_sales_case",
    "grant execute on function public.update_after_sales_case",
    "to service_role"
  ]) {
    assert.match(migration.toLowerCase(), new RegExp(contract.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("after-sales routes authenticate before JSON parsing and keep pagination bounded", () => {
  for (const source of [createRoute, patchRoute]) {
    assert.ok(source.indexOf("requireOwnerAccess") < source.indexOf("await request.json()"));
    assert.match(source, /Invalid JSON body/);
    assert.doesNotMatch(source, /detail:\s*error\.message/);
  }
  assert.match(createRoute, /positiveInteger\(url\.searchParams\.get\("limit"\), 50, 200\)/);
  assert.match(createRoute, /\.order\("created_at"[\s\S]*?\.order\("id"/);
  assert.match(patchRoute, /z\.string\(\)\.uuid\(\)/);
});
