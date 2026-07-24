import assert from "node:assert/strict";
import test from "node:test";
import { sendTransactionalEmail } from "./email-provider.ts";
import { deliverEmailNotification } from "./email-notification-service.ts";

test("provider-controlled error payload is reduced to an internal category and HTTP status", async () => {
  const previous = {
    provider: process.env.EMAIL_PROVIDER,
    from: process.env.EMAIL_FROM,
    apiKey: process.env.EMAIL_API_KEY,
    fetch: globalThis.fetch
  };
  const privateFragment = "buyer@example.test BODY: private order message";
  process.env.EMAIL_PROVIDER = "resend";
  process.env.EMAIL_FROM = "BoxSofa <sender@example.test>";
  process.env.EMAIL_API_KEY = "test-api-key-with-safe-length";
  globalThis.fetch = async () => new Response(
    JSON.stringify({ message: privateFragment, error: privateFragment }),
    { status: 422, headers: { "content-type": "application/json" } }
  );

  try {
    const result = await sendTransactionalEmail({
      to: "buyer@example.test",
      subject: "private subject",
      text: "private body",
      idempotencyKey: "boxsofa-email/test"
    });
    assert.deepEqual(result, {
      ok: false,
      provider: "resend",
      error: "email_provider_http_error:422"
    });
    assert.doesNotMatch(JSON.stringify(result), /buyer@example\.test|private order message|private subject|private body/);
  } finally {
    if (previous.provider === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = previous.provider;
    if (previous.from === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previous.from;
    if (previous.apiKey === undefined) delete process.env.EMAIL_API_KEY;
    else process.env.EMAIL_API_KEY = previous.apiKey;
    globalThis.fetch = previous.fetch;
  }
});

test("delivery sanitizes an injected sender error before repository finalization", async () => {
  const privateFragment = "buyer@example.test BODY: private order message";
  let persistedError: string | null | undefined;
  const result = await deliverEmailNotification(
    {
      id: "31dc10d1-4cb3-4581-806a-3bc43b48168a",
      customerEmail: "buyer@example.test",
      subject: "private subject",
      bodyText: "private body"
    },
    {
      async claim() {
        return { claimed: true, leaseToken: "lease-1" };
      },
      async finalize(input) {
        persistedError = input.error;
        return { finalized: true, notification: { status: "failed", last_error: input.error } };
      }
    },
    async () => ({ ok: false, provider: "resend", error: privateFragment })
  );

  assert.equal(result.state, "provider_failed");
  assert.equal(persistedError, "email_provider_failed");
  assert.doesNotMatch(JSON.stringify(result), /buyer@example\.test|private order message|private subject|private body/);
});
