import assert from "node:assert/strict";
import test from "node:test";
import {
  ANALYTICS_CONSENT_COOKIE_NAME,
  ATTRIBUTION_COOKIE_NAME,
  createAnalyticsAttributionService,
  getOwnedAnalyticsHosts,
  resolveOrderAttribution,
  resolveAttributionForConsentState,
  resolveTrustedAttribution
} from "./analytics-attribution.ts";
import type { AnalyticsAttributionService } from "./analytics-attribution.ts";

const SECRET = "test-only-analytics-signing-secret-with-at-least-thirty-two-bytes";
const DIRECT_ORDER_ATTRIBUTION = {
  source: "direct",
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  referrer: null
};

test("trusted entry attribution accepts utm_source-only URLs and preserves direct follow-up traffic", async () => {
  const service = createAnalyticsAttributionService(SECRET);
  const entry = await resolveTrustedAttribution({
    url: "https://boxsofa.eu/category/all?utm_source=tiktok",
    referrer: null,
    existingToken: null,
    siteOrigin: "https://boxsofa.eu",
    service,
    now: 1_700_000_000_000
  });

  assert.equal(entry.attribution.source, "tiktok");
  assert.deepEqual(entry.attribution.rawUtm, { source: "tiktok" });
  assert.ok(entry.token);

  const direct = await resolveTrustedAttribution({
    url: "https://boxsofa.eu/product/chameleon-mario-sofa-01",
    referrer: "https://boxsofa.eu/category/all",
    existingToken: entry.token,
    siteOrigin: "https://boxsofa.eu",
    service,
    now: 1_700_000_100_000
  });
  assert.equal(direct.attribution.source, "tiktok");
  assert.equal(direct.token, entry.token);
});

test("trusted entry attribution recognizes an external referrer and never accepts forged tokens", async () => {
  const service = createAnalyticsAttributionService(SECRET);
  const entry = await resolveTrustedAttribution({
    url: "https://boxsofa.eu/",
    referrer: "https://news.google.co.uk/article",
    existingToken: null,
    siteOrigin: "https://boxsofa.eu",
    service,
    now: 1_700_000_000_000
  });

  assert.equal(entry.attribution.source, "google");
  assert.equal(entry.attribution.referrerDomain, "news.google.co.uk");
  assert.ok(entry.token);

  const [payload, signature] = entry.token!.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({
    source: "facebook",
    rawUtm: { source: "facebook" },
    issuedAt: 1_700_000_000_000,
    expiresAt: 1_700_000_000_000 + 60_000
  })).toString("base64url");
  assert.equal(await service.verify(`${forgedPayload}.${signature}`, 1_700_000_001_000), null);
  assert.equal(await service.verify(`${payload}.${signature}x`, 1_700_000_001_000), null);
  assert.equal(await service.verify(entry.token!, 1_700_000_000_000 + 31 * 24 * 60 * 60 * 1000), null);
});

test("owned host aliases and protocol transitions preserve the prior non-direct attribution", async () => {
  const service = createAnalyticsAttributionService(SECRET);
  const entry = await resolveTrustedAttribution({
    url: "https://boxsofa.eu/?utm_source=pinterest&utm_medium=social",
    referrer: null,
    existingToken: null,
    ownHosts: getOwnedAnalyticsHosts("https://boxsofa.eu"),
    service,
    now: 1_700_000_000_000
  });

  const internal = await resolveTrustedAttribution({
    url: "https://boxsofa.eu/product/chameleon-mario-sofa-01",
    referrer: "http://www.boxsofa.eu/category/all",
    existingToken: entry.token,
    ownHosts: getOwnedAnalyticsHosts("https://boxsofa.eu"),
    service,
    now: 1_700_000_100_000
  });

  assert.equal(internal.attribution.source, "pinterest");
  assert.equal(internal.shouldSetCookie, false);
});

test("trusted attribution accepts configured own hosts but not arbitrary request hosts", () => {
  const hosts = getOwnedAnalyticsHosts("https://shop.boxsofa.eu");
  assert.equal(hosts.has("boxsofa.eu"), true);
  assert.equal(hosts.has("www.boxsofa.eu"), true);
  assert.equal(hosts.has("shop.boxsofa.eu"), true);
  assert.equal(hosts.has("attacker.example"), false);
});

test("middleware attribution decisions clear stale tokens unless trusted consent is analytics", async () => {
  const service = createAnalyticsAttributionService(SECRET);
  const common = {
    url: "https://boxsofa.eu/?utm_source=facebook",
    referrer: null,
    existingToken: null,
    ownHosts: getOwnedAnalyticsHosts("https://boxsofa.eu"),
    service,
    now: 1_700_000_000_000
  };

  const absent = await resolveAttributionForConsentState({
    ...common,
    consentState: null,
    existingToken: "legacy-attribution-token",
    service: null
  });
  assert.deepEqual(absent, { shouldClearAttribution: true, token: null, shouldSetCookie: false });

  const necessary = await resolveAttributionForConsentState({
    ...common,
    consentState: "necessary",
    existingToken: "legacy-attribution-token",
    service: null
  });
  assert.deepEqual(necessary, { shouldClearAttribution: true, token: null, shouldSetCookie: false });

  const malformed = await resolveAttributionForConsentState({
    ...common,
    consentState: "unexpected-value",
    existingToken: "legacy-attribution-token",
    service: null
  });
  assert.deepEqual(malformed, { shouldClearAttribution: true, token: null, shouldSetCookie: false });

  const unavailableSecurity = await resolveAttributionForConsentState({
    ...common,
    consentState: "analytics",
    service: null
  });
  assert.deepEqual(unavailableSecurity, { shouldClearAttribution: false, token: null, shouldSetCookie: false });

  const analytics = await resolveAttributionForConsentState({ ...common, consentState: "analytics" });
  assert.equal(analytics.shouldClearAttribution, false);
  assert.equal(analytics.shouldSetCookie, true);
  assert.ok(analytics.token);

  const external = await resolveAttributionForConsentState({
    ...common,
    url: "https://boxsofa.eu/products",
    referrer: "https://news.google.co.uk/article",
    consentState: "analytics"
  });
  assert.equal((await service.verify(external.token, common.now))?.source, "google");
});

test("attribution token uses a dedicated HttpOnly cookie name", () => {
  assert.equal(ATTRIBUTION_COOKIE_NAME, "boxsofa_attribution_v1");
  assert.equal(ANALYTICS_CONSENT_COOKIE_NAME, "boxsofa_analytics_consent_v1");
});

test("rate-limit identifiers use purpose-separated HMAC output", async () => {
  const service = createAnalyticsAttributionService(SECRET);
  const identity = "analytics:event:address:203.0.113.44";
  const first = await service.hmacHex("analytics-rate-limit:v1", identity);
  const repeated = await service.hmacHex("analytics-rate-limit:v1", identity);
  const otherPurpose = await service.hmacHex("another-purpose", identity);

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, repeated);
  assert.notEqual(first, otherPurpose);
  assert.equal(first.includes("203.0.113.44"), false);
});

test("order attribution ignores forged browser URL, referrer, and body data without trusted consent and token", async () => {
  const service = createAnalyticsAttributionService(SECRET);
  const request = new Request("https://boxsofa.eu/api/orders?utm_source=google&utm_medium=cpc&utm_campaign=chairs", {
    method: "POST",
    headers: {
      referer: "https://boxsofa.eu/product/chameleon-mario-sofa-01",
      origin: "https://forged.example",
      "x-forwarded-for": "203.0.113.42",
      "x-forwarded-host": "forged.example"
    },
    body: JSON.stringify({
      attribution: {
        source: "forged-affiliate",
        medium: "paid",
        campaign: "fake-gmv",
        referrer: "https://evil.example/path"
      }
    })
  });

  assert.deepEqual(await resolveOrderAttribution({ request, service }), DIRECT_ORDER_ATTRIBUTION);
});

test("order attribution persists only a consented valid signed HttpOnly attribution", async () => {
  const service = createAnalyticsAttributionService(SECRET);
  const token = await service.issue({
    source: "pinterest",
    medium: "social",
    campaign: "summer",
    referrerDomain: "news.google.de",
    rawUtm: { source: "pinterest", medium: "social", campaign: "summer" }
  });
  const request = new Request("https://boxsofa.eu/api/orders?utm_source=google", {
    method: "POST",
    headers: {
      cookie: `${ANALYTICS_CONSENT_COOKIE_NAME}=analytics; ${ATTRIBUTION_COOKIE_NAME}=${encodeURIComponent(token)}`,
      referer: "https://boxsofa.eu/cart"
    }
  });

  assert.deepEqual(await resolveOrderAttribution({ request, service }), {
    source: "pinterest",
    utm_source: "pinterest",
    utm_medium: "social",
    utm_campaign: "summer",
    referrer: "news.google.de"
  });
});

test("order attribution returns direct for necessary consent even with a valid signed token", async () => {
  const service = createAnalyticsAttributionService(SECRET);
  const token = await service.issue({
    source: "pinterest",
    medium: "social",
    campaign: "summer",
    referrerDomain: "news.google.de",
    rawUtm: { source: "pinterest" }
  });
  const request = new Request("https://boxsofa.eu/api/orders?utm_source=forged", {
    method: "POST",
    headers: {
      cookie: `${ANALYTICS_CONSENT_COOKIE_NAME}=necessary; ${ATTRIBUTION_COOKIE_NAME}=${encodeURIComponent(token)}`,
      referer: "https://www.google.com/search?q=boxsofa"
    }
  });

  assert.deepEqual(await resolveOrderAttribution({ request, service }), DIRECT_ORDER_ATTRIBUTION);
});

test("order attribution returns direct for a malformed server consent state", async () => {
  const service = createAnalyticsAttributionService(SECRET);
  const token = await service.issue({
    source: "tiktok",
    medium: "social",
    campaign: "summer",
    referrerDomain: null,
    rawUtm: { source: "tiktok" }
  });
  const request = new Request("https://boxsofa.eu/api/orders", {
    method: "POST",
    headers: {
      cookie: `${ANALYTICS_CONSENT_COOKIE_NAME}=analytics-but-invalid; ${ATTRIBUTION_COOKIE_NAME}=${encodeURIComponent(token)}`
    }
  });
  assert.deepEqual(await resolveOrderAttribution({ request, service }), DIRECT_ORDER_ATTRIBUTION);
});

test("order attribution returns direct for invalid, expired, cross-context, missing, or throwing verification", async () => {
  const service = createAnalyticsAttributionService(SECRET);
  const otherService = createAnalyticsAttributionService(`${SECRET}-other-context-secret`);
  const expiredToken = await service.issue({
    source: "tiktok",
    medium: "social",
    campaign: "expired",
    referrerDomain: null,
    rawUtm: { source: "tiktok" }
  }, 0);
  const crossContextToken = await otherService.issue({
    source: "affiliate",
    medium: "partner",
    campaign: "wrong-secret",
    referrerDomain: "partner.example",
    rawUtm: { source: "affiliate" }
  });

  for (const token of [null, "forged.payload", expiredToken, crossContextToken]) {
    const request = new Request("https://boxsofa.eu/api/orders", {
      method: "POST",
      headers: {
        cookie: `${ANALYTICS_CONSENT_COOKIE_NAME}=analytics${token ? `; ${ATTRIBUTION_COOKIE_NAME}=${encodeURIComponent(token)}` : ""}`,
        referer: "https://www.google.com/search?q=boxsofa"
      }
    });

    assert.deepEqual(await resolveOrderAttribution({ request, service, now: 31 * 24 * 60 * 60 * 1000 }), DIRECT_ORDER_ATTRIBUTION);
  }

  const throwingService = {
    verify: async () => { throw new Error("verification unavailable"); }
  } as unknown as AnalyticsAttributionService;
  const request = new Request("https://boxsofa.eu/api/orders?utm_source=forged", {
    method: "POST",
    headers: { cookie: `${ANALYTICS_CONSENT_COOKIE_NAME}=analytics; ${ATTRIBUTION_COOKIE_NAME}=looks-signed` }
  });
  assert.deepEqual(await resolveOrderAttribution({ request, service: throwingService }), DIRECT_ORDER_ATTRIBUTION);
});

test("order attribution keeps canonical source separate from verified raw UTM fields", async () => {
  const service = createAnalyticsAttributionService(SECRET);
  const token = await service.issue({
    source: "google",
    medium: null,
    campaign: null,
    referrerDomain: "www.google.com",
    rawUtm: {}
  });
  const request = new Request("https://boxsofa.eu/api/orders", {
    method: "POST",
    headers: {
      cookie: `${ANALYTICS_CONSENT_COOKIE_NAME}=analytics; ${ATTRIBUTION_COOKIE_NAME}=${encodeURIComponent(token)}`
    }
  });

  assert.deepEqual(await resolveOrderAttribution({ request, service }), {
    source: "google",
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    referrer: "www.google.com"
  });
});

test("order attribution remains backward compatible with old payload attribution shapes", async () => {
  const request = new Request("https://boxsofa.eu/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${ANALYTICS_CONSENT_COOKIE_NAME}=analytics` },
    body: JSON.stringify({
      attribution: {
        source: "old-browser-storage",
        medium: "legacy",
        campaign: "legacy-campaign",
        referrer: "https://legacy.example",
        occurredAt: "2026-07-23T00:00:00.000Z"
      }
    })
  });

  assert.deepEqual(await resolveOrderAttribution({ request, service: null }), DIRECT_ORDER_ATTRIBUTION);
});
