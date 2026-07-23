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
const analyticsHardeningMigration = readFileSync(
  new URL("../../supabase/migrations/202607230003_harden_analytics_ingestion.sql", import.meta.url),
  "utf8"
);
const analyticsFinalizationMigration = readFileSync(
  new URL("../../supabase/migrations/202607230004_finalize_analytics_consent_lock.sql", import.meta.url),
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

test("analytics hardening migration keeps consent ordering, atomic ingestion, and service-only limits", () => {
  const finalAnalyticsMigration = `${analyticsHardeningMigration}\n${analyticsFinalizationMigration}`;
  for (const contract of [
    "add column if not exists revision bigint",
    "create unique index if not exists idx_analytics_consents_revision",
    "create table if not exists public.analytics_rate_limit_buckets",
    "create or replace function public.record_analytics_consent",
    "create or replace function public.consume_analytics_rate_limit",
    "create or replace function public.ingest_analytics_event",
    "pg_advisory_xact_lock(hashtextextended(p_visitor_id, 0))",
    "insert into public.analytics_rate_limit_buckets (bucket_key, window_started_at, request_count)",
    "on conflict (bucket_key) do nothing",
    "order by revision desc",
    "on conflict (event_key) do nothing",
    "grant execute on function public.record_analytics_consent",
    "grant execute on function public.consume_analytics_rate_limit",
    "grant execute on function public.ingest_analytics_event",
    "to service_role",
    "revoke all on function public.record_analytics_consent",
    "revoke all on function public.consume_analytics_rate_limit",
    "revoke all on function public.ingest_analytics_event"
  ]) {
    assert.match(
      finalAnalyticsMigration.toLowerCase(),
      new RegExp(contract.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
});

test("bootstrap schema includes the hardened analytics ingestion contract", () => {
  for (const contract of [
    "create sequence if not exists public.analytics_consents_revision_seq",
    "add column if not exists revision bigint",
    "create table if not exists public.analytics_rate_limit_buckets",
    "create or replace function public.record_analytics_consent",
    "create or replace function public.consume_analytics_rate_limit",
    "create or replace function public.ingest_analytics_event",
    "grant execute on function public.ingest_analytics_event",
    "to service_role"
  ]) {
    assert.match(
      bootstrapSchema.toLowerCase(),
      new RegExp(contract.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
});
