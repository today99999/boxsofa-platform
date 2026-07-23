import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ANALYTICS_ATTRIBUTION_KEY,
  ANALYTICS_CONSENT_KEY,
  ANALYTICS_CONSENT_SYNC_KEY,
  ANALYTICS_EVENTS_KEY,
  ANALYTICS_QUEUE_KEY,
  ANALYTICS_SESSION_KEY,
  ANALYTICS_VISITOR_KEY,
  applyAnalyticsDeliveryDisposition,
  analyticsDeliveryBackoffMs,
  classifyAnalyticsDeliveryStatus,
  clearAnalyticsClientState,
  clearAnalyticsServerReady,
  consentSyncMarker,
  createAnalyticsConsentRecoveryCoordinator,
  enqueueConsentMutation,
  fetchWithTimeout,
  inferDeviceType,
  isAnalyticsServerReady,
  markAnalyticsServerReady,
  readAnalyticsConsentStatus,
  readStoredAnalyticsConsent,
  shouldSynchronizeConsent,
  sanitizeReferrerDomain,
  synchronizeAnalyticsConsent,
  AnalyticsRequestTimeoutError,
  type AnalyticsConsent
} from "./analytics.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function queuedEvent(eventKey: string) {
  return {
    id: eventKey,
    eventKey,
    sessionId: "session",
    type: "page_view" as const,
    createdAt: "2026-07-23T00:00:00.000Z",
    path: "/",
    source: "direct",
    visitorId: "visitor"
  };
}

test("403 recovery shares one forced mutation, retries only the retained event, and stops after its cap", async () => {
  const mutation = deferred<boolean>();
  const recovered: string[] = [];
  const stopped: string[] = [];
  let forcedMutations = 0;
  const coordinator = createAnalyticsConsentRecoveryCoordinator({
    forceConsentMutation: async () => {
      forcedMutations += 1;
      return mutation.promise;
    },
    retryRetainedEvents: (event) => recovered.push(event.eventKey),
    stopTracking: () => stopped.push("stop"),
    maxAttempts: 2
  });

  const original = queuedEvent("original-403-event");
  const firstRecovery = coordinator.recover(original);
  const secondRecovery = coordinator.recover(original);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(forcedMutations, 1);
  assert.equal(recovered.length, 0);
  mutation.resolve(true);
  assert.deepEqual(await Promise.all([firstRecovery, secondRecovery]), ["recovered", "recovered"]);
  assert.deepEqual(recovered, ["original-403-event"]);
  assert.equal(original.eventKey, "original-403-event");
  assert.equal(stopped.length, 0);

  const capped = createAnalyticsConsentRecoveryCoordinator({
    forceConsentMutation: async () => false,
    retryRetainedEvents: (event) => recovered.push(event.eventKey),
    stopTracking: () => stopped.push("stop"),
    maxAttempts: 2
  });
  assert.equal(await capped.recover(original), "stopped");
  assert.equal(await capped.recover(original), "stopped");
  assert.equal(await capped.recover(original), "exhausted");
  assert.deepEqual(stopped, ["stop", "stop", "stop"]);
});

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

test("a delayed background status can never overwrite a newer explicit consent intent", async () => {
  const status = deferred<{ consent: AnalyticsConsent | null; version: string | null }>();
  let intent = 0;
  const writes: string[] = [];

  const background = synchronizeAnalyticsConsent({
    visitorId: "visitor-delayed-status",
    consent: "analytics",
    version: "2026-07-23",
    getStatus: () => status.promise,
    persist: () => enqueueConsentMutation("visitor-delayed-status", async () => {
      if (intent !== 0) return false;
      writes.push("analytics");
      return true;
    }),
    isCurrent: () => intent === 0
  });

  // The user choice increments intent before any network work and therefore wins
  // even when the old GET returns after the necessary POST completes.
  intent += 1;
  await enqueueConsentMutation("visitor-delayed-status", async () => { writes.push("necessary"); return true; });
  status.resolve({ consent: null, version: null });

  assert.equal(await background, "unavailable");
  assert.deepEqual(writes, ["necessary"]);

  const newestIntent = intent;
  const latest = await synchronizeAnalyticsConsent({
    visitorId: "visitor-delayed-status",
    consent: "analytics",
    version: "2026-07-23",
    getStatus: async () => ({ consent: null, version: null }),
    persist: async () => { writes.push("analytics-final"); return true; },
    isCurrent: () => intent === newestIntent
  });
  assert.equal(latest, "resubmitted");
  assert.deepEqual(writes, ["necessary", "analytics-final"]);

  const reverseStatus = deferred<{ consent: AnalyticsConsent | null; version: string | null }>();
  const reverseIntent = { value: 0 };
  const reverse = synchronizeAnalyticsConsent({
    visitorId: "visitor-delayed-status-reverse",
    consent: "necessary",
    version: "2026-07-23",
    getStatus: () => reverseStatus.promise,
    persist: async () => { writes.push("necessary-stale"); return true; },
    isCurrent: () => reverseIntent.value === 0
  });
  reverseIntent.value += 1;
  writes.push("analytics-latest");
  reverseStatus.resolve({ consent: null, version: null });
  assert.equal(await reverse, "unavailable");
  assert.deepEqual(writes, ["necessary", "analytics-final", "analytics-latest"]);
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

test("consent mutations serialize background sync, rapid choices, and failed operations", async () => {
  const first = deferred<string>();
  const calls: string[] = [];
  const background = enqueueConsentMutation("visitor", async () => {
    calls.push("analytics");
    return first.promise;
  });
  const withdrawal = enqueueConsentMutation("visitor", async () => {
    calls.push("necessary");
    return "necessary";
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, ["analytics"]);
  first.resolve("analytics");
  assert.equal(await background, "analytics");
  assert.equal(await withdrawal, "necessary");
  assert.deepEqual(calls, ["analytics", "necessary"]);

  const rapid: string[] = [];
  await Promise.all([
    enqueueConsentMutation("rapid", async () => { rapid.push("analytics"); return "analytics"; }),
    enqueueConsentMutation("rapid", async () => { rapid.push("necessary"); return "necessary"; }),
    enqueueConsentMutation("rapid", async () => { rapid.push("analytics-final"); return "analytics-final"; })
  ]);
  assert.deepEqual(rapid, ["analytics", "necessary", "analytics-final"]);

  await assert.rejects(enqueueConsentMutation("failure", async () => { throw new Error("offline"); }));
  assert.equal(await enqueueConsentMutation("failure", async () => "latest-success"), "latest-success");
});

test("fetch timeouts settle ignored aborts and release the consent mutation tail", async () => {
  const neverResolvingFetcher = (() => new Promise<Response>(() => undefined)) as typeof fetch;
  await assert.rejects(
    fetchWithTimeout("/api/analytics/consent", {}, { fetcher: neverResolvingFetcher, timeoutMs: 5 }),
    AnalyticsRequestTimeoutError
  );
  const externalAbort = new AbortController();
  const externallyCancelled = fetchWithTimeout("/api/analytics/consent", { signal: externalAbort.signal }, {
    fetcher: neverResolvingFetcher,
    timeoutMs: 1_000
  });
  externalAbort.abort(new Error("user cancelled"));
  await assert.rejects(externallyCancelled, /user cancelled/);
  assert.equal(await readAnalyticsConsentStatus(neverResolvingFetcher, 5), null);

  await assert.rejects(enqueueConsentMutation("timeout-visitor", () =>
    fetchWithTimeout("/api/analytics/consent", {}, { fetcher: neverResolvingFetcher, timeoutMs: 5 })
  ), AnalyticsRequestTimeoutError);
  assert.equal(await enqueueConsentMutation("timeout-visitor", async () => "withdrawal-can-proceed"), "withdrawal-can-proceed");
});

test("invalid local consent is removed and only valid choices survive runtime validation", () => {
  const values = new Map<string, string>([[ANALYTICS_CONSENT_KEY, "corrupted"]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key)
  };
  assert.equal(readStoredAnalyticsConsent(storage), null);
  assert.equal(values.has(ANALYTICS_CONSENT_KEY), false);
  values.set(ANALYTICS_CONSENT_KEY, "analytics");
  assert.equal(readStoredAnalyticsConsent(storage), "analytics");
});

test("event delivery retains 403 entries for consent revalidation and drops permanent poison entries", () => {
  const first = queuedEvent("first");
  const next = queuedEvent("next");
  assert.equal(classifyAnalyticsDeliveryStatus(204), "success");
  assert.equal(classifyAnalyticsDeliveryStatus(400), "drop");
  assert.equal(classifyAnalyticsDeliveryStatus(403), "revalidate");
  assert.equal(classifyAnalyticsDeliveryStatus(429), "retry");
  assert.equal(classifyAnalyticsDeliveryStatus(500), "retry");
  assert.equal(classifyAnalyticsDeliveryStatus(null), "retry");
  assert.deepEqual(applyAnalyticsDeliveryDisposition([first, next], "first", "drop"), [next]);
  const revalidate = applyAnalyticsDeliveryDisposition([first, next], "first", "revalidate", 1_000);
  assert.equal(revalidate.length, 2);
  assert.equal(revalidate[0].deliveryAttempts, 1);
  assert.equal(revalidate[0].nextAttemptAt, 1_000 + analyticsDeliveryBackoffMs(1));
  assert.deepEqual(applyAnalyticsDeliveryDisposition(revalidate, "first", "success"), [next]);
  const retry = applyAnalyticsDeliveryDisposition([first, next], "first", "retry", 1_000);
  assert.equal(retry[0].deliveryAttempts, 1);
  assert.equal(retry[0].nextAttemptAt, 1_000 + analyticsDeliveryBackoffMs(1));
  assert.equal(analyticsDeliveryBackoffMs(1), 1_000);
  assert.equal(analyticsDeliveryBackoffMs(20), 60_000);
  let exhausted = [first];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    exhausted = applyAnalyticsDeliveryDisposition(exhausted, "first", "retry", 1_000) as typeof exhausted;
  }
  assert.deepEqual(exhausted, []);

  let forbidden = [first];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    forbidden = applyAnalyticsDeliveryDisposition(forbidden, "first", "revalidate", 1_000) as typeof forbidden;
  }
  assert.deepEqual(forbidden, []);
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
  assert.match(source, /const operation = \+\+userOperationRef\.current/);
  assert.match(source, /if \(operation !== userOperationRef\.current\) return;/);
  assert.match(source, /enqueueConsentMutation\(visitorId/);
  assert.match(source, /readStoredAnalyticsConsent\(localStorage\)/);
  assert.match(source, /markAnalyticsServerReady\(\);/);

  const analyticsSource = readFileSync("lib/analytics.ts", "utf8");
  assert.match(analyticsSource, /if \(!isAnalyticsServerReady\(\)\) return;/);
  assert.match(analyticsSource, /revalidateAnalyticsConsentAfterForbidden\(event\)/);
  assert.match(analyticsSource, /registerAnalyticsConsentRecoveryHandler/);
  assert.match(analyticsSource, /fetchWithTimeout\("\/api\/analytics\/events"/);
});
