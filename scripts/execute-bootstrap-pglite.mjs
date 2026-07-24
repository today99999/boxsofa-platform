import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const bootstrapPath = join(root, "supabase", "schema.sql");

// These exist only in the disposable in-memory database. They model the
// Supabase objects referenced by schema.sql; pgcrypto itself is a real PGlite
// extension rather than a stub. Do not grant application RPCs here: their
// ACLs must be created by the bootstrap SQL and verified below.
const supabaseBootstrapStubs = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid()
  returns uuid
  language sql
  stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role()
  returns text
  language sql
  stable
  as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  create role anon;
  create role authenticated;
  create role service_role;
  create publication supabase_realtime;
`;

export const publicBaseTables = [
  "profiles", "product_styles", "products", "product_media", "inventory_movements", "addresses",
  "orders", "order_items", "payments", "shipments", "product_reviews", "analytics_consents",
  "analytics_events", "data_source_health", "dashboard_alerts", "after_sales_cases", "payment_refunds",
  "newsletter_subscriptions", "chat_threads", "chat_messages", "email_notifications", "admin_audit_log",
  "analytics_rate_limit_buckets", "analytics_consent_intents", "analytics_consent_intent_heads", "stripe_webhook_events"
];

const coreFunctions = [
  "record_analytics_consent", "ingest_analytics_event", "get_data_center_overview", "record_stripe_refund",
  "record_stripe_checkout_payment", "create_after_sales_case", "update_after_sales_case", "transition_email_notification"
];

// These are the complete policy rows for every owner-only/internal table that
// contains financial, customer-support, analytics, or webhook data. Tables
// intentionally accessed only through SECURITY DEFINER RPCs are listed with
// no policy rows so a later permissive policy cannot slip through unnoticed.
export const sensitivePolicyTables = [
  "payments", "payment_refunds", "email_notifications", "after_sales_cases",
  "analytics_events", "analytics_consents", "analytics_consent_intents",
  "analytics_consent_intent_heads", "analytics_rate_limit_buckets",
  "data_source_health", "dashboard_alerts", "stripe_webhook_events"
];

export const sensitivePolicyExpectations = [
  { table: "analytics_consents", name: "owners read analytics consents", command: "SELECT", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: null },
  { table: "analytics_events", name: "owners read analytics events", command: "SELECT", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: null },
  { table: "dashboard_alerts", name: "owners manage dashboard alerts", command: "ALL", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "data_source_health", name: "owners manage source health", command: "ALL", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "payments", name: "owners manage payments", command: "ALL", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "after_sales_cases", name: "owners manage after sales", command: "ALL", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "payment_refunds", name: "owners manage payment refunds", command: "ALL", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "email_notifications", name: "owners manage email notifications", command: "ALL", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" }
];

export const criticalFunctions = [
  { name: "claim_email_notification_delivery", identity: "p_notification_id uuid,p_lease_seconds integer", authenticated: false },
  { name: "claim_stripe_webhook_event_identity", identity: "p_event_id text,p_event_type text,p_object_type text,p_object_id text", authenticated: false },
  { name: "cleanup_analytics_consent_intents", identity: "p_limit integer", authenticated: false },
  { name: "cleanup_analytics_rate_limit_buckets", identity: "p_max_rows integer", authenticated: false },
  { name: "consume_analytics_rate_limit", identity: "p_bucket_key text,p_limit integer,p_window_seconds integer", authenticated: false },
  { name: "record_analytics_consent", identity: "p_visitor_id text,p_consent text,p_locale text,p_consent_version text,p_intent_id uuid", authenticated: false },
  { name: "ingest_analytics_event", identity: "p_event_key text,p_event_type text,p_created_at timestamp with time zone,p_visitor_id text,p_session_id text,p_path text,p_source text,p_medium text,p_campaign text,p_referrer_domain text,p_device_type text,p_product_id uuid,p_product_name text,p_value_eur numeric,p_raw_utm jsonb", authenticated: false },
  { name: "issue_analytics_consent_intent", identity: "p_visitor_id text", authenticated: false },
  { name: "finalize_email_notification_delivery", identity: "p_notification_id uuid,p_lease_token uuid,p_succeeded boolean,p_provider text,p_provider_message_id text,p_error text", authenticated: false },
  { name: "get_data_center_overview", identity: "p_start_at timestamp with time zone,p_end_at timestamp with time zone", authenticated: true },
  { name: "mark_stripe_webhook_failure", identity: "p_event_id text,p_event_type text,p_error_code text", authenticated: false },
  { name: "record_stripe_refund", identity: "p_event_id text,p_event_type text,p_provider_refund_id text,p_provider_payment_id text,p_amount_cents bigint,p_currency text,p_status text,p_reason text,p_raw_payload jsonb", authenticated: false },
  { name: "record_stripe_checkout_payment", identity: "p_event_id text,p_event_type text,p_order_id uuid,p_order_number text,p_provider_payment_id text,p_session_id text,p_amount_cents bigint,p_currency text,p_raw_payload jsonb", authenticated: false },
  { name: "record_stripe_checkout_payment_v012", identity: "p_event_id text,p_event_type text,p_order_id uuid,p_order_number text,p_provider_payment_id text,p_session_id text,p_amount_cents bigint,p_currency text,p_raw_payload jsonb", authenticated: false, serviceRole: false },
  { name: "reconcile_stripe_source_health_count", identity: "", authenticated: false },
  { name: "create_after_sales_case", identity: "p_order_number text,p_case_type text,p_reason text,p_requested_remedy text,p_due_at timestamp with time zone,p_created_by uuid", authenticated: false },
  { name: "refresh_customer_membership", identity: "customer uuid", authenticated: false },
  { name: "refresh_membership_after_order", identity: "", authenticated: false },
  { name: "stripe_source_record_count", identity: "", authenticated: false, serviceRole: false },
  { name: "update_after_sales_case", identity: "p_case_id uuid,p_actor_id uuid,p_expected_version bigint,p_status text,p_responsibility text,p_responsibility_set boolean,p_refund_amount_cents bigint,p_refund_amount_set boolean,p_internal_note text,p_internal_note_set boolean,p_due_at timestamp with time zone,p_due_at_set boolean", authenticated: false },
  { name: "transition_email_notification", identity: "p_notification_id uuid,p_action text", authenticated: false },
  { name: "record_stripe_refund_v012", identity: "p_event_id text,p_event_type text,p_provider_refund_id text,p_provider_payment_id text,p_amount_cents bigint,p_currency text,p_status text,p_reason text,p_raw_payload jsonb", authenticated: false, serviceRole: false }
];

function quoted(values) {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
}

function normalizeCatalogExpression(value) {
  return value === null ? null : value.replace(/public\./g, "").replace(/\s+/g, "").toLowerCase();
}

function normalizedPolicyRow(row) {
  return {
    table: row.tablename,
    name: row.policyname,
    command: row.cmd,
    roles: row.roles,
    qual: normalizeCatalogExpression(row.qual),
    withCheck: normalizeCatalogExpression(row.with_check)
  };
}

function policySort(left, right) {
  return `${left.table}\u0000${left.name}`.localeCompare(`${right.table}\u0000${right.name}`);
}

export function validateBootstrapCatalog({ publicTables, sensitivePolicies, securityDefinerFunctions }) {
  const expectedTables = [...publicBaseTables].sort();
  const actualTables = publicTables.map((row) => row.relname).sort();
  assert.deepEqual(actualTables, expectedTables, "public base table catalog changed");
  for (const row of publicTables) {
    assert.equal(row.relrowsecurity, true, `RLS is disabled: ${row.relname}`);
  }

  const expectedPolicies = sensitivePolicyExpectations.map((row) => ({ ...row })).sort(policySort);
  const actualPolicies = sensitivePolicies.map(normalizedPolicyRow).sort(policySort);
  assert.deepEqual(actualPolicies, expectedPolicies, "sensitive owner policy catalog changed");

  assert.deepEqual(
    securityDefinerFunctions.map((row) => `${row.proname}(${normalizeCatalogExpression(row.identity_arguments)})`).sort(),
    criticalFunctions.map((fn) => `${fn.name}(${normalizeCatalogExpression(fn.identity)})`).sort(),
    "bootstrap has an unexpected or missing SECURITY DEFINER RPC"
  );
  for (const expected of criticalFunctions) {
    const fn = securityDefinerFunctions.find((row) => row.proname === expected.name && normalizeCatalogExpression(row.identity_arguments) === normalizeCatalogExpression(expected.identity));
    assert.ok(fn, `critical RPC is missing: ${expected.name}`);
    assert.equal(fn.prosecdef, true, `critical RPC is not SECURITY DEFINER: ${expected.name}`);
    assert.equal(fn.proconfig, "search_path=public, pg_temp", `critical RPC search_path is unsafe: ${expected.name}`);
    assert.equal(fn.public_execute, false, `PUBLIC can execute critical RPC: ${expected.name}`);
    assert.equal(fn.anon_execute, false, `anon can execute critical RPC: ${expected.name}`);
    assert.equal(fn.authenticated_execute, expected.authenticated, `authenticated ACL mismatch: ${expected.name}`);
    assert.equal(fn.service_role_execute, expected.serviceRole ?? true, `service_role ACL mismatch: ${expected.name}`);
    assert.equal(fn.postgres_execute, true, `postgres cannot execute critical RPC: ${expected.name}`);
  }
}

export async function executeBootstrapWithPGlite() {
  const database = await PGlite.create({ extensions: { pgcrypto } });
  try {
    await database.exec(supabaseBootstrapStubs);
    await database.exec(readFileSync(bootstrapPath, "utf8"));

    const [{ rows: tableRows }, { rows: functionRows }, { rows: sensitivePolicyRows }, { rows: functionSecurityRows }, { rows: extensionRows }] = await Promise.all([
      database.query("select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by c.relname"),
      database.query(`select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (${quoted(coreFunctions)}) order by p.proname`),
      database.query(`select tablename, policyname, cmd, roles::text as roles, qual, with_check from pg_policies where schemaname = 'public' and tablename in (${quoted(sensitivePolicyTables)}) order by tablename, policyname`),
      database.query("select p.proname, pg_get_function_identity_arguments(p.oid) as identity_arguments, p.prosecdef, array_to_string(p.proconfig, '|') as proconfig, has_function_privilege('public', p.oid, 'EXECUTE') as public_execute, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute, has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute, has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute, has_function_privilege('postgres', p.oid, 'EXECUTE') as postgres_execute from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef order by p.proname, pg_get_function_identity_arguments(p.oid)"),
      database.query("select extname from pg_extension where extname = 'pgcrypto'")
    ]);

    assert.deepEqual(functionRows.map((row) => row.proname), [...coreFunctions].sort(), "bootstrap is missing a core function");
    validateBootstrapCatalog({
      publicTables: tableRows,
      sensitivePolicies: sensitivePolicyRows,
      securityDefinerFunctions: functionSecurityRows
    });
    assert.equal(extensionRows.length, 1, "pgcrypto extension was not loaded");

    return {
      coreTables: tableRows.length,
      coreFunctions: functionRows.length,
      ownerPolicies: sensitivePolicyRows.length,
      rlsTables: tableRows.length,
      criticalFunctions: functionSecurityRows.length
    };
  } finally {
    await database.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await executeBootstrapWithPGlite();
  console.log(`Bootstrap PGlite execution passed: ${result.coreTables} core tables, ${result.coreFunctions} core functions, ${result.ownerPolicies} owner policies, ${result.rlsTables} RLS tables, ${result.criticalFunctions} critical RPCs.`);
}
