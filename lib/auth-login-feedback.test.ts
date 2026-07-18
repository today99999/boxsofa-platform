import assert from "node:assert/strict";
import test from "node:test";
import * as auth from "./auth.ts";

type LoginFeedback = {
  message: string;
  canResendConfirmation: boolean;
};

const getLoginFeedback = (
  auth as typeof auth & {
    getLoginFeedback?: (error: { code?: string; message?: string }) => LoginFeedback;
  }
).getLoginFeedback;

test("unconfirmed email errors offer a confirmation-email resend", () => {
  assert.equal(typeof getLoginFeedback, "function");
  assert.deepEqual(getLoginFeedback?.({ code: "email_not_confirmed", message: "Email not confirmed" }), {
    message: "Please confirm your email before signing in. Check your inbox and spam folder.",
    canResendConfirmation: true
  });
});

test("ordinary login errors do not offer a confirmation-email resend", () => {
  assert.equal(typeof getLoginFeedback, "function");
  assert.deepEqual(getLoginFeedback?.({ code: "invalid_credentials", message: "Invalid login credentials" }), {
    message: "Login failed. Please check the email account and password.",
    canResendConfirmation: false
  });
});
