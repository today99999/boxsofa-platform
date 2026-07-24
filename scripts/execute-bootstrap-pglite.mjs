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
// extension rather than a stub.
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
  "profiles",
  "products",
  "orders",
  "payments",
  "payment_refunds",
  "analytics_consents",
  "analytics_events",
  "data_source_health",
  "after_sales_cases",
  "email_notifications",
  "analytics_consent_intents",
  "analytics_consent_intent_heads",
  "stripe_webhook_events"
];

const coreFunctions = [
  "record_analytics_consent",
  "ingest_analytics_event",
  "get_data_center_overview",
  "record_stripe_refund",
  "record_stripe_checkout_payment",
  "create_after_sales_case",
  "update_after_sales_case",
  "transition_email_notification"
];

const policyExpectations = [
  ["after_sales_cases", "owners manage after sales"],
  ["analytics_events", "owners read analytics events"],
  ["payments", "owners manage payments"],
  ["payment_refunds", "owners manage payment refunds"],
  ["email_notifications", "owners manage email notifications"]
];

function quoted(values) {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
}

export async function executeBootstrapWithPGlite() {
  const database = await PGlite.create({ extensions: { pgcrypto } });
  try {
    await database.exec(supabaseBootstrapStubs);
    await database.exec(readFileSync(bootstrapPath, "utf8"));

    const [{ rows: tableRows }, { rows: functionRows }, { rows: policyRows }, { rows: rlsRows }, { rows: extensionRows }] = await Promise.all([
      database.query(`select tablename from pg_tables where schemaname = 'public' and tablename in (${quoted(coreTables)}) order by tablename`),
      database.query(`select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (${quoted(coreFunctions)}) order by p.proname`),
      database.query(`select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' and (tablename, policyname) in (${policyExpectations.map(([table, policy]) => `('${table}', '${policy}')`).join(", ")}) order by tablename, policyname`),
      database.query("select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relrowsecurity order by relname"),
      database.query("select extname from pg_extension where extname = 'pgcrypto'")
    ]);

    assert.deepEqual(tableRows.map((row) => row.tablename), [...coreTables].sort(), "bootstrap is missing a core table");
    assert.deepEqual(functionRows.map((row) => row.proname), [...coreFunctions].sort(), "bootstrap is missing a core function");
    assert.deepEqual(
      policyRows.map((row) => [row.tablename, row.policyname]),
      [...policyExpectations].sort(([leftTable, leftPolicy], [rightTable, rightPolicy]) => `${leftTable}:${leftPolicy}`.localeCompare(`${rightTable}:${rightPolicy}`)),
      "bootstrap is missing an owner-only data-center policy"
    );
    for (const policy of policyRows) {
      assert.match(policy.qual ?? "", /\bis_owner\(\)/, `policy is not owner-only: ${policy.tablename}.${policy.policyname}`);
      if (policy.with_check !== null) {
        assert.match(policy.with_check, /\bis_owner\(\)/, `policy write check is not owner-only: ${policy.tablename}.${policy.policyname}`);
      }
    }
    assert.ok(rlsRows.length >= 20, "bootstrap should enable RLS on its core tables");
    assert.equal(extensionRows.length, 1, "pgcrypto extension was not loaded");

    return {
      coreTables: tableRows.length,
      coreFunctions: functionRows.length,
      ownerPolicies: policyRows.length,
      rlsTables: rlsRows.length
    };
  } finally {
    await database.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await executeBootstrapWithPGlite();
  console.log(
    `Bootstrap PGlite execution passed: ${result.coreTables} core tables, ${result.coreFunctions} core functions, ${result.ownerPolicies} owner policies, ${result.rlsTables} RLS tables.`
  );
}
