import assert from "node:assert/strict";
import test from "node:test";
import { calculateCommerceMetrics, resolveAttribution } from "./metrics.ts";

test("GMV includes paid orders and net sales subtracts completed refunds", () => {
  const result = calculateCommerceMetrics({
    orders: [
      { id: "1", paymentStatus: "paid", totalEur: 399 },
      { id: "2", paymentStatus: "refunded", totalEur: 719 },
      { id: "3", paymentStatus: "not_started", totalEur: 210 }
    ],
    refunds: [{ orderId: "2", amountEur: 100, completed: true }],
    uniqueVisitors: 200
  });

  assert.equal(result.gmvEur, 1118);
  assert.equal(result.netSalesEur, 1018);
  assert.equal(result.paidOrders, 2);
  assert.equal(result.conversionRate, 0.01);
});

test("incomplete refunds do not reduce net sales and zero visitors has no conversion rate", () => {
  const result = calculateCommerceMetrics({
    orders: [{ id: "1", paymentStatus: "paid", totalEur: 399 }],
    refunds: [{ orderId: "1", amountEur: 399, completed: false }],
    uniqueVisitors: 0
  });

  assert.equal(result.gmvEur, 399);
  assert.equal(result.netSalesEur, 399);
  assert.equal(result.averageOrderValueEur, 399);
  assert.equal(result.conversionRate, null);
});

test("attribution prefers UTM then non-direct referrer", () => {
  assert.deepEqual(resolveAttribution({ utmSource: "TikTok", referrer: "https://google.com" }), {
    source: "tiktok",
    method: "utm"
  });
  assert.deepEqual(resolveAttribution({ referrer: "https://www.instagram.com/reel/1" }), {
    source: "instagram",
    method: "referrer"
  });
});

test("Google country domains are recognized by strict hostname boundaries", () => {
  for (const referrer of [
    "https://google.com/search?q=boxsofa",
    "https://www.google.com/search?q=boxsofa",
    "https://google.co.uk/search?q=boxsofa",
    "https://www.google.de/search?q=boxsofa",
    "https://google.com.au/search?q=boxsofa"
  ]) {
    assert.deepEqual(resolveAttribution({ referrer }), {
      source: "google",
      method: "referrer"
    });
  }
});

test("Google lookalike and malformed referrers fall back safely", () => {
  for (const referrer of [
    "https://google.evil.test/search?q=boxsofa",
    "https://www.google.fake/search?q=boxsofa",
    "https://google.com.evil.test/search?q=boxsofa",
    "not a valid URL"
  ]) {
    assert.deepEqual(resolveAttribution({ referrer }), {
      source: "referral",
      method: "inferred"
    });
  }
});

test("a direct touch carries forward its prior non-direct attribution", () => {
  assert.deepEqual(
    resolveAttribution({
      referrer: null,
      priorLastNonDirect: { source: "Pinterest", method: "referrer" }
    }),
    { source: "pinterest", method: "last_non_direct" }
  );
});

test("unrecognized referrers are kept separate from direct traffic", () => {
  assert.deepEqual(resolveAttribution({ referrer: "https://example-partner.test/article" }), {
    source: "referral",
    method: "inferred"
  });
  assert.deepEqual(resolveAttribution({}), { source: "direct", method: "inferred" });
});
