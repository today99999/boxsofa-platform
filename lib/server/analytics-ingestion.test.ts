import assert from "node:assert/strict";
import test from "node:test";
import {
  createAnalyticsConsentHandler,
  createAnalyticsConsentIntentHandler,
  createAnalyticsConsentStatusHandler,
  createAnalyticsEventHandler,
  type AnalyticsIngestionRepository,
  type IngestedAnalyticsEvent
} from "./analytics-ingestion.ts";
import { createAnalyticsAttributionService } from "./analytics-attribution.ts";

const PRODUCT_SKU = "BS-CHAMELEONMARIOSOFA-01";
const PRODUCT_UUID = "11111111-1111-4111-8111-111111111111";
const TEST_SIGNING_SECRET = "test-only-analytics-signing-secret-with-at-least-thirty-two-bytes";

type Consent = {
  id: string;
  consent: "necessary" | "analytics";
  revision: number;
  intentRevision: number;
};

type ConsentIntent = {
  id: string;
  visitorId: string;
  revision: number;
  consumed: boolean;
};

class InMemoryAnalyticsRepository implements AnalyticsIngestionRepository {
  consents = new Map<string, Consent>();
  intents = new Map<string, ConsentIntent>();
  events = new Map<string, IngestedAnalyticsEvent>();
  rateLimitRequests: Array<{ bucketKey: string; limit: number; windowSeconds: number }> = [];
  failNext: "rate" | "consent" | "product" | "event" | null = null;
  nextRevision = 0;
  nextIntentRevision = 0;

  async consumeRateLimit(input: { bucketKey: string; limit: number; windowSeconds: number }) {
    if (this.failNext === "rate") {
      this.failNext = null;
      throw new Error("database url=postgres://secret-rate-limit");
    }
    this.rateLimitRequests.push(input);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  async issueConsentIntent(input: { visitorId: string }) {
    const revision = ++this.nextIntentRevision;
    const id = `00000000-0000-4000-8000-${String(revision).padStart(12, "0")}`;
    this.intents.set(id, { id, visitorId: input.visitorId, revision, consumed: false });
    return { id, revision };
  }

  async recordConsent(input: {
    visitorId: string;
    consent: "necessary" | "analytics";
    locale: string;
    version: string;
    intentId: string;
  }) {
    if (this.failNext === "consent") {
      this.failNext = null;
      throw new Error("database url=postgres://secret-consent");
    }
    const intent = this.intents.get(input.intentId);
    const current = this.consents.get(input.visitorId) ?? null;
    if (!intent || intent.consumed || intent.visitorId !== input.visitorId || intent.revision <= (current?.intentRevision ?? 0)) {
      if (intent && intent.visitorId === input.visitorId) intent.consumed = true;
      return {
        accepted: false,
        stale: true,
        id: current?.id ?? null,
        consent: current?.consent ?? null,
        revision: current?.revision ?? null,
        intentRevision: current?.intentRevision ?? null
      };
    }
    intent.consumed = true;
    const consent = {
      id: `consent-${++this.nextRevision}`,
      consent: input.consent,
      revision: this.nextRevision,
      intentRevision: intent.revision
    };
    this.consents.set(input.visitorId, consent);
    return { accepted: true, stale: false, ...consent };
  }

  async resolveProductId(identifier: string) {
    if (this.failNext === "product") {
      this.failNext = null;
      throw new Error("database url=postgres://secret-product");
    }
    return identifier === PRODUCT_SKU || identifier === PRODUCT_UUID ? PRODUCT_UUID : null;
  }

  async ingestEvent(input: IngestedAnalyticsEvent) {
    if (this.failNext === "event") {
      this.failNext = null;
      throw new Error("database url=postgres://secret-event");
    }
    const consent = this.consents.get(input.visitorId);
    if (!consent || consent.consent !== "analytics") {
      return { accepted: false, inserted: false, consentId: null, reason: "analytics_consent_required" };
    }
    const inserted = !this.events.has(input.eventKey);
    if (inserted) {
      this.events.set(input.eventKey, { ...input, consentId: consent.id });
    }
    return { accepted: true, inserted, consentId: consent.id, reason: "accepted" };
  }
}

function handlers(repository = new InMemoryAnalyticsRepository()) {
  const attributionService = createAnalyticsAttributionService(TEST_SIGNING_SECRET);
  return {
    repository,
    intent: createAnalyticsConsentIntentHandler({ repository, attributionService }),
    consent: createAnalyticsConsentHandler({ repository, attributionService }),
    status: createAnalyticsConsentStatusHandler({ attributionService }),
    event: createAnalyticsEventHandler({ repository, attributionService }),
    attributionService
  };
}

function jsonRequest(path: string, body: unknown, headers: HeadersInit = {}) {
  return new Request(`https://boxsofa.eu${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vercel-forwarded-for": "203.0.113.44",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

async function analyticsEventRequest(
  path: string,
  body: unknown,
  source = "google",
  rawUtm: Record<string, string> = {}
) {
  const service = createAnalyticsAttributionService(TEST_SIGNING_SECRET);
  const token = await service.issue({
    source,
    medium: rawUtm.medium ?? null,
    campaign: rawUtm.campaign ?? null,
    referrerDomain: source === "google" ? "news.google.de" : null,
    rawUtm
  });
  return jsonRequest(path, body, { cookie: `boxsofa_attribution_v1=${token}` });
}

function validEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventKey: "evt-11111111-1111-4111-8111-111111111111",
    type: "product_view",
    createdAt: new Date().toISOString(),
    visitorId: "v-11111111-1111-4111-8111-111111111111",
    sessionId: "s-11111111-1111-4111-8111-111111111111",
    path: "/product/chameleon-mario-sofa-01?color=orange",
    source: "forged-social-source",
    medium: "social",
    campaign: "launch",
    referrerDomain: "news.google.de",
    deviceType: "mobile",
    productId: PRODUCT_SKU,
    productName: "Chameleon sofa",
    valueEur: 399,
    ...overrides
  };
}

async function body(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function responseCookieValue(response: Response, name: string): string | null {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function issueConsentIntent(
  intent: ReturnType<typeof createAnalyticsConsentIntentHandler>,
  visitorId: string
) {
  const response = await intent(jsonRequest("/api/analytics/consent/intent", { visitorId }));
  const payload = await body(response);
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(typeof payload.intentId, "string");
  return payload.intentId as string;
}

async function submitConsent(
  instance: ReturnType<typeof handlers>,
  input: { visitorId: string; consent: "necessary" | "analytics"; locale: string; version: string },
  headers: HeadersInit = {}
) {
  const intentId = await issueConsentIntent(instance.intent, input.visitorId);
  return instance.consent(jsonRequest("/api/analytics/consent", { ...input, intentId }, headers));
}

test("server-issued consent intents reject a late old choice without changing cookies", async () => {
  const { consent, intent, repository } = handlers();
  const visitorId = validEvent().visitorId;
  const oldIntent = await issueConsentIntent(intent, visitorId);
  const newerIntent = await issueConsentIntent(intent, visitorId);

  const newest = await consent(jsonRequest("/api/analytics/consent", {
    visitorId,
    consent: "necessary",
    locale: "en",
    version: "2026-07-23",
    intentId: newerIntent
  }));
  const lateOld = await consent(jsonRequest("/api/analytics/consent", {
    visitorId,
    consent: "analytics" as const,
    locale: "en",
    version: "2026-07-23",
    intentId: oldIntent
  }));

  assert.equal(newest.status, 200);
  assert.equal(lateOld.status, 409);
  assert.equal(lateOld.headers.get("set-cookie"), null);
  assert.equal(repository.consents.get(visitorId)?.consent, "necessary");

  const replay = await consent(jsonRequest("/api/analytics/consent", {
    visitorId,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23",
    intentId: newerIntent
  }));
  assert.equal(replay.status, 409);

  const otherVisitor = "v-22222222-2222-4222-8222-222222222222";
  const swapped = await consent(jsonRequest("/api/analytics/consent", {
    visitorId: otherVisitor,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23",
    intentId: oldIntent
  }));
  assert.equal(swapped.status, 409);
  assert.equal(swapped.headers.get("set-cookie"), null);
  assert.equal(repository.consents.has(otherVisitor), false);
});

test("a consent persistence failure leaves the client free to issue and use a fresh intent", async () => {
  const api = handlers();
  const input = {
    visitorId: validEvent().visitorId,
    consent: "analytics" as const,
    locale: "en",
    version: "2026-07-23"
  };
  api.repository.failNext = "consent";
  const failed = await submitConsent(api, input);
  const retried = await submitConsent(api, input);

  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("set-cookie"), null);
  assert.equal(retried.status, 200);
  assert.equal(api.repository.consents.get(input.visitorId)?.consent, "analytics");
});

test("analytics endpoints reject malformed JSON without reaching persistence", async () => {
  const { consent, event, repository } = handlers();
  const malformedConsent = await consent(new Request("https://boxsofa.eu/api/analytics/consent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{"
  }));
  const malformedEvent = await event(new Request("https://boxsofa.eu/api/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{"
  }));

  assert.equal(malformedConsent.status, 400);
  assert.equal(malformedEvent.status, 400);
  assert.equal(repository.rateLimitRequests.length, 0);
});

test("consent status is a no-store cookie-only view that exposes no attribution", async () => {
  const { status, repository, attributionService } = handlers();
  const token = await attributionService.issue({
    source: "tiktok",
    medium: "social",
    campaign: "status-test",
    referrerDomain: null,
    rawUtm: { source: "tiktok" }
  });
  const request = new Request("https://boxsofa.eu/api/analytics/consent", {
    headers: {
      cookie: `boxsofa_analytics_consent_v1=analytics; boxsofa_analytics_consent_version_v1=2026-07-23; boxsofa_attribution_v1=${token}`
    }
  });

  const response = await status(request);
  const payload = await body(response);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.deepEqual(payload, { consent: "analytics", version: "2026-07-23" });
  assert.equal(JSON.stringify(payload).includes("tiktok"), false);
  assert.equal(repository.consents.size, 0);
  assert.equal(repository.rateLimitRequests.length, 0);
});

test("consent status treats expired or separately cleared trusted cookies as absent", async () => {
  const { status, attributionService } = handlers();
  const expiredToken = await attributionService.issue({
    source: "google",
    medium: null,
    campaign: null,
    referrerDomain: "google.com",
    rawUtm: {}
  }, 0);
  const missingAttribution = await status(new Request("https://boxsofa.eu/api/analytics/consent", {
    headers: { cookie: "boxsofa_analytics_consent_v1=analytics; boxsofa_analytics_consent_version_v1=2026-07-23" }
  }));
  const expiredAttribution = await status(new Request("https://boxsofa.eu/api/analytics/consent", {
    headers: { cookie: `boxsofa_analytics_consent_v1=analytics; boxsofa_analytics_consent_version_v1=2026-07-23; boxsofa_attribution_v1=${expiredToken}` }
  }));
  const necessary = await status(new Request("https://boxsofa.eu/api/analytics/consent", {
    headers: { cookie: "boxsofa_analytics_consent_v1=necessary; boxsofa_analytics_consent_version_v1=2026-07-23" }
  }));

  assert.deepEqual(await body(missingAttribution), { consent: null, version: null });
  assert.deepEqual(await body(expiredAttribution), { consent: null, version: null });
  assert.deepEqual(await body(necessary), { consent: "necessary", version: "2026-07-23" });
});

test("analytics event requires current analytics consent", async () => {
  const api = handlers();
  const { event } = api;
  const absent = await event(await analyticsEventRequest("/api/analytics/events", validEvent()));
  assert.equal(absent.status, 403);

  await submitConsent(api, {
    visitorId: validEvent().visitorId,
    consent: "necessary",
    locale: "en",
    version: "2026-07-23"
  });
  const necessary = await event(await analyticsEventRequest("/api/analytics/events", validEvent()));
  assert.equal(necessary.status, 403);
});

test("consent only writes server cookies after persistence and withdrawal expires attribution", async () => {
  const api = handlers();
  const { repository } = api;
  repository.failNext = "consent";
  const failed = await submitConsent(api, {
    visitorId: validEvent().visitorId,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23"
  }, { referer: "https://boxsofa.eu/?utm_source=tiktok&utm_medium=social" });
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("set-cookie"), null);

  const accepted = await submitConsent(api, {
    visitorId: validEvent().visitorId,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23"
  }, { referer: "https://boxsofa.eu/?utm_source=tiktok&utm_medium=social" });
  const acceptedCookies = accepted.headers.get("set-cookie") ?? "";
  assert.equal(accepted.status, 200);
  assert.match(acceptedCookies, /boxsofa_analytics_consent_v1=analytics/);
  assert.match(acceptedCookies, /boxsofa_analytics_consent_version_v1=2026-07-23/);
  assert.match(acceptedCookies, /boxsofa_attribution_v1=/);
  assert.match(acceptedCookies, /HttpOnly/);

  const withdrawn = await submitConsent(api, {
    visitorId: validEvent().visitorId,
    consent: "necessary",
    locale: "en",
    version: "2026-07-23"
  });
  const withdrawnCookies = withdrawn.headers.get("set-cookie") ?? "";
  assert.equal(withdrawn.status, 200);
  assert.match(withdrawnCookies, /boxsofa_analytics_consent_v1=necessary/);
  assert.match(withdrawnCookies, /boxsofa_attribution_v1=;/);
  assert.match(withdrawnCookies, /Max-Age=0/);
});

test("repeated analytics consent preserves a valid last-non-direct attribution on page refresh", async () => {
  const api = handlers();
  const { attributionService } = api;
  const existingToken = await attributionService.issue({
    source: "pinterest",
    medium: "social",
    campaign: "summer",
    referrerDomain: null,
    rawUtm: { source: "pinterest", medium: "social", campaign: "summer" }
  });
  const input: { visitorId: string; consent: "analytics"; locale: string; version: string } = {
    visitorId: validEvent().visitorId,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23"
  };
  const headers = {
    cookie: `boxsofa_attribution_v1=${existingToken}`,
    referer: "https://boxsofa.eu/product/chameleon-mario-sofa-01"
  };

  const refreshed = await submitConsent(api, input, headers);
  const repeated = await submitConsent(api, input, headers);

  assert.equal(refreshed.status, 200);
  assert.equal(repeated.status, 200);
  assert.equal(responseCookieValue(refreshed, "boxsofa_attribution_v1"), existingToken);
  assert.equal(responseCookieValue(repeated, "boxsofa_attribution_v1"), existingToken);
  assert.equal((await attributionService.verify(existingToken))?.source, "pinterest");
});

test("analytics consent replaces prior attribution for a new trusted campaign", async () => {
  const api = handlers();
  const { attributionService } = api;
  const existingToken = await attributionService.issue({
    source: "google",
    medium: null,
    campaign: null,
    referrerDomain: "news.google.de",
    rawUtm: {}
  });

  const response = await submitConsent(api, {
    visitorId: validEvent().visitorId,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23"
  }, {
    cookie: `boxsofa_attribution_v1=${existingToken}`,
    referer: "https://boxsofa.eu/?utm_source=tiktok&utm_medium=social&utm_campaign=autumn"
  });
  const replacement = responseCookieValue(response, "boxsofa_attribution_v1");

  assert.equal(response.status, 200);
  assert.ok(replacement);
  assert.deepEqual(await attributionService.verify(replacement), {
    source: "tiktok",
    medium: "social",
    campaign: "autumn",
    referrerDomain: null,
    rawUtm: { source: "tiktok", medium: "social", campaign: "autumn" },
    issuedAt: (await attributionService.verify(replacement))!.issuedAt,
    expiresAt: (await attributionService.verify(replacement))!.expiresAt
  });
});

test("analytics consent rejects invalid attribution and falls back to direct while withdrawal deletes it", async () => {
  const api = handlers();
  const { attributionService } = api;
  const response = await submitConsent(api, {
    visitorId: validEvent().visitorId,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23"
  }, {
    cookie: "boxsofa_attribution_v1=forged.payload",
    referer: "https://boxsofa.eu/product/chameleon-mario-sofa-01"
  });
  const replacement = responseCookieValue(response, "boxsofa_attribution_v1");

  assert.equal(response.status, 200);
  assert.equal((await attributionService.verify(replacement))?.source, "direct");

  const withdrawal = await submitConsent(api, {
    visitorId: validEvent().visitorId,
    consent: "necessary",
    locale: "en",
    version: "2026-07-23"
  }, { cookie: `boxsofa_attribution_v1=${replacement}` });
  assert.match(withdrawal.headers.get("set-cookie") ?? "", /boxsofa_attribution_v1=;/);
  assert.match(withdrawal.headers.get("set-cookie") ?? "", /Max-Age=0/);
});

test("analytics event persists canonical payload after analytics consent", async () => {
  const api = handlers();
  const { event, repository } = api;
  const input = validEvent({ rawUtm: { source: "tiktok", medium: "social", campaign: "summer" } });
  const consentResponse = await submitConsent(api, {
    visitorId: input.visitorId,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23"
  });
  const eventResponse = await event(await analyticsEventRequest(
    "/api/analytics/events",
    input,
    "tiktok",
    { source: "tiktok", medium: "social", campaign: "summer" }
  ));

  assert.equal(consentResponse.status, 200);
  assert.deepEqual(await body(consentResponse), { ok: true });
  assert.equal(eventResponse.status, 200);
  assert.deepEqual(await body(eventResponse), { ok: true });
  const stored = repository.events.get(input.eventKey)!;
  assert.equal(stored.productId, PRODUCT_UUID);
  assert.equal(stored.source, "tiktok");
  assert.equal(stored.medium, "social");
  assert.equal(stored.campaign, "summer");
  assert.deepEqual(stored.rawUtm, { source: "tiktok", medium: "social", campaign: "summer" });
  assert.equal(stored.consentId, "consent-1");
  assert.equal(stored.valueEur, 399);
});

test("signed UTM attribution remains compatible while client UTM fields are ignored", async () => {
  const api = handlers();
  const { event, repository } = api;
  const input = validEvent({
    eventKey: "evt-12121212-1212-4212-8212-121212121212",
    source: "pinterest",
    medium: "social",
    campaign: "summer",
    referrerDomain: "google.com"
  });
  await submitConsent(api, {
    visitorId: input.visitorId,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23"
  });

  assert.equal((await event(await analyticsEventRequest(
    "/api/analytics/events",
    input,
    "pinterest",
    { source: "pinterest", medium: "social", campaign: "summer" }
  ))).status, 200);
  const stored = repository.events.get(input.eventKey)!;
  assert.equal(stored.source, "pinterest");
  assert.deepEqual(stored.rawUtm, { source: "pinterest", medium: "social", campaign: "summer" });
});

test("withdrawn analytics consent rejects later events and duplicate keys stay idempotent", async () => {
  const api = handlers();
  const { event, repository } = api;
  const input = validEvent();
  await submitConsent(api, {
    visitorId: input.visitorId,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23"
  });
  assert.equal((await event(await analyticsEventRequest("/api/analytics/events", input))).status, 200);
  assert.equal((await event(await analyticsEventRequest("/api/analytics/events", input))).status, 200);
  assert.equal(repository.events.size, 1);

  await submitConsent(api, {
    visitorId: input.visitorId,
    consent: "necessary",
    locale: "en",
    version: "2026-07-23"
  });
  assert.equal((await event(await analyticsEventRequest(
    "/api/analytics/events",
    validEvent({ eventKey: "evt-22222222-2222-4222-8222-222222222222" })
  ))).status, 403);
});

test("analytics event ignores client attribution and rejects invalid signed attribution, timestamps, and paths", async () => {
  const api = handlers();
  const { event, repository } = api;
  const input = validEvent({
    eventKey: "evt-33333333-3333-4333-8333-333333333333",
    medium: undefined,
    campaign: undefined,
    referrerDomain: "untrusted.example",
    source: "facebook",
    utmSource: "facebook",
    utmMedium: "social",
    utmCampaign: "forged-campaign",
    rawUtm: { source: "facebook", medium: "social", campaign: "forged-campaign" }
  });
  await submitConsent(api, {
    visitorId: input.visitorId,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23"
  });
  assert.equal((await event(await analyticsEventRequest("/api/analytics/events", input))).status, 200);
  assert.equal(repository.events.get(input.eventKey)?.source, "google");

  const forgedLegacy = await event(await analyticsEventRequest("/api/analytics/events", validEvent({
    eventKey: "evt-34343434-3434-4434-8434-343434343434",
    source: "forged-network",
    medium: "social",
    campaign: "fake",
    referrerDomain: "news.google.de"
  })));
  assert.equal(forgedLegacy.status, 200);
  assert.equal(repository.events.get("evt-34343434-3434-4434-8434-343434343434")?.source, "google");

  const invalidToken = await event(jsonRequest("/api/analytics/events", validEvent({
    eventKey: "evt-35353535-3535-4535-8535-353535353535"
  }), { cookie: "boxsofa_attribution_v1=forged.payload" }));
  assert.equal(invalidToken.status, 400);

  const stale = await event(await analyticsEventRequest("/api/analytics/events", validEvent({
    eventKey: "evt-44444444-4444-4444-8444-444444444444",
    createdAt: "2000-01-01T00:00:00.000Z"
  })));
  const unsafePath = await event(await analyticsEventRequest("/api/analytics/events", validEvent({
    eventKey: "evt-55555555-5555-4555-8555-555555555555",
    path: "//evil.example/path"
  })));
  assert.equal(stale.status, 400);
  assert.equal(unsafePath.status, 400);
});

test("analytics database failures are redacted and persistent limit keys are hashed", async () => {
  const api = handlers();
  const { event, repository } = api;
  const input = validEvent({ eventKey: "evt-66666666-6666-4666-8666-666666666666" });
  await submitConsent(api, {
    visitorId: input.visitorId,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23"
  });
  repository.failNext = "event";
  const response = await event(await analyticsEventRequest("/api/analytics/events", input));
  const responseBody = await body(response);

  assert.equal(response.status, 503);
  assert.equal(JSON.stringify(responseBody).includes("postgres://secret-event"), false);
  assert.ok(repository.rateLimitRequests.length >= 3);
  for (const request of repository.rateLimitRequests) {
    assert.equal(request.bucketKey.includes("203.0.113.44"), false);
    assert.match(request.bucketKey, /^[a-f0-9]{64}$/);
  }
});
