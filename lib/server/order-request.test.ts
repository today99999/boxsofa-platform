import assert from "node:assert/strict";
import test from "node:test";
import { readOrderRequestJson } from "./order-request.ts";

test("order JSON parsing rejects malformed bodies before order configuration work", async () => {
  const malformed = await readOrderRequestJson(new Request("https://boxsofa.eu/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not-json"
  }));
  const valid = await readOrderRequestJson(new Request("https://boxsofa.eu/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ customerName: "Ana" })
  }));

  assert.deepEqual(malformed, { ok: false });
  assert.deepEqual(valid, { ok: true, value: { customerName: "Ana" } });
});
