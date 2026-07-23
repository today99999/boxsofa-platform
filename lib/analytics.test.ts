import assert from "node:assert/strict";
import test from "node:test";
import { inferDeviceType, sanitizeReferrerDomain } from "./analytics.ts";

test("analytics helpers normalize device and referrer", () => {
  assert.equal(inferDeviceType(390), "mobile");
  assert.equal(inferDeviceType(1024), "tablet");
  assert.equal(inferDeviceType(1440), "desktop");
  assert.equal(sanitizeReferrerDomain("https://www.instagram.com/reel/1"), "www.instagram.com");
  assert.equal(sanitizeReferrerDomain("not a url"), "");
});
