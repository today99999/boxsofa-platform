import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertSafeStripeFinancialIntegrationTarget } from "./stripe-financial-integration-guard.mjs";

const RUN_FLAG = "RUN_SUPABASE_AFTER_SALES_INTEGRATION";
const requiredEnvironment = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "AFTER_SALES_INTEGRATION_OWNER_ID"];

if (process.env[RUN_FLAG] !== "1") {
  throw new Error(`${RUN_FLAG}=1 is required before this live Supabase integration test can run.`);
}
for (const name of requiredEnvironment) {
  if (!process.env[name]?.trim()) throw new Error(`${name} is required for this live Supabase integration test.`);
}

assertSafeStripeFinancialIntegrationTarget(process.env);

const ownerId = process.env.AFTER_SALES_INTEGRATION_OWNER_ID;
const clientA = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const clientB = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const prefix = `codex-after-sales-test-${randomUUID()}`;
const state = { styleIds: [], productIds: [], orderIds: [], caseIds: [], eventIds: [], paymentIds: [] };

function firstRow(data, message) {
  const row = Array.isArray(data) ? data[0] : null;
  assert.ok(row && typeof row === "object", message);
  return row;
}

async function ensureOwner() {
  const { data, error } = await clientA.from("profiles").select("role").eq("id", ownerId).maybeSingle();
  assert.equal(error, null, "owner lookup must succeed");
  assert.equal(data?.role, "owner", "AFTER_SALES_INTEGRATION_OWNER_ID must identify an owner profile in the non-production project");
}

async function createFixture() {
  const { data: style, error: styleError } = await clientA
    .from("product_styles")
    .insert({ style_key: `${prefix}-style`, name_zh: "Codex", name_en: "Codex" })
    .select("id")
    .single();
  assert.equal(styleError, null, "temporary style must insert");
  state.styleIds.push(style.id);

  const { data: product, error: productError } = await clientA
    .from("products")
    .insert({
      style_id: style.id,
      sku: `${prefix}-sku`,
      slug: `${prefix}-slug`,
      name_zh: "Codex",
      name_en: "Codex",
      category: "single",
      seat_type: "single",
      color_zh: "test",
      price_eur: 100,
      stock: 2,
      reserved_stock: 2,
      is_active: false
    })
    .select("id, sku, slug")
    .single();
  assert.equal(productError, null, "temporary inactive product must insert");
  state.productIds.push(product.id);

  const { data: order, error: orderError } = await clientA
    .from("orders")
    .insert({
      order_number: `${prefix}-order`,
      customer_email: `${prefix}@invalid.test`,
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

  const { error: itemError } = await clientA.from("order_items").insert({
    order_id: order.id,
    product_id: product.id,
    style_id: style.id,
    sku: product.sku,
    slug: product.slug,
    name_snapshot: "Codex Integration Sofa",
    quantity: 1,
    unit_price_eur: 100,
    line_total_eur: 100
  });
  assert.equal(itemError, null, "temporary order item must insert");
  return { orderId: order.id, orderNumber: order.order_number };
}

async function createPaidRefundableOrder(fixture) {
  const paymentId = `${prefix}-pi`;
  const paymentEventId = `${prefix}-evt-payment`;
  state.paymentIds.push(paymentId);
  state.eventIds.push(paymentEventId);
  const { data: paymentData, error: paymentError } = await clientA.rpc("record_stripe_checkout_payment", {
    p_event_id: paymentEventId,
    p_event_type: "checkout.session.completed",
    p_order_id: fixture.orderId,
    p_order_number: fixture.orderNumber,
    p_provider_payment_id: paymentId,
    p_session_id: `${paymentId}-session`,
    p_amount_cents: 10_000,
    p_currency: "eur",
    p_raw_payload: { technical: true, prefix }
  });
  assert.equal(paymentError, null, "temporary payment RPC must succeed");
  assert.equal(firstRow(paymentData, "payment RPC must return a row").ok, true);

  const refundEventId = `${prefix}-evt-refund`;
  state.eventIds.push(refundEventId);
  const { data: refundData, error: refundError } = await clientA.rpc("record_stripe_refund", {
    p_event_id: refundEventId,
    p_event_type: "refund.updated",
    p_provider_refund_id: `${prefix}-re`,
    p_provider_payment_id: paymentId,
    p_amount_cents: 10_000,
    p_currency: "EUR",
    p_status: "succeeded",
    p_reason: null,
    p_raw_payload: { technical: true, prefix }
  });
  assert.equal(refundError, null, "temporary refund RPC must succeed");
  assert.equal(firstRow(refundData, "refund RPC must return a row").ok, true);
}

async function createCase(client, orderNumber, suffix) {
  const { data, error } = await client.rpc("create_after_sales_case", {
    p_order_number: orderNumber,
    p_case_type: "refund",
    p_reason: `Technical integration case ${suffix}`,
    p_requested_remedy: null,
    p_due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    p_created_by: ownerId
  });
  assert.equal(error, null, "after-sales case create RPC must succeed");
  const row = firstRow(data, "after-sales create RPC must return a row");
  state.caseIds.push(row.id);
  return row;
}

function patchArgs(caseRow, amountCents, expectedVersion = caseRow.version) {
  return {
    p_case_id: caseRow.id,
    p_actor_id: ownerId,
    p_expected_version: expectedVersion,
    p_status: "approved",
    p_responsibility: null,
    p_responsibility_set: false,
    p_refund_amount_cents: amountCents,
    p_refund_amount_set: true,
    p_internal_note: null,
    p_internal_note_set: false,
    p_due_at: null,
    p_due_at_set: false
  };
}

async function runConcurrencyChecks(fixture) {
  const [leftCase, rightCase] = await Promise.all([
    createCase(clientA, fixture.orderNumber, "left"),
    createCase(clientB, fixture.orderNumber, "right")
  ]);
  assert.notEqual(leftCase.case_number, rightCase.case_number, "concurrent creates must allocate distinct case numbers");

  const [leftPatch, rightPatch] = await Promise.all([
    clientA.rpc("update_after_sales_case", patchArgs(leftCase, 6_000)),
    clientB.rpc("update_after_sales_case", patchArgs(rightCase, 6_000))
  ]);
  assert.equal(leftPatch.error, null, "left refund patch RPC must return a structured result");
  assert.equal(rightPatch.error, null, "right refund patch RPC must return a structured result");
  const patchRows = [firstRow(leftPatch.data, "left patch row"), firstRow(rightPatch.data, "right patch row")];
  assert.equal(patchRows.filter((row) => row.ok === true).length, 1, "only one cumulative EUR refund allocation may win");
  assert.equal(patchRows.filter((row) => row.error_code === "refund_not_verified").length, 1, "the competing allocation must be rejected");

  const winningCase = patchRows[0].ok === true ? { ...leftCase, version: patchRows[0].version } : { ...rightCase, version: patchRows[1].version };
  const [firstUpdate, staleUpdate] = await Promise.all([
    clientA.rpc("update_after_sales_case", patchArgs(winningCase, 6_000)),
    clientB.rpc("update_after_sales_case", patchArgs(winningCase, 6_000))
  ]);
  assert.equal(firstUpdate.error, null, "first optimistic update must return a structured result");
  assert.equal(staleUpdate.error, null, "stale optimistic update must return a structured result");
  const optimisticRows = [firstRow(firstUpdate.data, "first optimistic row"), firstRow(staleUpdate.data, "stale optimistic row")];
  assert.equal(optimisticRows.filter((row) => row.ok === true).length, 1, "one same-version patch must win");
  assert.equal(optimisticRows.filter((row) => row.error_code === "conflict").length, 1, "the other same-version patch must conflict");
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

  if (state.caseIds.length) {
    await run("after-sales audits", () => clientA.from("admin_audit_log").delete().in("entity_id", state.caseIds));
    await run("after-sales cases", () => clientA.from("after_sales_cases").delete().in("id", state.caseIds));
  }
  if (state.eventIds.length) await run("Stripe webhook events", () => clientA.from("stripe_webhook_events").delete().in("event_id", state.eventIds));
  if (state.orderIds.length) {
    for (const table of ["email_notifications", "payment_refunds", "payments", "inventory_movements", "order_items"]) {
      await run(table, () => clientA.from(table).delete().in("order_id", state.orderIds));
    }
    await run("orders", () => clientA.from("orders").delete().in("id", state.orderIds));
  }
  if (state.productIds.length) await run("products", () => clientA.from("products").delete().in("id", state.productIds));
  if (state.styleIds.length) await run("product styles", () => clientA.from("product_styles").delete().in("id", state.styleIds));
  await run("Stripe source health reconciliation", () => clientA.rpc("reconcile_stripe_source_health_count"));

  for (const [table, column, ids] of [
    ["after_sales_cases", "id", state.caseIds],
    ["orders", "id", state.orderIds],
    ["products", "id", state.productIds],
    ["product_styles", "id", state.styleIds]
  ]) {
    if (!ids.length) continue;
    const { count, error } = await clientA.from(table).select("*", { count: "exact", head: true }).in(column, ids);
    assert.equal(error, null, `${table} cleanup count must succeed`);
    assert.equal(count, 0, `${table} cleanup must leave zero temporary rows`);
  }
  if (failures.length) throw new AggregateError(failures, "After-sales integration cleanup failed");
}

try {
  await ensureOwner();
  const fixture = await createFixture();
  await createPaidRefundableOrder(fixture);
  await runConcurrencyChecks(fixture);
} finally {
  await cleanup();
}

console.log("Supabase after-sales integration passed; all temporary rows were cleaned up.");
