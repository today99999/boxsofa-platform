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
  clearAnalyticsServerReady,
  consentSyncMarker,
  inferDeviceType,
  isAnalyticsServerReady,
  markAnalyticsServerReady,
  readAnalyticsConsentStatus,
  shouldSynchronizeConsent,
  sanitizeReferrerDomain,
  synchronizeAnalyticsConsent
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

test("server-matched consent does not POST, while an expired or cleared server cookie resubmits", async () => {
  let posts = 0;
  const matched = await synchronizeAnalyticsConsent({
    visitorId: "visitor-status",
    consent: "analytics",
    version: "2026-07-23",
    getStatus: async () => ({ consent: "analytics", version: "2026-07-23" }),
    persist: async () => { posts += 1; return true; }
  });
  const expired = await synchronizeAnalyticsConsent({
    visitorId: "visitor-status",
    consent: "analytics",
    version: "2026-07-23",
    getStatus: async () => ({ consent: null, version: null }),
    persist: async () => { posts += 1; return true; }
  });

  assert.equal(matched, "matched");
  assert.equal(expired, "resubmitted");
  assert.equal(posts, 1);
});

test("concurrent consent mounts share one status and POST chain, but a transient failure can retry", async () => {
  let statusCalls = 0;
  let posts = 0;
  let firstStatus = true;
  const input = {
    visitorId: "visitor-concurrent",
    consent: "analytics" as const,
    version: "2026-07-23",
    getStatus: async () => {
      statusCalls += 1;
      if (firstStatus) {
        firstStatus = false;
        return null;
      }
      return { consent: null, version: null };
    },
    persist: async () => { posts += 1; return true; }
  };
  const failed = await Promise.all([synchronizeAnalyticsConsent(input), synchronizeAnalyticsConsent(input)]);
  const retried = await synchronizeAnalyticsConsent(input);

  assert.deepEqual(failed, ["unavailable", "unavailable"]);
  assert.equal(retried, "resubmitted");
  assert.equal(statusCalls, 2);
  assert.equal(posts, 1);
});

test("necessary and analytics synchronization remain distinct, and server readiness is explicit", async () => {
  let posts = 0;
  const necessary = await synchronizeAnalyticsConsent({
    visitorId: "visitor-transition",
    consent: "necessary",
    version: "2026-07-23",
    getStatus: async () => ({ consent: "analytics", version: "2026-07-23" }),
    persist: async () => { posts += 1; return true; }
  });
  const session = new Map<string, string>();
  const adapter = {
    getItem: (key: string) => session.get(key) ?? null,
    setItem: (key: string, value: string) => session.set(key, value),
    removeItem: (key: string) => session.delete(key)
  };

  assert.equal(necessary, "resubmitted");
  assert.equal(posts, 1);
  assert.equal(isAnalyticsServerReady(adapter), false);
  markAnalyticsServerReady(adapter);
  assert.equal(isAnalyticsServerReady(adapter), true);
  clearAnalyticsServerReady(adapter);
  assert.equal(isAnalyticsServerReady(adapter), false);
});

test("consent status reads only the public state/version contract", async () => {
  const status = await readAnalyticsConsentStatus(async () => new Response(JSON.stringify({
    consent: "analytics",
    version: "2026-07-23",
    attribution: "must-not-be-used"
  }), { status: 200 }));
  const unavailable = await readAnalyticsConsentStatus(async () => new Response("{}", { status: 503 }));

  assert.deepEqual(status, { consent: "analytics", version: "2026-07-23" });
  assert.equal(unavailable, null);
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
  assert.match(source, /consentSyncGenerationRef\.current \+= 1/);
  assert.match(source, /markAnalyticsServerReady\(\);/);

  const analyticsSource = readFileSync("lib/analytics.ts", "utf8");
  assert.match(analyticsSource, /if \(!isAnalyticsServerReady\(\)\) return;/);
});
