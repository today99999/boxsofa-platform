import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertSafeStripeFinancialIntegrationTarget } from "./stripe-financial-integration-guard.mjs";

const RUN_FLAG = "RUN_SUPABASE_STRIPE_INTEGRATION";
const requiredEnvironment = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

if (process.env[RUN_FLAG] !== "1") {
  throw new Error(`${RUN_FLAG}=1 is required before this live Supabase integration test can run.`);
}

for (const name of requiredEnvironment) {
  if (!process.env[name]?.trim()) {
    throw new Error(`${name} is required for this live Supabase integration test.`);
  }
}

assertSafeStripeFinancialIntegrationTarget(process.env);

const clientA = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const clientB = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const runPrefix = `codex-stripe-test-${randomUUID()}`;
const state = {
  orderIds: [],
  productIds: [],
  styleIds: [],
  eventIds: [],
  analyticsEventPrefix: `${runPrefix}-analytics-`,
  consentIds: []
};

function firstRow(data, message) {
  const row = Array.isArray(data) ? data[0] : null;
  assert.ok(row && typeof row === "object", message);
  return row;
}

async function insertOrderFixture(client, suffix, { stock = 1, reservedStock = 1 } = {}) {
  const styleKey = `${runPrefix}-style-${suffix}`;
  const sku = `${runPrefix}-sku-${suffix}`;
  const slug = `${runPrefix}-slug-${suffix}`;
  const orderNumber = `${runPrefix}-order-${suffix}`;

  const { data: style, error: styleError } = await client
    .from("product_styles")
    .insert({ style_key: styleKey, name_zh: "Codex", name_en: "Codex" })
    .select("id")
    .single();
  assert.equal(styleError, null, "temporary style must insert");
  state.styleIds.push(style.id);

  const { data: product, error: productError } = await client
    .from("products")
    .insert({
      style_id: style.id,
      sku,
      slug,
      name_zh: "Codex",
      name_en: "Codex",
      category: "single",
      seat_type: "single",
      color_zh: "test",
      price_eur: 100,
      stock,
      reserved_stock: reservedStock,
      is_active: false
    })
    .select("id")
    .single();
  assert.equal(productError, null, "temporary product must insert");
  state.productIds.push(product.id);

  const { data: order, error: orderError } = await client
    .from("orders")
    .insert({
      order_number: orderNumber,
      customer_email: `${runPrefix}-${suffix}@invalid.test`,
      customer_name: "Codex Integration",
      customer_phone: "+34000000000",
      status: "pending_confirm",
      payment_status: "pending",
      subtotal_eur: 100,
      discount_eur: 0,
      shipping_eur: 0,
      total_eur: 100,
      recipient: "Codex Integration",
      phone: "+34000000000",
      address_snapshot: { country: "ES", technical: true }
    })
    .select("id, order_number")
    .single();
  assert.equal(orderError, null, "temporary order must insert");
  state.orderIds.push(order.id);

  const { error: itemError } = await client.from("order_items").insert({
    order_id: order.id,
    product_id: product.id,
    style_id: style.id,
    sku,
    slug,
    name_snapshot: "Codex Integration Sofa",
    quantity: 1,
    unit_price_eur: 100,
    line_total_eur: 100
  });
  assert.equal(itemError, null, "temporary order item must insert");
  return { orderId: order.id, orderNumber: order.order_number, productId: product.id };
}

function paymentParams(fixture, eventId, paymentId) {
  return {
    p_event_id: eventId,
    p_event_type: "checkout.session.completed",
    p_order_id: fixture.orderId,
    p_order_number: fixture.orderNumber,
    p_provider_payment_id: paymentId,
    p_session_id: `${paymentId}-session`,
    p_amount_cents: 10_000,
    p_currency: "eur",
    p_raw_payload: { technical: true, paymentId }
  };
}

async function callPayment(client, fixture, eventId, paymentId) {
  state.eventIds.push(eventId);
  const { data, error } = await client.rpc("record_stripe_checkout_payment", paymentParams(fixture, eventId, paymentId));
  return { row: data ? firstRow(data, "payment RPC must return one row") : null, error };
}

async function callRefund(client, eventId, paymentId, refundId, amountCents, status, rawRevision) {
  state.eventIds.push(eventId);
  const { data, error } = await client.rpc("record_stripe_refund", {
    p_event_id: eventId,
    p_event_type: status === "failed" ? "refund.failed" : "refund.updated",
    p_provider_refund_id: refundId,
    p_provider_payment_id: paymentId,
    p_amount_cents: amountCents,
    p_currency: "EUR",
    p_status: status,
    p_reason: status === "failed" ? "fraudulent" : null,
    p_raw_payload: { technical: true, rawRevision }
  });
  return { row: data ? firstRow(data, "refund RPC must return one row") : null, error };
}

async function expectExactCount(table, filters, expected, message) {
  let query = clientA.from(table).select("*", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { count, error } = await query;
  assert.equal(error, null, `${table} count query must succeed`);
  assert.equal(count, expected, message);
}

async function testPaymentTransactionAndReplay() {
  const fixture = await insertOrderFixture(clientA, "paid");
  const paymentId = `${runPrefix}-pi-paid`;
  const firstEvent = `${runPrefix}-evt-payment-a`;
  const secondEvent = `${runPrefix}-evt-payment-b`;
  const [left, right] = await Promise.all([
    callPayment(clientA, fixture, firstEvent, paymentId),
    callPayment(clientB, fixture, secondEvent, paymentId)
  ]);
  assert.equal(left.error, null, "first payment transaction must succeed");
  assert.equal(right.error, null, "concurrent payment replay must succeed");
  assert.equal(left.row.ok, true);
  assert.equal(right.row.ok, true);

  const sameEventReplay = await callPayment(clientA, fixture, firstEvent, paymentId);
  assert.equal(sameEventReplay.error, null, "same Stripe event replay must succeed");
  assert.equal(sameEventReplay.row.payment_confirmed, false, "same event replay must not repeat payment side effects");

  const [{ data: order, error: orderError }, { data: product, error: productError }] = await Promise.all([
    clientA.from("orders").select("payment_status, status").eq("id", fixture.orderId).single(),
    clientA.from("products").select("stock, reserved_stock").eq("id", fixture.productId).single()
  ]);
  assert.equal(orderError, null);
  assert.equal(productError, null);
  assert.equal(order.payment_status, "paid", "payment must commit order state");
  assert.equal(product.stock, 0, "paid order decrements stock once");
  assert.equal(product.reserved_stock, 0, "paid order releases reserved stock once");
  await expectExactCount("payments", { provider: "stripe", provider_payment_id: paymentId }, 1, "payment replay must not duplicate payment");
  await expectExactCount("inventory_movements", { order_id: fixture.orderId, movement_type: "payment_confirmed" }, 1, "payment replay must not double-decrement inventory");
  await expectExactCount("email_notifications", { order_id: fixture.orderId, event: "payment_confirmed" }, 1, "payment email outbox must be idempotent");

  const refundId = `${runPrefix}-re-main`;
  const [succeeded, pending] = await Promise.all([
    callRefund(clientA, `${runPrefix}-evt-refund-succeeded`, paymentId, refundId, 4_000, "succeeded", 1),
    callRefund(clientB, `${runPrefix}-evt-refund-pending`, paymentId, refundId, 4_000, "pending", 1)
  ]);
  assert.equal(succeeded.error, null, "succeeded refund must commit");
  assert.equal(pending.error, null, "out-of-order pending refund must be safe");
  assert.equal(succeeded.row.ok, true);
  assert.equal(pending.row.ok, true);

  const { data: firstRefund, error: firstRefundError } = await clientA
    .from("payment_refunds")
    .select("status, succeeded_at, raw_payload")
    .eq("provider_refund_id", refundId)
    .single();
  assert.equal(firstRefundError, null);
  assert.equal(firstRefund.status, "succeeded", "pending can never downgrade a succeeded refund");
  const firstSucceededAt = firstRefund.succeeded_at;

  const refreshed = await callRefund(clientA, `${runPrefix}-evt-refund-refresh`, paymentId, refundId, 4_000, "succeeded", 2);
  assert.equal(refreshed.error, null);
  assert.equal(refreshed.row.ok, true);
  const { data: refreshedRefund, error: refreshedError } = await clientA
    .from("payment_refunds")
    .select("status, succeeded_at, raw_payload")
    .eq("provider_refund_id", refundId)
    .single();
  assert.equal(refreshedError, null);
  assert.equal(refreshedRefund.status, "succeeded");
  assert.equal(refreshedRefund.succeeded_at, firstSucceededAt, "first succeeded_at must be immutable");
  assert.equal(refreshedRefund.raw_payload.rawRevision, 2, "same-status webhook must refresh safe raw payload");

  const finalRefund = await callRefund(clientA, `${runPrefix}-evt-refund-final`, paymentId, `${runPrefix}-re-final`, 6_000, "succeeded", 1);
  assert.equal(finalRefund.error, null);
  assert.equal(finalRefund.row.ok, true);
  const { data: refundedOrder, error: refundedOrderError } = await clientA
    .from("orders")
    .select("payment_status, status")
    .eq("id", fixture.orderId)
    .single();
  assert.equal(refundedOrderError, null);
  assert.equal(refundedOrder.payment_status, "refunded", "full partial-refund total must mark order refunded");
  assert.equal(refundedOrder.status, "refunded");

  const failedRefund = await callRefund(clientA, `${runPrefix}-evt-refund-failed`, paymentId, `${runPrefix}-re-failed`, 1, "failed", 1);
  assert.equal(failedRefund.error, null, "refund.failed must be handled");
  assert.equal(failedRefund.row.ok, true);
  const { data: failedRow, error: failedRowError } = await clientA
    .from("payment_refunds")
    .select("status")
    .eq("provider_refund_id", `${runPrefix}-re-failed`)
    .single();
  assert.equal(failedRowError, null);
  assert.equal(failedRow.status, "failed");

  const [{ data: stripeHealth, error: stripeHealthError }, { count: paymentCount, error: paymentCountError }, { count: refundCount, error: refundCountError }] = await Promise.all([
    clientA.from("data_source_health").select("state, record_count").eq("source_key", "stripe").single(),
    clientA.from("payments").select("*", { count: "exact", head: true }).eq("provider", "stripe"),
    clientA.from("payment_refunds").select("*", { count: "exact", head: true }).eq("provider", "stripe")
  ]);
  assert.equal(stripeHealthError, null);
  assert.equal(paymentCountError, null);
  assert.equal(refundCountError, null);
  assert.equal(stripeHealth.state, "current", "health becomes current only after the transaction commits");
  assert.equal(stripeHealth.record_count, paymentCount + refundCount, "Stripe record_count must equal actual persisted Stripe payments and refunds");

  const terminalReplay = await callPayment(clientA, fixture, `${runPrefix}-evt-payment-terminal-replay`, paymentId);
  assert.equal(terminalReplay.error, null, "a replay after refund must be accepted idempotently");
  const { data: terminalOrder, error: terminalOrderError } = await clientA
    .from("orders")
    .select("payment_status, status")
    .eq("id", fixture.orderId)
    .single();
  assert.equal(terminalOrderError, null);
  assert.equal(terminalOrder.payment_status, "refunded", "payment replay must never reset a refunded order");
  assert.equal(terminalOrder.status, "refunded");
}

async function testPaymentRollback() {
  const fixture = await insertOrderFixture(clientA, "rollback", { stock: 0, reservedStock: 0 });
  const paymentId = `${runPrefix}-pi-rollback`;
  const result = await callPayment(clientA, fixture, `${runPrefix}-evt-payment-rollback`, paymentId);
  assert.ok(result.error, "inventory failure must abort the payment transaction");
  await expectExactCount("payments", { provider: "stripe", provider_payment_id: paymentId }, 0, "failed transaction must roll back payment insert");
  await expectExactCount("inventory_movements", { order_id: fixture.orderId, movement_type: "payment_confirmed" }, 0, "failed transaction must roll back movement insert");
  const { data: order, error } = await clientA.from("orders").select("payment_status").eq("id", fixture.orderId).single();
  assert.equal(error, null);
  assert.equal(order.payment_status, "pending", "failed transaction must leave the order unpaid");
}

async function testAggregateBeyondPostgrestLimit() {
  const createdAt = "2099-07-24T12:00:00.000Z";
  const visitorId = `${state.analyticsEventPrefix}visitor-consented`;
  const { data: consent, error: consentError } = await clientA
    .from("analytics_consents")
    .insert({ visitor_id: visitorId, consent: "analytics", locale: "en", consent_version: "technical-test" })
    .select("id")
    .single();
  assert.equal(consentError, null, "temporary analytics consent must insert");
  state.consentIds.push(consent.id);
  const batch = Array.from({ length: 1001 }, (_, index) => ({
    event_type: "page_view",
    event_key: `${state.analyticsEventPrefix}${index}`,
    session_id: `${state.analyticsEventPrefix}session-${index}`,
    visitor_id: `${state.analyticsEventPrefix}visitor-${index}`,
    path: "/technical-integration",
    source: "direct",
    created_at: createdAt,
    raw_utm: {},
    consent_id: consent.id
  }));
  for (let offset = 0; offset < batch.length; offset += 250) {
    const { error } = await clientA.from("analytics_events").insert(batch.slice(offset, offset + 250));
    assert.equal(error, null, "temporary analytics batch must insert");
  }

  const { data, error } = await clientB.rpc("get_data_center_overview", {
    p_start_at: "2099-07-24T00:00:00.000Z",
    p_end_at: "2099-07-25T00:00:00.000Z"
  });
  assert.equal(error, null, "aggregate RPC must query beyond the PostgREST row cap");
  const aggregate = firstRow(data, "aggregate RPC must return one row");
  assert.equal(Number(aggregate.unique_visitor_count), 1001, "database aggregate must retain all 1001 visitors");
  assert.equal(Number(aggregate.paid_gmv_cents), 0, "isolated technical range must not fabricate GMV");
}

async function cleanup() {
  const failures = [];
  const run = async (label, operation) => {
    try {
      const { error } = await operation();
      if (error) failures.push(`${label}: ${error.message}`);
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  if (state.eventIds.length) await run("stripe webhook events", () => clientA.from("stripe_webhook_events").delete().in("event_id", state.eventIds));
  if (state.orderIds.length) {
    for (const table of ["email_notifications", "payment_refunds", "payments", "inventory_movements", "order_items"]) {
      await run(table, () => clientA.from(table).delete().in("order_id", state.orderIds));
    }
    await run("orders", () => clientA.from("orders").delete().in("id", state.orderIds));
  }
  if (state.productIds.length) await run("products", () => clientA.from("products").delete().in("id", state.productIds));
  if (state.styleIds.length) await run("product styles", () => clientA.from("product_styles").delete().in("id", state.styleIds));
  await run("analytics events", () => clientA.from("analytics_events").delete().like("event_key", `${state.analyticsEventPrefix}%`));
  if (state.consentIds.length) await run("analytics consents", () => clientA.from("analytics_consents").delete().in("id", state.consentIds));

  for (const [table, column, values] of [
    ["stripe_webhook_events", "event_id", state.eventIds],
    ["orders", "id", state.orderIds],
    ["products", "id", state.productIds],
    ["product_styles", "id", state.styleIds]
  ]) {
    if (!values.length) continue;
    const { count, error } = await clientA.from(table).select("*", { count: "exact", head: true }).in(column, values);
    assert.equal(error, null, `${table} cleanup count must succeed`);
    assert.equal(count, 0, `${table} cleanup must leave zero technical rows`);
  }
  const { count: analyticsCount, error: analyticsCountError } = await clientA
    .from("analytics_events")
    .select("*", { count: "exact", head: true })
    .like("event_key", `${state.analyticsEventPrefix}%`);
  assert.equal(analyticsCountError, null);
  assert.equal(analyticsCount, 0, "analytics cleanup must leave zero technical rows");
  if (state.consentIds.length) {
    const { count, error } = await clientA.from("analytics_consents").select("*", { count: "exact", head: true }).in("id", state.consentIds);
    assert.equal(error, null, "analytics consent cleanup count must succeed");
    assert.equal(count, 0, "analytics cleanup must leave zero technical consents");
  }
  await run("Stripe source health reconciliation", () => clientA.rpc("reconcile_stripe_source_health_count"));
  const [{ data: health, error: healthError }, { count: paymentCount, error: paymentCountError }, { count: refundCount, error: refundCountError }] = await Promise.all([
    clientA.from("data_source_health").select("record_count").eq("source_key", "stripe").single(),
    clientA.from("payments").select("*", { count: "exact", head: true }).eq("provider", "stripe"),
    clientA.from("payment_refunds").select("*", { count: "exact", head: true }).eq("provider", "stripe")
  ]);
  assert.equal(healthError, null, "Stripe health must remain readable after cleanup");
  assert.equal(paymentCountError, null);
  assert.equal(refundCountError, null);
  assert.equal(health.record_count, paymentCount + refundCount, "cleanup must reconcile Stripe health instead of restoring a stale snapshot");
  if (failures.length) throw new AggregateError(failures, "Stripe financial integration cleanup failed");
}

try {
  await testPaymentTransactionAndReplay();
  await testPaymentRollback();
  await testAggregateBeyondPostgrestLimit();
} finally {
  await cleanup();
}

console.log("Supabase Stripe financial integration passed; all temporary rows were cleaned up.");
