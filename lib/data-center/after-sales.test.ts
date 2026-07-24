import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  afterSalesMutationStatus,
  buildAfterSalesCursorPostgrestFilter,
  canTransitionAfterSalesStatus,
  decodeAfterSalesCursor,
  encodeAfterSalesCursor,
  eurToCents,
  formatAfterSalesCaseNumber,
  isFutureAfterSalesDueAt,
  normalizeAfterSalesCaseSearch,
  pageAfterSalesRows,
  parseRefundAmountEur
} from "./after-sales.ts";

const foundationMigration = readFileSync(
  new URL("../../supabase/migrations/202607240018_after_sales_foundation.sql", import.meta.url),
  "utf8"
);
const nullableRefundMigration = readFileSync(
  new URL("../../supabase/migrations/202607240019_after_sales_refund_amount_nullability.sql", import.meta.url),
  "utf8"
);
const finalRefundMigration = readFileSync(
  new URL("../../supabase/migrations/202607240020_after_sales_cumulative_refund_truth.sql", import.meta.url),
  "utf8"
);
const caseNumberMigration = readFileSync(
  new URL("../../supabase/migrations/202607240021_after_sales_cursor_and_case_number_safety.sql", import.meta.url),
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
const integrationScript = readFileSync(
  new URL("../../scripts/after-sales-integration.mjs", import.meta.url),
  "utf8"
);

const rows = [
  { id: "00000000-0000-4000-8000-000000000003", createdAt: "2026-07-24T10:00:00.000Z" },
  { id: "00000000-0000-4000-8000-000000000002", createdAt: "2026-07-24T09:00:00.000Z" },
  { id: "00000000-0000-4000-8000-000000000001", createdAt: "2026-07-24T08:00:00.000Z" }
];

test("after-sales cursor pagination is stable when a new row appears between pages", () => {
  const first = pageAfterSalesRows(rows, null, 2);
  assert.deepEqual(first.rows.map((row) => row.id), [rows[0].id, rows[1].id]);
  assert.ok(first.nextCursor);

  const insertedAfterFirstPage = [
    { id: "00000000-0000-4000-8000-000000000004", createdAt: "2026-07-24T11:00:00.000Z" },
    ...rows
  ];
  const second = pageAfterSalesRows(insertedAfterFirstPage, decodeAfterSalesCursor(first.nextCursor!), 2);
  assert.deepEqual(second.rows.map((row) => row.id), [rows[2].id]);
  assert.equal(new Set([...first.rows, ...second.rows].map((row) => row.id)).size, 3);
  assert.equal(second.nextCursor, null);
});

test("after-sales cursor uses the id as a descending tie breaker", () => {
  const atSameInstant = [
    { id: "00000000-0000-4000-8000-000000000003", createdAt: "2026-07-24T10:00:00.000Z" },
    { id: "00000000-0000-4000-8000-000000000002", createdAt: "2026-07-24T10:00:00.000Z" },
    { id: "00000000-0000-4000-8000-000000000001", createdAt: "2026-07-24T10:00:00.000Z" }
  ];
  const first = pageAfterSalesRows(atSameInstant, null, 2);
  const second = pageAfterSalesRows(atSameInstant, decodeAfterSalesCursor(first.nextCursor!), 2);
  assert.deepEqual(first.rows.map((row) => row.id), [atSameInstant[0].id, atSameInstant[1].id]);
  assert.deepEqual(second.rows.map((row) => row.id), [atSameInstant[2].id]);
  assert.equal(
    buildAfterSalesCursorPostgrestFilter(decodeAfterSalesCursor(first.nextCursor!)!),
    `created_at.lt.${atSameInstant[1].createdAt},and(created_at.eq.${atSameInstant[1].createdAt},id.lt.${atSameInstant[1].id})`
  );
});

test("after-sales cursors preserve PostgreSQL UTC microseconds without skipping rows", () => {
  const microsecondRows = [
    { id: "00000000-0000-4000-8000-000000000003", createdAt: "2026-07-24T10:00:00.123457+00:00" },
    { id: "00000000-0000-4000-8000-000000000002", createdAt: "2026-07-24T10:00:00.123456+00:00" },
    { id: "00000000-0000-4000-8000-000000000001", createdAt: "2026-07-24T10:00:00.123455+00:00" }
  ];
  const first = pageAfterSalesRows(microsecondRows, null, 2);
  const cursor = decodeAfterSalesCursor(first.nextCursor!);
  assert.deepEqual(cursor, { createdAt: microsecondRows[1].createdAt, id: microsecondRows[1].id });
  const second = pageAfterSalesRows(microsecondRows, cursor, 2);
  assert.deepEqual(second.rows.map((row) => row.id), [microsecondRows[2].id]);
});

test("after-sales cursors reject malformed and tampered values", () => {
  const cursor = encodeAfterSalesCursor(rows[0]);
  assert.deepEqual(decodeAfterSalesCursor(cursor), rows[0]);
  assert.equal(decodeAfterSalesCursor(`${cursor}!`), null);
  assert.equal(decodeAfterSalesCursor("eyJ2IjoyfQ"), null);
  assert.equal(decodeAfterSalesCursor("not-a-cursor"), null);
});

test("after-sales case search is a bounded literal case-number filter", () => {
  assert.deepEqual(normalizeAfterSalesCaseSearch(" AS-20260724-00000001 "), { ok: true, value: "AS-20260724-00000001" });
  assert.deepEqual(normalizeAfterSalesCaseSearch(null), { ok: true, value: null });
  assert.equal(normalizeAfterSalesCaseSearch("" ).ok, false);
  assert.equal(normalizeAfterSalesCaseSearch("AS_%").ok, false);
  assert.equal(normalizeAfterSalesCaseSearch("A".repeat(81)).ok, false);
});

test("after-sales refund amount parsing is exact at the mutation boundary", () => {
  for (const [input, cents] of [["0.29", 29], ["19.99", 1999], ["0.58", 58], ["2.55", 255], ["0", 0]] as const) {
    assert.deepEqual(parseRefundAmountEur(input), { ok: true, cents });
  }
  for (const input of [0.29, 19.99, 0.58, 2.55, 0.1 + 0.2]) {
    assert.notEqual(eurToCents(input), null);
  }
  for (const input of ["00.29", "0.123", "10000000000", -1, 0.123, 0.30000001, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(parseRefundAmountEur(input).ok, false);
  }
});

test("after-sales date and RPC error mapping remain explicit", () => {
  assert.equal(isFutureAfterSalesDueAt("2026-07-25T00:00:00.000Z", Date.parse("2026-07-24T00:00:00.000Z")), true);
  assert.equal(isFutureAfterSalesDueAt("2026-07-23T23:59:59.999Z", Date.parse("2026-07-24T00:00:00.000Z")), false);
  assert.equal(afterSalesMutationStatus("invalid_due_at"), 400);
  assert.equal(afterSalesMutationStatus("not_found"), 404);
  assert.equal(afterSalesMutationStatus("conflict"), 409);
  assert.equal(afterSalesMutationStatus("unexpected_database_error"), 500);
});

test("after-sales case numbers keep the full database sequence after eight digits", () => {
  const createdAt = new Date("2026-07-24T12:34:56.789Z");
  assert.equal(formatAfterSalesCaseNumber(createdAt, 1), "AS-20260724123456789-00000001");
  assert.equal(formatAfterSalesCaseNumber(createdAt, 99_999_999), "AS-20260724123456789-99999999");
  assert.equal(formatAfterSalesCaseNumber(createdAt, 100_000_000), "AS-20260724123456789-100000000");
});

test("after-sales workflow prevents terminal and backward transitions", () => {
  assert.equal(canTransitionAfterSalesStatus("requested", "reviewing"), true);
  assert.equal(canTransitionAfterSalesStatus("reviewing", "requested"), false);
  assert.equal(canTransitionAfterSalesStatus("refunded", "reviewing"), false);
});

test("after-sales migration history stays distinct while the final migration preserves refund truth", () => {
  assert.match(foundationMigration, /p_refund_amount_set and \(p_refund_amount_cents is null or p_refund_amount_cents < 0\)/);
  assert.doesNotMatch(foundationMigration, /v_other_case_refund_cents/);
  assert.match(nullableRefundMigration, /p_refund_amount_set and p_refund_amount_cents is not null and p_refund_amount_cents < 0/);
  assert.doesNotMatch(nullableRefundMigration, /v_other_case_refund_cents/);
  for (const contract of [
    "v_other_case_refund_cents",
    "pg_advisory_xact_lock(hashtextextended('after-sales-refund:'",
    "refund_not_verified"
  ]) {
    assert.match(finalRefundMigration.toLowerCase(), new RegExp(contract.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(caseNumberMigration, /v_case_sequence := nextval\('public\.after_sales_case_number_seq'\)/);
  assert.match(caseNumberMigration, /lpad\(v_case_sequence::text, greatest\(8, length\(v_case_sequence::text\)\), '0'\)/);
});

test("after-sales routes authenticate before JSON parsing and use a bounded keyset cursor", () => {
  for (const source of [createRoute, patchRoute]) {
    assert.ok(source.indexOf("requireOwnerAccess") < source.indexOf("await request.json()"));
    assert.match(source, /Invalid JSON body/);
    assert.doesNotMatch(source, /detail:\s*error\.message/);
  }
  assert.match(createRoute, /positiveInteger\(url\.searchParams\.get\("limit"\), 50, 200\)/);
  assert.match(createRoute, /\.limit\(limit \+ 1\)/);
  assert.match(createRoute, /buildAfterSalesCursorPostgrestFilter/);
  assert.doesNotMatch(createRoute, /\.range\(offset/);
  assert.match(createRoute, /query\.ilike\("case_number", `%\$\{search\.value\}%`\)/);
  assert.match(patchRoute, /parseRefundAmountEur/);
  assert.match(patchRoute, /isFutureAfterSalesDueAt/);
  assert.match(patchRoute, /afterSalesMutationStatus/);
  assert.match(patchRoute, /z\.string\(\)\.uuid\(\)/);
  assert.match(integrationScript, /RUN_SUPABASE_AFTER_SALES_INTEGRATION/);
  assert.match(integrationScript, /assertSafeStripeFinancialIntegrationTarget\(process\.env\)/);
  assert.match(integrationScript, /is_active: false/);
  assert.match(integrationScript, /AggregateError\(failures/);
});
