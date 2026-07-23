import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ANALYTICS_ATTRIBUTION_KEY,
  ANALYTICS_CONSENT_SYNC_KEY,
  ANALYTICS_EVENTS_KEY,
  ANALYTICS_QUEUE_KEY,
  ANALYTICS_SESSION_KEY,
  ANALYTICS_VISITOR_KEY,
  clearAnalyticsClientState,
  consentSyncMarker,
  inferDeviceType,
  shouldSynchronizeConsent,
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

test("legacy local consent synchronizes once while matching server consent does not repeat", () => {
  const storage = new Map<string, string>();
  const adapter = { getItem: (key: string) => storage.get(key) ?? null };

  assert.equal(shouldSynchronizeConsent(adapter, "analytics", "2026-07-23"), true);
  storage.set(ANALYTICS_CONSENT_SYNC_KEY, consentSyncMarker("analytics", "2026-07-23"));
  assert.equal(shouldSynchronizeConsent(adapter, "analytics", "2026-07-23"), false);
  assert.equal(shouldSynchronizeConsent(adapter, "necessary", "2026-07-23"), true);
});

test("cookie settings dialog keeps labelled focus-management markup", () => {
  const source = readFileSync("components/CookieConsent.tsx", "utf8");

  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-labelledby=\{COOKIE_DIALOG_TITLE_ID\}/);
  assert.match(source, /aria-describedby=\{COOKIE_DIALOG_DESCRIPTION_ID\}/);
  assert.match(source, /ref=\{necessaryButtonRef\}/);
  assert.match(source, /necessaryButtonRef\.current\?\.focus\(\)/);
  assert.match(source, /const target = restoreFocusRef\.current/);
  assert.match(source, /target\.focus\(\)/);
});
