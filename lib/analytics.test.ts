import assert from "node:assert/strict";
import test from "node:test";
import {
  ANALYTICS_ATTRIBUTION_KEY,
  ANALYTICS_EVENTS_KEY,
  ANALYTICS_QUEUE_KEY,
  ANALYTICS_SESSION_KEY,
  ANALYTICS_VISITOR_KEY,
  clearAnalyticsClientState,
  inferDeviceType,
  sanitizeReferrerDomain
} from "./analytics.ts";

test("analytics helpers normalize device and referrer", () => {
  assert.equal(inferDeviceType(390), "mobile");
  assert.equal(inferDeviceType(1024), "tablet");
  assert.equal(inferDeviceType(1440), "desktop");
  assert.equal(sanitizeReferrerDomain("https://www.instagram.com/reel/1"), "www.instagram.com");
  assert.equal(sanitizeReferrerDomain("not a url"), "");
});

test("withdrawing analytics clears queued, attributed, and session-scoped client state", () => {
  const removed: string[] = [];
  const storage = { removeItem: (key: string) => removed.push(key) };

  clearAnalyticsClientState(storage);

  assert.deepEqual(removed.sort(), [
    ANALYTICS_ATTRIBUTION_KEY,
    ANALYTICS_EVENTS_KEY,
    ANALYTICS_QUEUE_KEY,
    ANALYTICS_SESSION_KEY,
    ANALYTICS_VISITOR_KEY
  ].sort());
});
