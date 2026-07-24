import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const productionProjectRef = "osmjevtynywbkokzejcp";

const migration = readFileSync(
  new URL("../../supabase/migrations/202607240013_harden_task5_production_safety.sql", import.meta.url),
  "utf8"
).toLowerCase();
const identityImmutabilityMigration = readFileSync(
  new URL("../../supabase/migrations/202607240014_enforce_stripe_webhook_identity_immutability.sql", import.meta.url),
  "utf8"
).toLowerCase();
const integrationScript = readFileSync(
  new URL("../../scripts/stripe-financial-integration.mjs", import.meta.url),
  "utf8"
);
const integrationGuard = readFileSync(
  new URL("../../scripts/stripe-financial-integration-guard.mjs", import.meta.url),
  "utf8"
);

test("financial fixture guard permanently encodes production refusal and explicit non-production targeting", () => {
  for (const contract of [
    productionProjectRef,
    "SUPABASE_TEST_PROJECT_REF",
    "SUPABASE_INTEGRATION_TARGET",
    "[\"branch\", \"test\"].includes(target)",
    "actualRef === STRIPE_FINANCIAL_PRODUCTION_PROJECT_REF",
    "configuredRef === STRIPE_FINANCIAL_PRODUCTION_PROJECT_REF",
    "actualRef !== configuredRef",
    "permanently blocked on the production"
  ]) {
    assert.match(integrationGuard, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
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
