import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTRIBUTION_COOKIE_NAME,
  createAnalyticsAttributionService,
  resolveTrustedAttribution
} from "./analytics-attribution.ts";

const SECRET = "test-only-analytics-signing-secret-with-at-least-thirty-two-bytes";

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

test("attribution token uses a dedicated HttpOnly cookie name", () => {
  assert.equal(ATTRIBUTION_COOKIE_NAME, "boxsofa_attribution_v1");
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
