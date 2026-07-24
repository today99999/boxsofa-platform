import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createStripeRefundProcessor,
  isFullRefund,
  type StripeRefundInput,
  type StripeRefundRepository
} from "../server/stripe-refunds.ts";
import {
  buildOverviewMetrics,
  buildOverviewMetricsFromAggregate,
  getOverviewDateRange,
  getOverviewSourceFailure,
  parseOverviewRange,
  toPublicOverviewErrorMessage
} from "../server/data-center-overview.ts";
import { calculateCommerceMetrics } from "./metrics.ts";
import { normalizeStripeRefundStatus, resolveMonotonicRefundStatus } from "../server/stripe-refunds.ts";

type StoredRefund = {
  orderId: string;
  paymentId: string;
  providerRefundId: string;
  amountCents: number;
  currency: "EUR";
  status: "pending" | "succeeded" | "failed" | "cancelled";
  reason: string | null;
  rawPayload: unknown;
  succeededAt?: string | null;
};

class InMemoryRefundRepository implements StripeRefundRepository {
  readonly refunds = new Map<string, StoredRefund>();
  readonly markedRefundedOrderIds = new Set<string>();
  payment: { id: string; orderId: string } | null = { id: "payment-1", orderId: "order-1" };
  orderTotalCents: number | null = 71900;

  async findPaidStripePayment(paymentIntentId: string) {
    return paymentIntentId === "pi_paid" ? this.payment : null;
  }

  async findRefund(providerRefundId: string) {
    return this.refunds.get(providerRefundId) ?? null;
  }

  async upsertRefund(refund: StoredRefund) {
    this.refunds.set(refund.providerRefundId, refund);
  }

  async getSucceededRefundTotalCents(orderId: string) {
    return Array.from(this.refunds.values())
      .filter((refund) => refund.orderId === orderId && refund.status === "succeeded")
      .reduce((total, refund) => total + refund.amountCents, 0);
  }

  async getOrderTotalCents(orderId: string) {
    return orderId === "order-1" ? this.orderTotalCents : null;
  }

  async markOrderRefunded(orderId: string) {
    this.markedRefundedOrderIds.add(orderId);
  }
}

function refund(overrides: Partial<StripeRefundInput> = {}): StripeRefundInput {
  return {
    id: "re_1",
    paymentIntentId: "pi_paid",
    amountCents: 71900,
    currency: "EUR",
    status: "succeeded",
    reason: null,
    rawPayload: { object: "refund", id: "re_1" },
    ...overrides
  };
}

test("overview range accepts bounded presets", () => {
  assert.equal(parseOverviewRange("today").days, 1);
  assert.equal(parseOverviewRange("7d").days, 7);
  assert.equal(parseOverviewRange("30d").days, 30);
  assert.equal(parseOverviewRange("bad").days, 7);
});

test("today uses Madrid calendar boundaries across both DST transitions", () => {
  const spring = getOverviewDateRange("today", new Date("2026-03-29T12:00:00.000Z"));
  assert.equal(spring.startAt, "2026-03-28T23:00:00.000Z");
  assert.equal(spring.endAt, "2026-03-29T22:00:00.000Z");

  const autumn = getOverviewDateRange("today", new Date("2026-10-25T12:00:00.000Z"));
  assert.equal(autumn.startAt, "2026-10-24T22:00:00.000Z");
  assert.equal(autumn.endAt, "2026-10-25T23:00:00.000Z");
});

test("seven-day ranges use deterministic Madrid calendar days", () => {
  const range = getOverviewDateRange("7d", new Date("2026-03-29T12:00:00.000Z"));
  assert.equal(range.days, 7);
  assert.equal(range.startAt, "2026-03-22T23:00:00.000Z");
  assert.equal(range.endAt, "2026-03-29T22:00:00.000Z");
});

test("full refund requires succeeded cents to cover the paid total", () => {
  assert.equal(isFullRefund(71900, 71900), true);
  assert.equal(isFullRefund(71900, 71899), false);
  assert.equal(isFullRefund(719, 719), true);
  assert.equal(isFullRefund(719, 718.99), false);
  assert.equal(isFullRefund(719, 100), false);
});

test("partial, replayed, and multiple succeeded refunds preserve truthful order state", async () => {
  const repository = new InMemoryRefundRepository();
  const processor = createStripeRefundProcessor(repository);

  assert.deepEqual(await processor.record(refund({ id: "re_partial", amountCents: 20000 })), {
    ok: true,
    status: "succeeded",
    orderRefunded: false,
    persisted: true
  });
  assert.equal(repository.markedRefundedOrderIds.size, 0);

  assert.deepEqual(await processor.record(refund({ id: "re_partial", amountCents: 20000 })), {
    ok: true,
    status: "succeeded",
    orderRefunded: false,
    persisted: false
  });
  assert.equal(repository.refunds.size, 1);

  assert.deepEqual(await processor.record(refund({ id: "re_remaining", amountCents: 51900 })), {
    ok: true,
    status: "succeeded",
    orderRefunded: true,
    persisted: true
  });
  assert.deepEqual(Array.from(repository.markedRefundedOrderIds), ["order-1"]);
});

test("pending, failed, and cancelled refunds never mark a paid order refunded", async () => {
  const repository = new InMemoryRefundRepository();
  const processor = createStripeRefundProcessor(repository);

  for (const [id, status] of [["re_pending", "pending"], ["re_failed", "failed"], ["re_cancelled", "canceled"]] as const) {
    const result = await processor.record(refund({ id, status }));
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.orderRefunded, false);
  }

  assert.equal(repository.markedRefundedOrderIds.size, 0);
});

test("out-of-order stale refund events cannot downgrade a succeeded refund", async () => {
  const repository = new InMemoryRefundRepository();
  const processor = createStripeRefundProcessor(repository);

  await processor.record(refund({ id: "re_out_of_order", status: "succeeded" }));
  const stale = await processor.record(refund({ id: "re_out_of_order", status: "pending" }));

  assert.deepEqual(stale, { ok: true, status: "succeeded", orderRefunded: true, persisted: false });
  assert.equal(repository.refunds.get("re_out_of_order")?.status, "succeeded");
});

test("same-status refund events refresh safe payload fields without changing first success", async () => {
  const repository = new InMemoryRefundRepository();
  const processor = createStripeRefundProcessor(repository);

  await processor.record(refund({ id: "re_refresh", status: "succeeded", rawPayload: { revision: 1 } }));
  const firstSucceededAt = repository.refunds.get("re_refresh")?.succeededAt;
  await processor.record(refund({ id: "re_refresh", status: "succeeded", reason: "requested_by_customer", rawPayload: { revision: 2 } }));

  const stored = repository.refunds.get("re_refresh");
  assert.deepEqual(stored?.rawPayload, { revision: 2 });
  assert.equal(stored?.reason, "requested_by_customer");
  assert.equal(stored?.succeededAt, firstSucceededAt);
  assert.equal(resolveMonotonicRefundStatus("succeeded", "pending"), "succeeded");
  assert.equal(resolveMonotonicRefundStatus("failed", "succeeded"), "failed");
  assert.equal(normalizeStripeRefundStatus("canceled"), "cancelled");
  assert.equal(normalizeStripeRefundStatus("failure"), "failed");
});

test("refund processing rejects non-EUR and missing-payment inputs without exposing provider errors", async () => {
  const repository = new InMemoryRefundRepository();
  const processor = createStripeRefundProcessor(repository);

  assert.deepEqual(await processor.record(refund({ currency: "USD" })), { ok: false, code: "unsupported_currency" });
  assert.deepEqual(await processor.record(refund({ paymentIntentId: null })), { ok: false, code: "missing_payment_intent" });
  assert.deepEqual(await processor.record(refund({ paymentIntentId: "pi_missing" })), { ok: false, code: "payment_not_found" });

  repository.orderTotalCents = null;
  assert.deepEqual(await processor.record(refund({ id: "re_order_missing" })), { ok: false, code: "order_not_found" });
});

test("overview metrics retain a real zero visitor count and no conversion rate", () => {
  assert.deepEqual(
    buildOverviewMetrics({
      orders: [{ id: "order-1", paymentStatus: "paid", totalEur: 719 }],
      refunds: [],
      uniqueVisitors: 0
    }),
    {
      gmvEur: 719,
      netSalesEur: 719,
      paidOrders: 1,
      averageOrderValueEur: 719,
      conversionRate: null
    }
  );
});

test("commerce metrics sum and round in cents instead of floating point", () => {
  assert.deepEqual(
    calculateCommerceMetrics({
      orders: [
        { id: "one", paymentStatus: "paid", totalEur: 0.1 },
        { id: "two", paymentStatus: "paid", totalEur: 0.2 }
      ],
      refunds: [{ orderId: "one", amountEur: 0.1, completed: true }],
      uniqueVisitors: 2
    }),
    {
      gmvEur: 0.3,
      netSalesEur: 0.2,
      paidOrders: 2,
      averageOrderValueEur: 0.15,
      conversionRate: 1
    }
  );
});

test("overview consumes database aggregate cents without row-limit truncation", () => {
  assert.deepEqual(
    buildOverviewMetricsFromAggregate({
      paid_gmv_cents: "100100",
      succeeded_refund_cents: "100",
      paid_order_count: "1001",
      unique_visitor_count: "2002",
      open_after_sales_count: "4"
    }),
    {
      gmvEur: 1001,
      netSalesEur: 1000,
      paidOrders: 1001,
      averageOrderValueEur: 1,
      conversionRate: 0.5
    }
  );
});

test("a failed source becomes an explicit unavailable result instead of zero-filled metrics", () => {
  const failure = getOverviewSourceFailure([
    ["orders", null],
    ["website_analytics", { message: "database password=not-for-clients" }]
  ]);
  assert.equal(failure?.sourceKey, "website_analytics");
  assert.equal(failure?.reason, "query_failed");
  assert.equal(failure?.message, "Data center overview source is unavailable.");
  assert.equal(toPublicOverviewErrorMessage(failure), "Could not load data center overview.");
});

test("owner overview route is strict and does not return internal error details", () => {
  const route = readFileSync(new URL("../../app/api/admin/data-center/overview/route.ts", import.meta.url), "utf8");
  assert.match(route, /access\.role !== "owner"/);
  assert.match(route, /status: 401/);
  assert.match(route, /status: 403/);
  assert.doesNotMatch(route, /detail:\s*error/);
  assert.equal(toPublicOverviewErrorMessage(new Error("postgres://secret")), "Could not load data center overview.");
});

test("webhook route keeps provider verification errors and processing errors redacted", () => {
  const route = readFileSync(new URL("../../app/api/stripe/webhook/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /error instanceof Error \? error\.message/);
  assert.match(route, /Could not process Stripe webhook\./);
  assert.match(route, /"refund\.failed"/);
  assert.doesNotMatch(route, /recordStripeWebhookSuccess/);
});

test("a replayed checkout confirmation cannot overwrite an already refunded order", () => {
  const paymentHandler = readFileSync(new URL("../server/stripe-order-payment.ts", import.meta.url), "utf8");
  assert.match(paymentHandler, /record_stripe_checkout_payment/);
  assert.doesNotMatch(paymentHandler, /\.from\("payments"/);
});

test("financial migration keeps all Stripe business writes in service-only transaction RPCs", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/202607240011_stripe_financial_transactions.sql", import.meta.url),
    "utf8"
  );
  const bootstrap = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");
  const overview = readFileSync(new URL("../server/data-center-overview.ts", import.meta.url), "utf8");

  for (const source of [migration, bootstrap]) {
    assert.match(source, /record_stripe_refund/);
    assert.match(source, /record_stripe_checkout_payment/);
    assert.match(source, /get_data_center_overview/);
    assert.match(source, /succeeded_at timestamptz/);
    assert.match(source, /security definer/);
    assert.match(source, /set search_path = public, pg_temp/);
    assert.match(source, /grant execute on function public\.record_stripe_refund[\s\S]*to service_role/);
  }
  assert.match(migration, /idx_payments_provider_payment_id_unique/);
  assert.match(bootstrap, /payments_provider_payment_id_unique/);
  assert.match(migration, /idx_inventory_payment_confirmed_once/);
  assert.match(migration, /idx_email_notifications_order_event_unique/);
  assert.match(migration, /refund\.failed/);
  assert.match(overview, /\.rpc\("get_data_center_overview"/);
  assert.doesNotMatch(overview, /\.from\("orders"/);
});
