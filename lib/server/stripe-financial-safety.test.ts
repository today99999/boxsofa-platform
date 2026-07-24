import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertSafeStripeFinancialIntegrationTarget } from "../../scripts/stripe-financial-integration-guard.mjs";
const productionProjectRef = "osmjevtynywbkokzejcp";

const migration = readFileSync(
  new URL("../../supabase/migrations/202607240013_harden_task5_production_safety.sql", import.meta.url),
  "utf8"
).toLowerCase();
const identityImmutabilityMigration = readFileSync(
  new URL("../../supabase/migrations/202607240014_enforce_stripe_webhook_identity_immutability.sql", import.meta.url),
  "utf8"
).toLowerCase();
const finalFinancialMigration = readFileSync(
  new URL("../../supabase/migrations/202607240015_finalize_task5_refund_identity_and_health.sql", import.meta.url),
  "utf8"
).toLowerCase();
const sourceHealthConcurrencyMigration = readFileSync(
  new URL("../../supabase/migrations/202607240017_serialize_stripe_source_health_count.sql", import.meta.url),
  "utf8"
).toLowerCase();
const bootstrapSchema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8").toLowerCase();
const integrationScript = readFileSync(
  new URL("../../scripts/stripe-financial-integration.mjs", import.meta.url),
  "utf8"
);
const integrationGuard = readFileSync(
  new URL("../../scripts/stripe-financial-integration-guard.mjs", import.meta.url),
  "utf8"
);

test("financial fixture guard only accepts a declared non-production canonical Supabase URL", () => {
  const ref = "abcdefghijklmnopqrst";
  const environment = {
    NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
    SUPABASE_TEST_PROJECT_REF: ref,
    SUPABASE_INTEGRATION_TARGET: "branch"
  };
  assert.equal(assertSafeStripeFinancialIntegrationTarget(environment), ref);

  const rejectedUrls = [
    "http://abcdefghijklmnopqrst.supabase.co",
    "https://abcdefghijklmnopqrst.supabase.co:443",
    "https://abcdefghijklmnopqrst.supabase.co/path",
    "https://abcdefghijklmnopqrst.supabase.co?via=proxy",
    "https://user@abcdefghijklmnopqrst.supabase.co",
    "https://abcdefghijklmnopqrst.supabase.co.evil.test",
    "https://db.boxsofa.eu",
    "https://127.0.0.1",
    "https://localhost"
  ];
  for (const url of rejectedUrls) {
    assert.throws(
      () => assertSafeStripeFinancialIntegrationTarget({ ...environment, NEXT_PUBLIC_SUPABASE_URL: url }),
      /permanently blocked on the production/
    );
  }
  assert.throws(
    () => assertSafeStripeFinancialIntegrationTarget({ ...environment, SUPABASE_TEST_PROJECT_REF: productionProjectRef }),
    /permanently blocked on the production/
  );
  assert.throws(
    () => assertSafeStripeFinancialIntegrationTarget({ ...environment, SUPABASE_TEST_PROJECT_REF: "wrongwrongwrongwrong" }),
    /permanently blocked on the production/
  );
  assert.match(integrationScript, /RUN_SUPABASE_STRIPE_INTEGRATION/);
});

test("financial hardening keeps owner-only policies, consented visitor counts, immutable event identity, and ordered locks", () => {
  for (const contract of [
    "paid/refunded stripe orders without a stripe payment row exist",
    "create policy \"owners manage payments\"",
    "create policy \"owners manage email notifications\"",
    "event_row.consent_id",
    "consent_row.consent = 'analytics'",
    "add column if not exists object_type text",
    "add column if not exists object_id text",
    "event_identity_mismatch",
    "stripe:payment:",
    "stripe:order:",
    "record_stripe_refund_v012",
    "record_stripe_checkout_payment_v012",
    "revoke all on function public.record_stripe_refund_v012"
  ]) {
    assert.match(migration, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const contract of [
    "create or replace function public.enforce_stripe_webhook_identity_immutability",
    "stripe webhook event type is immutable",
    "stripe webhook object identity is immutable",
    "create trigger enforce_stripe_webhook_identity_immutability"
  ]) {
    assert.match(identityImmutabilityMigration, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("future financial fixtures are inactive, consent-linked, and never restore shared source health", () => {
  assert.match(integrationScript, /assertSafeStripeFinancialIntegrationTarget\(process\.env\)/);
  assert.match(integrationScript, /is_active: false/);
  assert.match(integrationScript, /consent_id: consent\.id/);
  assert.doesNotMatch(integrationScript, /originalStripeHealth|restoreStripeHealth/);
  assert.match(integrationScript, /AggregateError\(failures/);
});

test("final refund recovery binds identity before payment lookup and bootstrap reconciles Stripe health", () => {
  for (const contract of [
    "pre-013 rows did not store object identity",
    "do not fail the event"
  ]) {
    assert.match(finalFinancialMigration, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const contract of [
    "if v_event.object_type is null and v_event.object_id is null",
    "set object_type = p_object_type",
    "from public.claim_stripe_webhook_event_identity",
    "if not found then",
    "payment_not_found",
    "record_stripe_refund_v012",
    "create or replace function public.reconcile_stripe_source_health_count",
    "set record_count = public.stripe_source_record_count()",
    "grant execute on function public.reconcile_stripe_source_health_count() to service_role"
  ]) {
    assert.match(finalFinancialMigration, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(bootstrapSchema, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.ok(
    finalFinancialMigration.indexOf("from public.claim_stripe_webhook_event_identity") < finalFinancialMigration.indexOf("from public.payments payment_row"),
    "refund identity must be claimed before payment lookup"
  );
});

function functionBody(sql: string, functionName: string) {
  const start = sql.lastIndexOf(`create or replace function public.${functionName}(`);
  assert.ok(start >= 0, `expected ${functionName} to be defined`);
  const bodyStart = sql.indexOf("as $$", start);
  const bodyEnd = sql.indexOf("$$;", bodyStart);
  assert.ok(bodyStart >= 0 && bodyEnd > bodyStart, `expected ${functionName} body`);
  return sql.slice(bodyStart, bodyEnd);
}

test("all effective Stripe source-health writers use one transaction lock before count or delegated write", () => {
  const lock = "pg_advisory_xact_lock(hashtextextended('stripe:source-health', 0))";
  const writers = [
    "record_stripe_refund",
    "record_stripe_checkout_payment",
    "mark_stripe_webhook_failure",
    "reconcile_stripe_source_health_count"
  ];

  for (const source of [sourceHealthConcurrencyMigration, bootstrapSchema]) {
    for (const writer of writers) {
      const body = functionBody(source, writer);
      const lockAt = body.indexOf(lock);
      assert.ok(lockAt >= 0, `${writer} must take the shared source-health transaction lock`);

      const countOrDelegatedWriteAt = Math.min(
        ...["stripe_source_record_count", "record_stripe_refund_v012", "record_stripe_checkout_payment_v012"]
          .map((needle) => body.indexOf(needle))
          .filter((index) => index >= 0)
      );
      assert.ok(Number.isFinite(countOrDelegatedWriteAt), `${writer} must count or delegate its health write`);
      assert.ok(lockAt < countOrDelegatedWriteAt, `${writer} must lock before its source-health count/write`);
    }
  }
});

test("Stripe source-health lock ordering keeps business locks ahead of the shared count lock", () => {
  for (const writer of ["record_stripe_refund", "record_stripe_checkout_payment"]) {
    const body = functionBody(sourceHealthConcurrencyMigration, writer);
    const paymentLockAt = body.indexOf("stripe:payment:");
    const orderLockAt = body.indexOf("stripe:order:");
    const healthLockAt = body.indexOf("stripe:source-health");
    assert.ok(paymentLockAt >= 0 && orderLockAt > paymentLockAt, `${writer} must preserve payment then order locks`);
    assert.ok(healthLockAt > orderLockAt, `${writer} must take source-health only after business locks`);
  }

  const reconcile = functionBody(sourceHealthConcurrencyMigration, "reconcile_stripe_source_health_count");
  assert.match(reconcile, /stripe:source-health/);
  assert.doesNotMatch(reconcile, /stripe:(?:payment|order):/);
  assert.match(sourceHealthConcurrencyMigration, /concurrency contract:[\s\S]*transaction-visible stripe payments/);
});
