import assert from "node:assert/strict";
import test from "node:test";
import { isAuthorizedCronRequest } from "./email-cron-auth.ts";

test("cron authorization accepts only the exact bearer secret", () => {
  const secret = "cron-secret";
  assert.equal(isAuthorizedCronRequest(new Request("https://boxsofa.eu"), secret), false);
  assert.equal(isAuthorizedCronRequest(new Request("https://boxsofa.eu", { headers: { Authorization: "Bearer wrong" } }), secret), false);
  assert.equal(isAuthorizedCronRequest(new Request("https://boxsofa.eu", { headers: { Authorization: "bearer cron-secret" } }), secret), false);
  assert.equal(isAuthorizedCronRequest(new Request("https://boxsofa.eu", { headers: { Authorization: "Bearer  cron-secret" } }), secret), false);
  assert.equal(isAuthorizedCronRequest(new Request("https://boxsofa.eu", { headers: { Authorization: "Bearer cron-secret" } }), secret), true);
});

test("cron authorization rejects missing secrets", () => {
  const request = new Request("https://boxsofa.eu", { headers: { Authorization: "Bearer cron-secret" } });
  assert.equal(isAuthorizedCronRequest(request, undefined), false);
  assert.equal(isAuthorizedCronRequest(request, ""), false);
});
