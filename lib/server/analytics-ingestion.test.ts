import assert from "node:assert/strict";
import test from "node:test";
import {
  createAnalyticsConsentHandler,
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
};

class InMemoryAnalyticsRepository implements AnalyticsIngestionRepository {
  consents = new Map<string, Consent>();
  events = new Map<string, IngestedAnalyticsEvent>();
  rateLimitRequests: Array<{ bucketKey: string; limit: number; windowSeconds: number }> = [];
  failNext: "rate" | "consent" | "product" | "event" | null = null;
  nextRevision = 0;

  async consumeRateLimit(input: { bucketKey: string; limit: number; windowSeconds: number }) {
    if (this.failNext === "rate") {
      this.failNext = null;
      throw new Error("database url=postgres://secret-rate-limit");
    }
    this.rateLimitRequests.push(input);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  async recordConsent(input: { visitorId: string; consent: "necessary" | "analytics"; locale: string; version: string }) {
    if (this.failNext === "consent") {
      this.failNext = null;
      throw new Error("database url=postgres://secret-consent");
    }
    const consent = { id: `consent-${++this.nextRevision}`, consent: input.consent, revision: this.nextRevision };
    this.consents.set(input.visitorId, consent);
    return consent;
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
    consent: createAnalyticsConsentHandler({ repository, attributionService }),
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

test("analytics event requires current analytics consent", async () => {
  const { consent, event } = handlers();
  const absent = await event(await analyticsEventRequest("/api/analytics/events", validEvent()));
  assert.equal(absent.status, 403);

  await consent(jsonRequest("/api/analytics/consent", {
    visitorId: validEvent().visitorId,
    consent: "necessary",
    locale: "en",
    version: "2026-07-23"
  }));
  const necessary = await event(await analyticsEventRequest("/api/analytics/events", validEvent()));
  assert.equal(necessary.status, 403);
});

test("consent only writes server cookies after persistence and withdrawal expires attribution", async () => {
  const { consent, repository } = handlers();
  repository.failNext = "consent";
  const failed = await consent(jsonRequest("/api/analytics/consent", {
    visitorId: validEvent().visitorId,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23"
  }, { referer: "https://boxsofa.eu/?utm_source=tiktok&utm_medium=social" }));
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("set-cookie"), null);

  const accepted = await consent(jsonRequest("/api/analytics/consent", {
    visitorId: validEvent().visitorId,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23"
  }, { referer: "https://boxsofa.eu/?utm_source=tiktok&utm_medium=social" }));
  const acceptedCookies = accepted.headers.get("set-cookie") ?? "";
  assert.equal(accepted.status, 200);
  assert.match(acceptedCookies, /boxsofa_analytics_consent_v1=analytics/);
  assert.match(acceptedCookies, /boxsofa_attribution_v1=/);
  assert.match(acceptedCookies, /HttpOnly/);

  const withdrawn = await consent(jsonRequest("/api/analytics/consent", {
    visitorId: validEvent().visitorId,
    consent: "necessary",
    locale: "en",
    version: "2026-07-23"
  }));
  const withdrawnCookies = withdrawn.headers.get("set-cookie") ?? "";
  assert.equal(withdrawn.status, 200);
  assert.match(withdrawnCookies, /boxsofa_analytics_consent_v1=necessary/);
  assert.match(withdrawnCookies, /boxsofa_attribution_v1=;/);
  assert.match(withdrawnCookies, /Max-Age=0/);
});

test("analytics event persists canonical payload after analytics consent", async () => {
  const { consent, event, repository } = handlers();
  const input = validEvent({ rawUtm: { source: "tiktok", medium: "social", campaign: "summer" } });
  const consentResponse = await consent(jsonRequest("/api/analytics/consent", {
    visitorId: input.visitorId,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23"
  }));
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
  const { consent, event, repository } = handlers();
  const input = validEvent({
    eventKey: "evt-12121212-1212-4212-8212-121212121212",
    source: "pinterest",
    medium: "social",
    campaign: "summer",
    referrerDomain: "google.com"
  });
  await consent(jsonRequest("/api/analytics/consent", {
    visitorId: input.visitorId,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23"
  }));

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
  const { consent, event, repository } = handlers();
  const input = validEvent();
  await consent(jsonRequest("/api/analytics/consent", {
    visitorId: input.visitorId,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23"
  }));
  assert.equal((await event(await analyticsEventRequest("/api/analytics/events", input))).status, 200);
  assert.equal((await event(await analyticsEventRequest("/api/analytics/events", input))).status, 200);
  assert.equal(repository.events.size, 1);

  await consent(jsonRequest("/api/analytics/consent", {
    visitorId: input.visitorId,
    consent: "necessary",
    locale: "en",
    version: "2026-07-23"
  }));
  assert.equal((await event(await analyticsEventRequest(
    "/api/analytics/events",
    validEvent({ eventKey: "evt-22222222-2222-4222-8222-222222222222" })
  ))).status, 403);
});

test("analytics event ignores client attribution and rejects invalid signed attribution, timestamps, and paths", async () => {
  const { consent, event, repository } = handlers();
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
  await consent(jsonRequest("/api/analytics/consent", {
    visitorId: input.visitorId,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23"
  }));
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
  const { consent, event, repository } = handlers();
  const input = validEvent({ eventKey: "evt-66666666-6666-4666-8666-666666666666" });
  await consent(jsonRequest("/api/analytics/consent", {
    visitorId: input.visitorId,
    consent: "analytics",
    locale: "en",
    version: "2026-07-23"
  }));
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
