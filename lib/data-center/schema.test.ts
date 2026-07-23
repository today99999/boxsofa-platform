import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/202607230001_data_center_foundation.sql", import.meta.url),
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
      migration.toLowerCase(),
      new RegExp(contract.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
});
