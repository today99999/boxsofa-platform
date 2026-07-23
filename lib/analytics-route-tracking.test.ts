import assert from "node:assert/strict";
import test from "node:test";
import {
  createNavigationTrackingCoordinator,
  navigationTrackingKey,
  productTrackingFieldsForPath
} from "./analytics-route-tracking.ts";

test("route tracking normalizes query order and ignores duplicate navigations", () => {
  assert.equal(navigationTrackingKey("/category/all", "b=2&a=1"), "/category/all?a=1&b=2");
  assert.equal(navigationTrackingKey("/category/all", "a=1&b=2"), "/category/all?a=1&b=2");

  const events: Array<{ type: string; fields?: unknown }> = [];
  const coordinator = createNavigationTrackingCoordinator((type, fields) => events.push({ type, fields }));
  assert.equal(coordinator.track("/category/all", "b=2&a=1"), true);
  assert.equal(coordinator.track("/category/all", "a=1&b=2"), false);
  assert.equal(coordinator.track("/category/all", "a=2"), true);
  coordinator.reset();
  assert.equal(coordinator.track("/category/all", "a=2"), true);
  assert.deepEqual(events.map((event) => event.type), ["page_view", "page_view", "page_view"]);
});

test("product route tracking emits trusted catalog metadata with the page view", () => {
  const fields = productTrackingFieldsForPath("/product/chameleon-mario-sofa-01");
  assert.equal(fields?.productSlug, "chameleon-mario-sofa-01");
  assert.ok(fields?.productId);
  assert.ok(fields?.productName);
  assert.equal(productTrackingFieldsForPath("/product/not-in-catalog"), null);

  const events: Array<{ type: string; fields?: unknown }> = [];
  createNavigationTrackingCoordinator((type, metadata) => events.push({ type, fields: metadata }))
    .track("/product/chameleon-mario-sofa-01");
  assert.deepEqual(events.map((event) => event.type), ["page_view", "product_view"]);
  assert.deepEqual(events[1].fields, fields);
});

test("route lifecycle preserves an unchanged route through temporary 403 recovery", () => {
  const events: Array<{ type: string; fields?: unknown }> = [];
  const coordinator = createNavigationTrackingCoordinator((type, fields) => events.push({ type, fields }));

  assert.equal(coordinator.reconcile("/category/all", "", { ready: true, reason: "ready" }), true);
  assert.equal(coordinator.reconcile("/category/all", "", { ready: false, reason: "temporary" }), false);
  assert.equal(coordinator.reconcile("/category/all", "", { ready: true, reason: "ready" }), false);

  assert.deepEqual(events.map((event) => event.type), ["page_view"]);
});

test("route lifecycle tracks one newer navigation after temporary recovery", () => {
  const events: Array<{ type: string; fields?: unknown }> = [];
  const coordinator = createNavigationTrackingCoordinator((type, fields) => events.push({ type, fields }));

  coordinator.reconcile("/", "", { ready: true, reason: "ready" });
  coordinator.reconcile("/", "", { ready: false, reason: "temporary" });
  coordinator.reconcile("/product/chameleon-mario-sofa-01", "", { ready: false, reason: "temporary" });
  assert.equal(coordinator.reconcile("/product/chameleon-mario-sofa-01", "", { ready: true, reason: "ready" }), true);
  assert.equal(coordinator.reconcile("/product/chameleon-mario-sofa-01", "", { ready: true, reason: "ready" }), false);

  assert.deepEqual(events.map((event) => event.type), ["page_view", "page_view", "product_view"]);
});

test("route lifecycle resets only for a genuine withdrawal and remains Strict Mode safe", () => {
  const events: Array<{ type: string; fields?: unknown }> = [];
  const coordinator = createNavigationTrackingCoordinator((type, fields) => events.push({ type, fields }));
  const productPath = "/product/chameleon-mario-sofa-01";

  coordinator.reconcile(productPath, "", { ready: true, reason: "ready" });
  coordinator.reconcile(productPath, "", { ready: false, reason: "withdrawn" });
  coordinator.reconcile(productPath, "", { ready: false, reason: "withdrawn" });
  assert.equal(coordinator.reconcile(productPath, "", { ready: true, reason: "ready" }), true);
  assert.equal(coordinator.reconcile(productPath, "", { ready: true, reason: "ready" }), false);

  assert.deepEqual(events.map((event) => event.type), [
    "page_view",
    "product_view",
    "page_view",
    "product_view"
  ]);
});
