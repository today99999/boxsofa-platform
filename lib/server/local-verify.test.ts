import assert from "node:assert/strict";
import test from "node:test";
import { localVerifyNonce } from "./local-verify.ts";

test("local verify nonce requires explicit local mode and never emits on Vercel", () => {
  assert.equal(localVerifyNonce({ BOXSOFA_LOCAL_VERIFY_NONCE: "nonce" }), null);
  assert.equal(localVerifyNonce({ BOXSOFA_LOCAL_VERIFY: "1" }), null);
  assert.equal(localVerifyNonce({ BOXSOFA_LOCAL_VERIFY: "1", BOXSOFA_LOCAL_VERIFY_NONCE: "nonce" }), "nonce");
  assert.equal(localVerifyNonce({ BOXSOFA_LOCAL_VERIFY: "1", BOXSOFA_LOCAL_VERIFY_NONCE: "nonce", VERCEL: "1" }), null);
  assert.equal(localVerifyNonce({ BOXSOFA_LOCAL_VERIFY: "1", BOXSOFA_LOCAL_VERIFY_NONCE: "nonce", VERCEL_ENV: "production" }), null);
});
