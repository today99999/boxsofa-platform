import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const foundationMigration = readFileSync(
  new URL("../../supabase/migrations/202607230001_data_center_foundation.sql", import.meta.url),
  "utf8"
);
const ownerOnlyMigration = readFileSync(
  new URL("../../supabase/migrations/202607230002_data_center_owner_only_policies.sql", import.meta.url),
  "utf8"
);
const bootstrapSchema = readFileSync(
  new URL("../../supabase/schema.sql", import.meta.url),
  "utf8"
);

test("data center migration declares required tables and idempotency keys", () => {
  for (const contract of [
    "event_key text not null",
    "session_id text not null",
    "create table if not exists public.data_source_health",
    "create table if not exists public.dashboard_alerts",
    "create table if not exists public.after_sales_cases",
    "create table if not exists public.payment_refunds",
    "unique index if not exists idx_analytics_events_event_key"
  ]) {
    assert.match(
      foundationMigration.toLowerCase(),
      new RegExp(contract.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
});

test("data center migration makes analytics event contracts non-null", () => {
  for (const statement of [
    "alter table public.analytics_events alter column event_key set not null;",
    "alter table public.analytics_events alter column session_id set not null;"
  ]) {
    assert.match(foundationMigration.toLowerCase(), new RegExp(statement.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("data center tables are corrected to owner-only policies", () => {
  for (const table of [
    "data_source_health",
    "dashboard_alerts",
    "after_sales_cases",
    "payment_refunds"
  ]) {
    assert.match(
      ownerOnlyMigration,
      new RegExp(`create policy \\\"owners manage [^\\\"]+\\\" on public\\.${table}[\\s\\S]*?is_owner\\(\\)[\\s\\S]*?is_owner\\(\\)`, "i")
    );
  }
});

test("bootstrap schema matches the final owner-only data center policy state", () => {
  for (const table of [
    "data_source_health",
    "dashboard_alerts",
    "after_sales_cases",
    "payment_refunds"
  ]) {
    const policy = new RegExp(
      `create policy \\\"owners manage [^\\\"]+\\\" on public\\.${table}[\\s\\S]*?for all using \\(\\(select public\\.is_owner\\(\\)\\)\\) with check \\(\\(select public\\.is_owner\\(\\)\\)\\);`,
      "i"
    );
    assert.match(bootstrapSchema, policy);
  }
});
