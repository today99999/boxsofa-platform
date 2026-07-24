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
  create schema supabase_migrations;
  create table auth.users (id uuid primary key);
  create table supabase_migrations.schema_migrations (
    version text primary key,
    name text not null,
    statements text[] not null
  );
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

export const publicRelationExpectations = publicBaseTables.map((relname) => ({
  relname,
  relkind: "r",
  requiresRls: true,
  securityInvoker: false
}));

const coreFunctions = [
  "record_analytics_consent", "ingest_analytics_event", "get_data_center_overview", "record_stripe_refund",
  "record_stripe_checkout_payment", "record_offline_order_payment", "create_after_sales_case",
  "update_after_sales_case", "transition_email_notification"
];

// This is deliberately the exact policy catalog for every public base table.
// Tables absent from the fixture must have no policy rows; the catalog is not
// inferred from the current schema at test time.
export const publicPolicyExpectations = [
  { table: "addresses", name: "users manage own addresses", command: "ALL", roles: "{public}", qual: "((customer_id=(selectauth.uid()asuid))or(selectis_admin()asis_admin))", withCheck: "((customer_id=(selectauth.uid()asuid))or(selectis_admin()asis_admin))" },
  { table: "admin_audit_log", name: "admins read audit log", command: "SELECT", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: null },
  { table: "after_sales_cases", name: "owners manage after sales", command: "ALL", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "analytics_consents", name: "owners read analytics consents", command: "SELECT", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: null },
  { table: "analytics_events", name: "owners read analytics events", command: "SELECT", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: null },
  { table: "chat_messages", name: "chat participants read messages", command: "SELECT", roles: "{public}", qual: "((selectis_admin()asis_admin)or(exists(select1fromchat_threadswhere((chat_threads.id=chat_messages.thread_id)and(chat_threads.customer_id=(selectauth.uid()asuid))))))", withCheck: null },
  { table: "chat_threads", name: "chat participants read threads", command: "SELECT", roles: "{public}", qual: "((selectis_admin()asis_admin)or(customer_id=(selectauth.uid()asuid)))", withCheck: null },
  { table: "dashboard_alerts", name: "owners manage dashboard alerts", command: "ALL", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "data_source_health", name: "owners manage source health", command: "ALL", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "email_notifications", name: "owners manage email notifications", command: "ALL", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "inventory_movements", name: "inventory movements readable by admin or owner", command: "SELECT", roles: "{public}", qual: "((selectis_admin()asis_admin)or(selectis_owner()asis_owner))", withCheck: null },
  { table: "inventory_movements", name: "owners delete inventory movements", command: "DELETE", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: null },
  { table: "inventory_movements", name: "owners insert inventory movements", command: "INSERT", roles: "{public}", qual: null, withCheck: "(selectis_owner()asis_owner)" },
  { table: "inventory_movements", name: "owners update inventory movements", command: "UPDATE", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "newsletter_subscriptions", name: "admins manage newsletter", command: "ALL", roles: "{public}", qual: "(selectis_admin()asis_admin)", withCheck: "(selectis_admin()asis_admin)" },
  { table: "order_items", name: "admins read order items", command: "SELECT", roles: "{public}", qual: "((selectis_admin()asis_admin)or(exists(select1fromorderswhere((orders.id=order_items.order_id)and(orders.customer_id=(selectauth.uid()asuid))))))", withCheck: null },
  { table: "orders", name: "admins update orders", command: "UPDATE", roles: "{public}", qual: "(selectis_admin()asis_admin)", withCheck: "(selectis_admin()asis_admin)" },
  { table: "orders", name: "orders readable by admin or customer", command: "SELECT", roles: "{public}", qual: "((selectis_admin()asis_admin)or(customer_id=(selectauth.uid()asuid)))", withCheck: null },
  { table: "payment_refunds", name: "owners manage payment refunds", command: "ALL", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "payments", name: "owners manage payments", command: "ALL", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "product_media", name: "owners delete product media", command: "DELETE", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: null },
  { table: "product_media", name: "owners insert product media", command: "INSERT", roles: "{public}", qual: null, withCheck: "(selectis_owner()asis_owner)" },
  { table: "product_media", name: "owners update product media", command: "UPDATE", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "product_media", name: "product media readable when active or owner", command: "SELECT", roles: "{public}", qual: "((is_active=true)or(selectis_owner()asis_owner))", withCheck: null },
  { table: "product_reviews", name: "admins delete reviews", command: "DELETE", roles: "{public}", qual: "(selectis_admin()asis_admin)", withCheck: null },
  { table: "product_reviews", name: "admins update reviews", command: "UPDATE", roles: "{public}", qual: "(selectis_admin()asis_admin)", withCheck: "(selectis_admin()asis_admin)" },
  { table: "product_reviews", name: "reviews insertable by customer or admin", command: "INSERT", roles: "{public}", qual: null, withCheck: "((customer_id=(selectauth.uid()asuid))or(selectis_admin()asis_admin))" },
  { table: "product_reviews", name: "reviews readable when visible or admin", command: "SELECT", roles: "{public}", qual: "(((is_visible=true)and(deleted_atisnull))or(selectis_admin()asis_admin))", withCheck: null },
  { table: "product_styles", name: "owners delete product styles", command: "DELETE", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: null },
  { table: "product_styles", name: "owners insert product styles", command: "INSERT", roles: "{public}", qual: null, withCheck: "(selectis_owner()asis_owner)" },
  { table: "product_styles", name: "owners update product styles", command: "UPDATE", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "product_styles", name: "product styles readable when active or admin", command: "SELECT", roles: "{public}", qual: "((is_active=true)or(selectis_admin()asis_admin))", withCheck: null },
  { table: "products", name: "owners delete products", command: "DELETE", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: null },
  { table: "products", name: "owners insert products", command: "INSERT", roles: "{public}", qual: null, withCheck: "(selectis_owner()asis_owner)" },
  { table: "products", name: "owners update products", command: "UPDATE", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: "(selectis_owner()asis_owner)" },
  { table: "products", name: "products readable when active or admin", command: "SELECT", roles: "{public}", qual: "((is_active=true)or(selectis_admin()asis_admin))", withCheck: null },
  { table: "profiles", name: "profiles deletable by owner", command: "DELETE", roles: "{public}", qual: "(selectis_owner()asis_owner)", withCheck: null },
  { table: "profiles", name: "profiles insertable by owner", command: "INSERT", roles: "{public}", qual: null, withCheck: "(selectis_owner()asis_owner)" },
  { table: "profiles", name: "profiles readable by owner admin or self", command: "SELECT", roles: "{public}", qual: "((id=(selectauth.uid()asuid))or(selectis_admin()asis_admin)or(selectis_owner()asis_owner))", withCheck: null },
  { table: "profiles", name: "profiles updatable by owner or self", command: "UPDATE", roles: "{public}", qual: "((id=(selectauth.uid()asuid))or(selectis_owner()asis_owner))", withCheck: "((id=(selectauth.uid()asuid))or(selectis_owner()asis_owner))" },
  { table: "shipments", name: "admins delete shipments", command: "DELETE", roles: "{public}", qual: "(selectis_admin()asis_admin)", withCheck: null },
  { table: "shipments", name: "admins insert shipments", command: "INSERT", roles: "{public}", qual: null, withCheck: "(selectis_admin()asis_admin)" },
  { table: "shipments", name: "admins update shipments", command: "UPDATE", roles: "{public}", qual: "(selectis_admin()asis_admin)", withCheck: "(selectis_admin()asis_admin)" },
  { table: "shipments", name: "shipments readable by admin or customer", command: "SELECT", roles: "{public}", qual: "((selectis_admin()asis_admin)or(exists(select1fromorderswhere((orders.id=shipments.order_id)and(orders.customer_id=(selectauth.uid()asuid))))))", withCheck: null }
];

export const criticalFunctions = [
  { name: "claim_email_notification_delivery", identity: "p_notification_id uuid,p_lease_seconds integer,p_automatic boolean", authenticated: false },
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
  { name: "record_offline_order_payment", identity: "p_order_id uuid,p_order_number text,p_confirmed_by uuid,p_payment_method_note text,p_target_status text,p_carrier text,p_tracking_number text,p_shipped_subject text,p_shipped_preview_text text,p_shipped_body_text text", authenticated: false },
  { name: "record_stripe_checkout_payment_v012", identity: "p_event_id text,p_event_type text,p_order_id uuid,p_order_number text,p_provider_payment_id text,p_session_id text,p_amount_cents bigint,p_currency text,p_raw_payload jsonb", authenticated: false, serviceRole: false },
  { name: "reconcile_stripe_source_health_count", identity: "", authenticated: false },
  { name: "create_after_sales_case", identity: "p_order_number text,p_case_type text,p_reason text,p_requested_remedy text,p_due_at timestamp with time zone,p_created_by uuid", authenticated: false },
  { name: "refresh_customer_membership", identity: "customer uuid", authenticated: false },
  { name: "refresh_membership_after_order", identity: "", authenticated: false },
  { name: "stripe_source_record_count", identity: "", authenticated: false, serviceRole: false },
  { name: "update_after_sales_case", identity: "p_case_id uuid,p_actor_id uuid,p_expected_version bigint,p_status text,p_responsibility text,p_responsibility_set boolean,p_refund_amount_cents bigint,p_refund_amount_set boolean,p_internal_note text,p_internal_note_set boolean,p_due_at timestamp with time zone,p_due_at_set boolean", authenticated: false },
  { name: "transition_email_notification", identity: "p_notification_id uuid,p_action text", authenticated: false },
  { name: "record_stripe_refund_v012", identity: "p_event_id text,p_event_type text,p_provider_refund_id text,p_provider_payment_id text,p_amount_cents bigint,p_currency text,p_status text,p_reason text,p_raw_payload jsonb", authenticated: false, serviceRole: false },
  {
    name: "get_applied_migration_checkpoints",
    identity: "",
    authenticated: false,
    searchPath: "search_path=public, supabase_migrations, pg_temp"
  }
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

function relationSort(left, right) {
  return `${left.relname}\u0000${left.relkind}`.localeCompare(`${right.relname}\u0000${right.relkind}`);
}

function hasSecurityInvoker(reloptions) {
  return typeof reloptions === "string" && reloptions.split(",").includes("security_invoker=true");
}

export function validateBootstrapCatalog({ publicRelations, publicPolicies, securityDefinerFunctions, relationExpectations = publicRelationExpectations }) {
  const expectedRelations = relationExpectations
    .map(({ relname, relkind }) => ({ relname, relkind }))
    .sort(relationSort);
  const actualRelations = publicRelations
    .map(({ relname, relkind }) => ({ relname, relkind }))
    .sort(relationSort);
  assert.deepEqual(actualRelations, expectedRelations, "public data relation catalog changed");
  for (const expected of relationExpectations) {
    const row = publicRelations.find((candidate) => candidate.relname === expected.relname && candidate.relkind === expected.relkind);
    assert.ok(row, `public data relation is missing: ${expected.relname}`);
    if (expected.requiresRls) assert.equal(row.relrowsecurity, true, `RLS is disabled: ${expected.relname}`);
    if (expected.relkind === "v" || expected.securityInvoker) {
      assert.equal(hasSecurityInvoker(row.reloptions), true, `view is not security_invoker: ${expected.relname}`);
    }
  }

  const expectedPolicies = publicPolicyExpectations.map((row) => ({ ...row })).sort(policySort);
  const actualPolicies = publicPolicies.map(normalizedPolicyRow).sort(policySort);
  assert.deepEqual(actualPolicies, expectedPolicies, "public policy catalog changed");

  assert.deepEqual(
    securityDefinerFunctions.map((row) => `${row.proname}(${normalizeCatalogExpression(row.identity_arguments)})`).sort(),
    criticalFunctions.map((fn) => `${fn.name}(${normalizeCatalogExpression(fn.identity)})`).sort(),
    "bootstrap has an unexpected or missing SECURITY DEFINER RPC"
  );
  for (const expected of criticalFunctions) {
    const fn = securityDefinerFunctions.find((row) => row.proname === expected.name && normalizeCatalogExpression(row.identity_arguments) === normalizeCatalogExpression(expected.identity));
    assert.ok(fn, `critical RPC is missing: ${expected.name}`);
    assert.equal(fn.prosecdef, true, `critical RPC is not SECURITY DEFINER: ${expected.name}`);
    assert.equal(fn.proconfig, expected.searchPath ?? "search_path=public, pg_temp", `critical RPC search_path is unsafe: ${expected.name}`);
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

    const [{ rows: tableRows }, { rows: functionRows }, { rows: publicPolicyRows }, { rows: functionSecurityRows }, { rows: extensionRows }] = await Promise.all([
      database.query("select c.relname, c.relkind, c.relrowsecurity, array_to_string(c.reloptions, ',') as reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p', 'm', 'v', 'f') order by c.relname, c.relkind"),
      database.query(`select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (${quoted(coreFunctions)}) order by p.proname`),
      database.query("select tablename, policyname, cmd, roles::text as roles, qual, with_check from pg_policies where schemaname = 'public' order by tablename, policyname"),
      database.query("select p.proname, pg_get_function_identity_arguments(p.oid) as identity_arguments, p.prosecdef, array_to_string(p.proconfig, '|') as proconfig, has_function_privilege('public', p.oid, 'EXECUTE') as public_execute, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute, has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute, has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute, has_function_privilege('postgres', p.oid, 'EXECUTE') as postgres_execute from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef order by p.proname, pg_get_function_identity_arguments(p.oid)"),
      database.query("select extname from pg_extension where extname = 'pgcrypto'")
    ]);

    assert.deepEqual(functionRows.map((row) => row.proname), [...coreFunctions].sort(), "bootstrap is missing a core function");
    validateBootstrapCatalog({
      publicRelations: tableRows,
      publicPolicies: publicPolicyRows,
      securityDefinerFunctions: functionSecurityRows
    });
    assert.equal(extensionRows.length, 1, "pgcrypto extension was not loaded");

    return {
      coreTables: tableRows.length,
      coreFunctions: functionRows.length,
      ownerPolicies: publicPolicyRows.length,
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
