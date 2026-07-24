import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const smoke = readFileSync(
  new URL("../../scripts/prelaunch-smoke.mjs", import.meta.url),
  "utf8"
);
const localVerification = readFileSync(
  new URL("../../scripts/production-verify-local.mjs", import.meta.url),
  "utf8"
);

test("anonymous data center smoke cannot accept private HTML or followed redirects", () => {
  assert.match(smoke, /\{ path: '\/data-center', allowedStatuses: \[404\] \}/);
  assert.match(smoke, /fetch\(baseUrl \+ route\.path, \{ cache: 'no-store', redirect: 'manual' \}\)/);
  assert.doesNotMatch(smoke, /\/data-center', allowedStatuses: \[[^\]]*200/);
});

test("protected API smoke only accepts authorization denials", () => {
  assert.match(smoke, /response\.status !== 401 && response\.status !== 403/);
  assert.doesNotMatch(smoke, /response\.status !== 503/);
});

test("local verification reaches authorization without production credentials", () => {
  assert.match(localVerification, /NEXT_PUBLIC_SUPABASE_URL: "http:\/\/127\.0\.0\.1:1"/);
  assert.match(localVerification, /NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-verification-anon-key"/);
  assert.match(localVerification, /SUPABASE_SERVICE_ROLE_KEY: "local-verification-service-role-key"/);
});
