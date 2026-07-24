import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
const envExample = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
const environmentCheck = readFileSync(new URL("../../scripts/check-env.mjs", import.meta.url), "utf8");
const readinessCheck = readFileSync(new URL("../../scripts/production-readiness.mjs", import.meta.url), "utf8");
const authAudit = readFileSync(new URL("../../scripts/api-auth-audit.mjs", import.meta.url), "utf8");
const operations = readFileSync(new URL("../../docs/EMAIL-OPERATIONS.md", import.meta.url), "utf8");
const productionSetup = readFileSync(new URL("../../docs/PRODUCTION-SETUP.md", import.meta.url), "utf8");
const prelaunchChecklist = readFileSync(new URL("../../docs/PRELAUNCH-CHECKLIST.md", import.meta.url), "utf8");

test("Vercel invokes the email notification cron every five minutes", () => {
  assert.deepEqual(vercel.crons, [
    { path: "/api/cron/email-notifications", schedule: "*/5 * * * *" }
  ]);
});

test("cron secret is documented and required without exposing its value", () => {
  assert.match(envExample, /^CRON_SECRET=$/m);
  for (const source of [environmentCheck, readinessCheck]) {
    assert.match(source, /CRON_SECRET/);
    assert.match(source, /\.length\s*<\s*32/);
    assert.doesNotMatch(source, /console\.(?:log|warn|error)\([^\n]*getEnv\(['"]CRON_SECRET['"]\)/);
    assert.doesNotMatch(source, /console\.(?:log|warn|error)\([^\n]*process\.env\.CRON_SECRET/);
  }
});

test("anonymous auth audit requires a 401 response from the cron route", () => {
  assert.match(authAudit, /method:\s*['"]GET['"],\s*path:\s*['"]\/api\/cron\/email-notifications['"],\s*allowedStatuses:\s*\[401\]/);
});

test("email operations explain safe delivery, recovery, and configuration", () => {
  for (const requiredTopic of [
    /five-minute/i,
    /queued/i,
    /failed/i,
    /manual retry/i,
    /sent/i,
    /skipped/i,
    /EMAIL_PROVIDER/,
    /EMAIL_FROM/,
    /EMAIL_API_KEY/,
    /SUPABASE_SERVICE_ROLE_KEY/,
    /CRON_SECRET/,
    /EXPECT_PAYMENT_ENABLED/,
    /STRIPE_SECRET_KEY/,
    /STRIPE_WEBHOOK_SECRET/,
    /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/,
    /payment remains successful during an email outage/i,
    /no mailbox\s+credentials/i,
    /24[- ]hour/i,
    /quarantin/i,
    /historical[\s\S]*not[\s\S]*automatic/i
  ]) assert.match(operations, requiredTopic);
});

test("release runbooks require a migration maintenance window and remote checkpoint gate", () => {
  for (const document of [productionSetup, prelaunchChecklist]) {
    assert.match(document, /maintenance window/i);
    assert.match(document, /checkout/i);
    assert.match(document, /admin order/i);
    assert.match(document, /migration 026/i);
    assert.match(document, /remote checkpoint/i);
    assert.match(document, /EXPECT_PAYMENT_ENABLED/);
    assert.match(document, /STRIPE_SECRET_KEY/);
    assert.match(document, /STRIPE_WEBHOOK_SECRET/);
    assert.match(document, /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/);
    assert.match(document, /CRON_SECRET/);
  }
  assert.match(productionSetup, /new app[\s\S]*health/i);
});

test("operational documentation and config never contain credentials or customer message data", () => {
  const operationalSources = [envExample, environmentCheck, readinessCheck, authAudit, operations].join("\n");
  assert.doesNotMatch(operationalSources, /BOXSOFA_MAIL_PASSWORD\s*=/);
  assert.doesNotMatch(operations, /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  assert.doesNotMatch(operations, /Thank you for your purchase \| BoxSofa order/i);
});
