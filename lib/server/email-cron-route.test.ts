import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../../app/api/cron/email-notifications/route.ts", import.meta.url), "utf8");

test("email cron route authenticates before configuration or database access", () => {
  const handler = route.slice(route.indexOf("export async function GET"));
  const authIndex = handler.indexOf("isAuthorizedCronRequest");
  const configIndex = handler.indexOf("hasSupabaseServiceRoleConfig");
  const dispatchIndex = handler.indexOf("dispatchEmailNotifications");
  assert.ok(authIndex >= 0);
  assert.ok(configIndex > authIndex);
  assert.ok(dispatchIndex > configIndex);
  assert.match(route, /status:\s*401/);
  assert.match(route, /status:\s*503/);
  assert.match(route, /status:\s*500/);
});

test("email cron route exposes only generic messages and aggregate counts", () => {
  assert.match(route, /scanned:\s*summary\.scanned/);
  assert.match(route, /delivered:\s*summary\.delivered/);
  assert.match(route, /failed:\s*summary\.failed/);
  assert.match(route, /conflicted:\s*summary\.conflicted/);
  for (const prohibitedField of ["customer_email", "subject", "body_text", "EMAIL_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    assert.doesNotMatch(route, new RegExp(prohibitedField));
  }
});
