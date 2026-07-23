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
const analyticsSecurityMigration = readFileSync(
  new URL("../../supabase/migrations/202607230005_secure_analytics_attribution_and_maintenance.sql", import.meta.url),
  "utf8"
);
const consentIntentMigration = readFileSync(
  new URL("../../supabase/migrations/202607230006_database_ordered_consent_intents.sql", import.meta.url),
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
  const finalAnalyticsMigration = `${analyticsHardeningMigration}\n${analyticsFinalizationMigration}\n${analyticsSecurityMigration}`;
  for (const contract of [
    "add column if not exists revision bigint",
    "create unique index if not exists idx_analytics_consents_revision",
    "create table if not exists public.analytics_rate_limit_buckets",
    "create or replace function public.record_analytics_consent",
    "create or replace function public.consume_analytics_rate_limit",
    "create or replace function public.ingest_analytics_event",
    "pg_advisory_xact_lock(hashtextextended(p_visitor_id, 0))",
    "insert into public.analytics_rate_limit_buckets (bucket_key, window_started_at, request_count, expires_at)",
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

test("analytics security migration deterministically repairs historical consent order and limits owner reads", () => {
  for (const contract of [
    "lock table public.analytics_consents in access exclusive mode",
    "row_number() over (order by visitor_id, created_at, id)",
    "perform setval(",
    "analytics_consents_revision_seq",
    "create policy \"owners read analytics consents\"",
    "create policy \"owners read analytics events\"",
    "using ((select public.is_owner()))",
    "add column if not exists expires_at timestamptz",
    "create index if not exists idx_analytics_rate_limit_buckets_expires_at",
    "create or replace function public.cleanup_analytics_rate_limit_buckets",
    "for update skip locked",
    "exception when others then",
    "grant execute on function public.cleanup_analytics_rate_limit_buckets(integer) to service_role"
  ]) {
    assert.match(
      analyticsSecurityMigration.toLowerCase(),
      new RegExp(contract.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
});

test("bootstrap schema includes the hardened analytics ingestion contract", () => {
  for (const contract of [
    "create sequence if not exists public.analytics_consents_revision_seq",
    "add column if not exists revision bigint",
    "create table if not exists public.analytics_rate_limit_buckets",
    "create policy \"owners read analytics consents\"",
    "create policy \"owners read analytics events\"",
    "row_number() over (order by visitor_id, created_at, id)",
    "add column if not exists expires_at timestamptz",
    "create or replace function public.cleanup_analytics_rate_limit_buckets",
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

test("database-ordered consent intents are one-time, visitor-bound, and service-only", () => {
  for (const contract of [
    "create table if not exists public.analytics_consent_intents",
    "intent_revision bigint not null default nextval('public.analytics_consent_intent_revision_seq'::regclass)",
    "consumed_at timestamptz",
    "expires_at timestamptz not null",
    "add column if not exists intent_revision bigint",
    "row_number() over (order by revision, created_at, id)",
    "create or replace function public.issue_analytics_consent_intent",
    "create or replace function public.record_analytics_consent",
    "pg_advisory_xact_lock(hashtextextended(p_visitor_id, 0))",
    "intent_revision <= coalesce(v_current_intent_revision, 0)",
    "consumed_at is not null",
    "revoke all on function public.issue_analytics_consent_intent(text) from public, anon, authenticated",
    "grant execute on function public.issue_analytics_consent_intent(text) to service_role",
    "grant execute on function public.record_analytics_consent(text, text, text, text, uuid) to service_role"
  ]) {
    assert.match(
      consentIntentMigration.toLowerCase(),
      new RegExp(contract.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
});

test("bootstrap schema matches the final database-ordered consent intent contract", () => {
  for (const contract of [
    "create table if not exists public.analytics_consent_intents",
    "add column if not exists intent_revision bigint",
    "create or replace function public.issue_analytics_consent_intent",
    "create or replace function public.record_analytics_consent",
    "p_intent_id uuid",
    "consumed_at is not null",
    "grant execute on function public.issue_analytics_consent_intent(text) to service_role",
    "grant execute on function public.record_analytics_consent(text, text, text, text, uuid) to service_role"
  ]) {
    assert.match(
      bootstrapSchema.toLowerCase(),
      new RegExp(contract.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
});
