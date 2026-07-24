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

const coreTables = [
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

const policyExpectations = [
  { table: "analytics_consents", name: "owners read analytics consents", command: "SELECT", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: null },
  { table: "analytics_events", name: "owners read analytics events", command: "SELECT", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: null },
  { table: "data_source_health", name: "owners manage source health", command: "ALL", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "payments", name: "owners manage payments", command: "ALL", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "after_sales_cases", name: "owners manage after sales", command: "ALL", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "payment_refunds", name: "owners manage payment refunds", command: "ALL", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "email_notifications", name: "owners manage email notifications", command: "ALL", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" }
];

const criticalFunctions = [
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

export async function executeBootstrapWithPGlite() {
  const database = await PGlite.create({ extensions: { pgcrypto } });
  try {
    await database.exec(supabaseBootstrapStubs);
    await database.exec(readFileSync(bootstrapPath, "utf8"));

    const [{ rows: tableRows }, { rows: functionRows }, { rows: policyRows }, { rows: rlsRows }, { rows: functionSecurityRows }, { rows: extensionRows }] = await Promise.all([
      database.query(`select tablename from pg_tables where schemaname = 'public' and tablename in (${quoted(coreTables)}) order by tablename`),
      database.query(`select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (${quoted(coreFunctions)}) order by p.proname`),
      database.query(`select tablename, policyname, cmd, roles::text as roles, qual, with_check from pg_policies where schemaname = 'public' and (tablename, policyname) in (${policyExpectations.map(({ table, name }) => `('${table}', '${name}')`).join(", ")}) order by tablename, policyname`),
      database.query(`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname in (${quoted(coreTables)}) order by relname`),
      database.query("select p.proname, pg_get_function_identity_arguments(p.oid) as identity_arguments, p.prosecdef, array_to_string(p.proconfig, '|') as proconfig, has_function_privilege('public', p.oid, 'EXECUTE') as public_execute, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute, has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute, has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute, has_function_privilege('postgres', p.oid, 'EXECUTE') as postgres_execute from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef order by p.proname, pg_get_function_identity_arguments(p.oid)"),
      database.query("select extname from pg_extension where extname = 'pgcrypto'")
    ]);

    assert.deepEqual(tableRows.map((row) => row.tablename), [...coreTables].sort(), "bootstrap is missing a core table");
    assert.deepEqual(functionRows.map((row) => row.proname), [...coreFunctions].sort(), "bootstrap is missing a core function");
    assert.deepEqual(rlsRows.map((row) => row.relname), [...coreTables].sort(), "bootstrap is missing a core RLS table");
    for (const row of rlsRows) {
      assert.equal(row.relrowsecurity, true, `RLS is disabled: ${row.relname}`);
    }

    assert.equal(policyRows.length, policyExpectations.length, "bootstrap is missing an owner-only data-center policy");
    for (const expected of policyExpectations) {
      const policy = policyRows.find((row) => row.tablename === expected.table && row.policyname === expected.name);
      assert.ok(policy, `owner policy is missing: ${expected.table}.${expected.name}`);
      assert.equal(policy.cmd, expected.command, `unexpected policy command: ${expected.table}.${expected.name}`);
      assert.equal(policy.roles, expected.roles, `unexpected policy roles: ${expected.table}.${expected.name}`);
      assert.equal(normalizeCatalogExpression(policy.qual), expected.qual, `unexpected policy USING check: ${expected.table}.${expected.name}`);
      assert.equal(normalizeCatalogExpression(policy.with_check), expected.withCheck, `unexpected policy WITH CHECK: ${expected.table}.${expected.name}`);
    }

    assert.deepEqual(
      functionSecurityRows.map((row) => `${row.proname}(${normalizeCatalogExpression(row.identity_arguments)})`),
      criticalFunctions.map((fn) => `${fn.name}(${normalizeCatalogExpression(fn.identity)})`).sort(),
      "bootstrap has an unexpected or missing SECURITY DEFINER RPC"
    );
    for (const expected of criticalFunctions) {
      const fn = functionSecurityRows.find((row) => row.proname === expected.name);
      assert.ok(fn, `critical RPC is missing: ${expected.name}`);
      assert.equal(normalizeCatalogExpression(fn.identity_arguments), normalizeCatalogExpression(expected.identity), `unexpected RPC identity signature: ${expected.name}`);
      assert.equal(fn.prosecdef, true, `critical RPC is not SECURITY DEFINER: ${expected.name}`);
      assert.equal(fn.proconfig, "search_path=public, pg_temp", `critical RPC search_path is unsafe: ${expected.name}`);
      assert.equal(fn.public_execute, false, `PUBLIC can execute critical RPC: ${expected.name}`);
      assert.equal(fn.anon_execute, false, `anon can execute critical RPC: ${expected.name}`);
      assert.equal(fn.authenticated_execute, expected.authenticated, `authenticated ACL mismatch: ${expected.name}`);
      assert.equal(fn.service_role_execute, expected.serviceRole ?? true, `service_role ACL mismatch: ${expected.name}`);
      assert.equal(fn.postgres_execute, true, `postgres cannot execute critical RPC: ${expected.name}`);
    }
    assert.equal(extensionRows.length, 1, "pgcrypto extension was not loaded");

    return {
      coreTables: tableRows.length,
      coreFunctions: functionRows.length,
      ownerPolicies: policyRows.length,
      rlsTables: rlsRows.length,
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
