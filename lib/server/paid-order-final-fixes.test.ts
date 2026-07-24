import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const bootstrapSchema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../../supabase/migrations/202607240026_localized_paid_order_email.sql", import.meta.url),
  "utf8"
);
const alternateOrderRoute = readFileSync(
  new URL("../../app/api/orders/[orderNumber]/route.ts", import.meta.url),
  "utf8"
);
const runtimeEmailCopy = readFileSync(new URL("../email-notifications.ts", import.meta.url), "utf8");

const ADMIN_ID = "10000000-0000-4000-8000-000000000001";
const SUPABASE_STUBS = `
  create schema auth;
  create schema supabase_migrations;
  create table auth.users (id uuid primary key);
  create table supabase_migrations.schema_migrations (
    version text primary key,
    name text not null,
    statements text[] not null
  );
  create function auth.uid()
  returns uuid
  language sql
  stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role()
  returns text
  language sql
  stable
  as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  create role anon;
  create role authenticated;
  create role service_role;
  create publication supabase_realtime;
`;
let database: PGlite;

async function createUserProfile(
  id: string,
  email: string,
  role: "customer" | "service" | "owner" = "customer",
  locale = "en"
) {
  await database.query("insert into auth.users (id) values ($1)", [id]);
  await database.query(
    `insert into public.profiles (id, email, role, preferred_locale)
     values ($1, $2, $3, $4)`,
    [id, email, role, locale]
  );
}

async function createOrder(input: {
  id: string;
  orderNumber: string;
  total: number;
  locale?: string;
  customerId?: string | null;
  customerName?: string;
  customerEmail?: string;
}) {
  await database.query(
    `insert into public.orders (
       id, order_number, customer_id, customer_email, customer_name, customer_phone,
       locale, subtotal_eur, total_eur, recipient, phone, address_snapshot
     ) values ($1, $2, $3, $4, $5, '+34 600 000 000', $6, $7, $7, $5, '+34 600 000 000', '{}'::jsonb)`,
    [
      input.id,
      input.orderNumber,
      input.customerId ?? null,
      input.customerEmail ?? `${input.orderNumber.toLowerCase()}@example.test`,
      input.customerName ?? "Ada",
      input.locale ?? "en",
      input.total
    ]
  );
}

async function confirmOffline(orderId: string, orderNumber: string, targetStatus = "paid_confirmed") {
  const shipped = targetStatus === "shipped";
  return database.query<{
    ok: boolean;
    error_code: string | null;
    payment_confirmed: boolean;
    email_queued: boolean;
    member_welcome: boolean;
  }>(
    `select * from public.record_offline_order_payment(
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
     )`,
    [
      orderId,
      orderNumber,
      ADMIN_ID,
      "Bank transfer",
      targetStatus,
      shipped ? "DHL" : null,
      shipped ? "TRACK-001" : null,
      shipped ? `BoxSofa order shipped: ${orderNumber}` : null,
      shipped ? "Your sofa has shipped. Tracking details are included when available." : null,
      shipped
        ? `Your BoxSofa order ${orderNumber} has shipped.\nCarrier: DHL\nTracking number: TRACK-001`
        : null
    ]
  );
}

test.before(async () => {
  database = await PGlite.create({ extensions: { pgcrypto } });
  await database.exec(SUPABASE_STUBS);
  await database.exec(bootstrapSchema);
  await createUserProfile(ADMIN_ID, "owner@example.test", "owner");
});

test.after(async () => {
  await database.close();
});

test("migration and bootstrap expose one transactional offline paid-confirmation RPC", () => {
  for (const sql of [migration, bootstrapSchema]) {
    assert.match(sql, /create or replace function public\.record_offline_order_payment\(/i);
    assert.match(sql, /from public\.build_payment_confirmed_email\(/i);
    assert.match(sql, /grant execute on function public\.record_offline_order_payment\([^;]+to service_role;/is);
    assert.match(sql, /revoke all on function public\.enforce_order_communication_snapshot\(\) from public, anon, authenticated;/i);
    assert.match(sql, /revoke all on function public\.enforce_membership_welcome_marker\(\) from public, anon, authenticated;/i);
  }
  assert.match(alternateOrderRoute, /\.rpc\(\s*["']record_offline_order_payment["']/);
  assert.match(alternateOrderRoute, /p_shipped_subject:\s*shippedEmailPreview\?\.subject/);
  assert.match(alternateOrderRoute, /p_shipped_body_text:\s*shippedEmailPreview\?\.bodyText/);
  assert.doesNotMatch(alternateOrderRoute, /\.from\(["']payments["']\)\.insert/);
  assert.doesNotMatch(runtimeEmailCopy, /payment_confirmed/);

  const guardedIntegration = readFileSync(
    new URL("../../scripts/stripe-financial-integration.mjs", import.meta.url),
    "utf8"
  );
  assert.match(guardedIntegration, /record_offline_order_payment/);
  assert.match(
    guardedIntegration,
    /Promise\.all\(\[[\s\S]*callPayment\([\s\S]*callOfflinePayment\([\s\S]*\]\)/i
  );
});

test("migration 026 upgrades an existing outbox so expired quarantined leases remain owner-recoverable", async () => {
  const upgradedDatabase = await PGlite.create({ extensions: { pgcrypto } });
  try {
    await upgradedDatabase.exec(SUPABASE_STUBS);
    await upgradedDatabase.exec(bootstrapSchema);
    await upgradedDatabase.exec(`
      drop function public.claim_email_notification_delivery(uuid, integer, boolean);

      create or replace function public.enforce_email_notification_state_machine()
      returns trigger
      language plpgsql
      set search_path = public, pg_temp
      as $$
      begin
        if old.status in ('sent', 'skipped') then
          raise exception 'Email notification terminal state cannot change' using errcode = 'P0001';
        end if;
        if old.status = 'sending' and new.status not in ('sending', 'sent', 'failed') then
          raise exception 'An email delivery lease must be finalized or recovered' using errcode = 'P0001';
        end if;
        if old.status in ('queued', 'failed') and new.status = 'sent' then
          raise exception 'An email notification must be claimed before it can be sent' using errcode = 'P0001';
        end if;
        return new;
      end;
      $$;

      insert into public.email_notifications (
        id, order_number, customer_email, event, subject, preview_text, body_text,
        status, attempts, last_error
      ) values (
        '15000000-0000-4000-8000-000000000002',
        'UPGRADE-ERROR-001',
        'buyer@example.test',
        'payment_confirmed',
        'Subject',
        'Preview',
        'Body',
        'failed',
        1,
        'buyer@example.test BODY: private provider response'
      );

      insert into public.admin_audit_log (
        action, entity_type, entity_id, before_data, after_data
      ) values (
        'email_notification_send_failed',
        'email_notification',
        '15000000-0000-4000-8000-000000000002',
        jsonb_build_object(
          'id', '15000000-0000-4000-8000-000000000002',
          'order_number', 'UPGRADE-ERROR-001',
          'customer_email', 'buyer@example.test',
          'event', 'payment_confirmed',
          'subject', 'Secret subject',
          'preview_text', 'Secret preview',
          'body_text', 'Secret body',
          'status', 'failed',
          'attempts', 1,
          'provider', 'resend',
          'last_error', 'buyer@example.test BODY: private provider response'
        ),
        jsonb_build_object(
          'id', '15000000-0000-4000-8000-000000000002',
          'status', 'failed',
          'provider', 'resend',
          'last_error', 'buyer@example.test BODY: private provider response'
        )
      );

      insert into public.admin_audit_log (
        action, entity_type, before_data, after_data
      ) values (
        'email_test_failed',
        'email_provider',
        null,
        jsonb_build_object(
          'to', 'owner@example.test',
          'provider', 'resend',
          'providerMessageId', 'provider-secret-id',
          'error', 'owner@example.test private provider response'
        )
      );
    `);

    await upgradedDatabase.exec(migration);
    const scrubbedError = await upgradedDatabase.query<{ last_error: string }>(
      `select last_error from public.email_notifications
       where id = '15000000-0000-4000-8000-000000000002'`
    );
    assert.equal(scrubbedError.rows[0].last_error, "email_provider_failed");
    const scrubbedAudit = await upgradedDatabase.query<{
      before_data: Record<string, unknown>;
      after_data: Record<string, unknown>;
    }>(
      `select before_data, after_data
       from public.admin_audit_log
       where entity_id = '15000000-0000-4000-8000-000000000002'`
    );
    assert.deepEqual(scrubbedAudit.rows[0].before_data, {
      attempts: 1,
      event: "payment_confirmed",
      lastError: "email_provider_failed",
      notificationId: "15000000-0000-4000-8000-000000000002",
      orderNumber: "UPGRADE-ERROR-001",
      provider: "resend",
      status: "failed"
    });
    assert.deepEqual(scrubbedAudit.rows[0].after_data, {
      lastError: "email_provider_failed",
      notificationId: "15000000-0000-4000-8000-000000000002",
      provider: "resend",
      status: "failed"
    });
    const scrubbedProviderAudit = await upgradedDatabase.query<{
      after_data: Record<string, unknown>;
    }>(
      `select after_data from public.admin_audit_log
       where entity_type = 'email_provider' and action = 'email_test_failed'`
    );
    assert.deepEqual(scrubbedProviderAudit.rows[0].after_data, {
      lastError: "email_provider_failed",
      provider: "resend",
      status: "failed"
    });
    const migrationHelper = await upgradedDatabase.query<{ count: string }>(
      `select count(*)::text as count
       from pg_proc
       where pronamespace = 'public'::regnamespace
         and proname = 'sanitize_email_notification_audit_payload'`
    );
    assert.equal(migrationHelper.rows[0].count, "0");
    const notificationId = "15000000-0000-4000-8000-000000000001";
    await upgradedDatabase.query(
      `insert into public.email_notifications (
         id, order_number, customer_email, event, subject, preview_text, body_text,
         automatic_delivery_eligible, attempts
       ) values ($1, 'UPGRADE-001', 'buyer@example.test', 'payment_confirmed',
         'Subject', 'Preview', 'Body', true, 4)`,
      [notificationId]
    );
    const claim = await upgradedDatabase.query<{ claimed: boolean }>(
      "select claimed from public.claim_email_notification_delivery($1, 30, true)",
      [notificationId]
    );
    assert.equal(claim.rows[0].claimed, true);
    await upgradedDatabase.query(
      "update public.email_notifications set delivery_lease_expires_at = now() - interval '1 second' where id = $1",
      [notificationId]
    );
    const recovery = await upgradedDatabase.query<{ transitioned: boolean }>(
      "select transitioned from public.transition_email_notification($1, 'requeue')",
      [notificationId]
    );
    assert.equal(recovery.rows[0].transitioned, true);
  } finally {
    await upgradedDatabase.close();
  }
});

test("order communication snapshot rejects each field mutation while allowing status updates", async () => {
  const orderId = "20000000-0000-4000-8000-000000000001";
  await createOrder({ id: orderId, orderNumber: "IMM-001", total: 50, locale: "es" });

  for (const [column, value] of [
    ["customer_name", "Changed Name"],
    ["customer_email", "changed@example.test"],
    ["locale", "fr"]
  ]) {
    await assert.rejects(
      database.query(`update public.orders set ${column} = $1 where id = $2`, [value, orderId]),
      /communication snapshot is immutable/i
    );
  }

  await database.query("update public.orders set status = 'paid_confirmed' where id = $1", [orderId]);
  const status = await database.query<{ status: string }>("select status from public.orders where id = $1", [orderId]);
  assert.equal(status.rows[0].status, "paid_confirmed");
});

test("rolling migration fails closed when an old app inserts an order without locale", async () => {
  await assert.rejects(
    database.query(
      `insert into public.orders (
         id, order_number, customer_email, customer_name, customer_phone,
         subtotal_eur, total_eur, recipient, phone, address_snapshot
       ) values (
         '20000000-0000-4000-8000-000000000010',
         'OLD-APP-NO-LOCALE',
         'old-app@example.test',
         'Old App',
         '+34 600 000 000',
         50,
         50,
         'Old App',
         '+34 600 000 000',
         '{}'::jsonb
       )`
    ),
    /null value in column "locale"|not-null constraint/i
  );
});

test("localized offline payment is atomic and idempotent", async () => {
  const orderId = "20000000-0000-4000-8000-000000000002";
  await createOrder({
    id: orderId,
    orderNumber: "OFF-ES-001",
    total: 125,
    locale: "es",
    customerName: "Lucía",
    customerEmail: "lucia@example.test"
  });

  const first = await confirmOffline(orderId, "OFF-ES-001");
  assert.deepEqual(first.rows[0], {
    ok: true,
    error_code: null,
    payment_confirmed: true,
    email_queued: true,
    member_welcome: false
  });

  const notification = await database.query<{
    subject: string;
    body_text: string;
    member_welcome: boolean;
    automatic_delivery_eligible: boolean;
  }>(
    `select subject, body_text, member_welcome, automatic_delivery_eligible
     from public.email_notifications where order_id = $1 and event = 'payment_confirmed'`,
    [orderId]
  );
  assert.equal(notification.rows[0].subject, "Gracias por tu compra | Pedido BoxSofa OFF-ES-001");
  assert.match(notification.rows[0].body_text, /Hola, Lucía:/);
  assert.equal(notification.rows[0].member_welcome, false);
  assert.equal(notification.rows[0].automatic_delivery_eligible, true);

  const replay = await confirmOffline(orderId, "OFF-ES-001");
  assert.equal(replay.rows[0].ok, true);
  assert.equal(replay.rows[0].payment_confirmed, false);
  const counts = await database.query<{ payments: number; notifications: number }>(
    `select
       (select count(*)::integer from public.payments where order_id = $1) as payments,
       (select count(*)::integer from public.email_notifications where order_id = $1 and event = 'payment_confirmed') as notifications`,
    [orderId]
  );
  assert.deepEqual(counts.rows[0], { payments: 1, notifications: 1 });
});

test("mixed paid and shipped offline confirmations converge on one shipped transaction result", async () => {
  const orderId = "20000000-0000-4000-8000-000000000003";
  await createOrder({ id: orderId, orderNumber: "OFF-MIXED-001", total: 125, locale: "de" });

  const [paidResult, shippedResult] = await Promise.all([
    confirmOffline(orderId, "OFF-MIXED-001"),
    confirmOffline(orderId, "OFF-MIXED-001", "shipped")
  ]);
  assert.equal(paidResult.rows[0].ok, true);
  assert.equal(shippedResult.rows[0].ok, true);

  const state = await database.query<{
    status: string;
    payments: number;
    events: string[];
    shipments: number;
    carrier: string;
    tracking_number: string;
    shipped_subject: string;
    shipped_body: string;
    shipped_automatic: boolean;
  }>(
    `select
       order_row.status,
       (select count(*)::integer from public.payments where order_id = order_row.id) as payments,
       (select array_agg(event order by event) from public.email_notifications where order_id = order_row.id) as events,
       (select count(*)::integer from public.shipments where order_id = order_row.id) as shipments,
       (select carrier from public.shipments where order_id = order_row.id limit 1) as carrier,
       (select tracking_number from public.shipments where order_id = order_row.id limit 1) as tracking_number,
       (select subject from public.email_notifications
         where order_id = order_row.id and event = 'order_shipped') as shipped_subject,
       (select body_text from public.email_notifications
         where order_id = order_row.id and event = 'order_shipped') as shipped_body,
       (select automatic_delivery_eligible from public.email_notifications
         where order_id = order_row.id and event = 'order_shipped') as shipped_automatic
     from public.orders order_row
     where order_row.id = $1`,
    [orderId]
  );
  assert.deepEqual(state.rows[0], {
    status: "shipped",
    payments: 1,
    events: ["order_shipped", "payment_confirmed"],
    shipments: 1,
    carrier: "DHL",
    tracking_number: "TRACK-001",
    shipped_subject: "BoxSofa order shipped: OFF-MIXED-001",
    shipped_body: "Your BoxSofa order OFF-MIXED-001 has shipped.\nCarrier: DHL\nTracking number: TRACK-001",
    shipped_automatic: false
  });
});

test("offline payment rolls back order, payment, inventory, membership, and outbox together", async () => {
  const styleId = "30000000-0000-4000-8000-000000000001";
  const productId = "30000000-0000-4000-8000-000000000002";
  const orderId = "30000000-0000-4000-8000-000000000003";
  await database.query(
    `insert into public.product_styles (id, style_key, name_zh, name_en)
     values ($1, 'rollback-style', '测试', 'Rollback style')`,
    [styleId]
  );
  await database.query(
    `insert into public.products (
       id, style_id, sku, slug, name_zh, name_en, category, seat_type, color_zh,
       price_eur, stock, reserved_stock
     ) values ($1, $2, 'ROLLBACK-SKU', 'rollback-product', '测试', 'Rollback product',
       'single', 'single', '灰色', 100, 1, 1)`,
    [productId, styleId]
  );
  await createOrder({ id: orderId, orderNumber: "OFF-ROLLBACK", total: 200 });
  await database.query(
    `insert into public.order_items (
       order_id, product_id, style_id, sku, name_snapshot, quantity, unit_price_eur, line_total_eur
     ) values ($1, $2, $3, 'ROLLBACK-SKU', 'Rollback product', 2, 100, 200)`,
    [orderId, productId, styleId]
  );

  await assert.rejects(
    confirmOffline(orderId, "OFF-ROLLBACK"),
    /offline payment inventory is unavailable/i
  );

  const state = await database.query<{
    status: string;
    payment_status: string;
    stock: number;
    reserved_stock: number;
    payments: number;
    movements: number;
    notifications: number;
  }>(
    `select
       order_row.status,
       order_row.payment_status,
       product_row.stock,
       product_row.reserved_stock,
       (select count(*)::integer from public.payments where order_id = order_row.id) as payments,
       (select count(*)::integer from public.inventory_movements where order_id = order_row.id) as movements,
       (select count(*)::integer from public.email_notifications where order_id = order_row.id) as notifications
     from public.orders order_row
     cross join public.products product_row
     where order_row.id = $1 and product_row.id = $2`,
    [orderId, productId]
  );
  assert.deepEqual(state.rows[0], {
    status: "pending_confirm",
    payment_status: "not_started",
    stock: 1,
    reserved_stock: 1,
    payments: 0,
    movements: 0,
    notifications: 0
  });
});

test("membership welcome is lifetime-only across refund demotion and requalification", async () => {
  const customerId = "40000000-0000-4000-8000-000000000001";
  await createUserProfile(customerId, "member@example.test");
  const orders = [
    ["40000000-0000-4000-8000-000000000002", "LIFE-200", 200],
    ["40000000-0000-4000-8000-000000000003", "LIFE-150-A", 150],
    ["40000000-0000-4000-8000-000000000004", "LIFE-150-B", 150]
  ] as const;
  for (const [id, orderNumber, total] of orders) {
    await createOrder({ id, orderNumber, total, customerId });
  }

  assert.equal((await confirmOffline(orders[0][0], orders[0][1])).rows[0].member_welcome, false);
  assert.equal((await confirmOffline(orders[1][0], orders[1][1])).rows[0].member_welcome, true);
  const firstMembership = await database.query<{ membership_welcomed_at: string; is_member: boolean }>(
    "select membership_welcomed_at::text, is_member from public.profiles where id = $1",
    [customerId]
  );
  assert.equal(firstMembership.rows[0].is_member, true);
  assert.ok(firstMembership.rows[0].membership_welcomed_at);

  await database.query(
    "update public.orders set status = 'refunded', payment_status = 'refunded' where id = $1",
    [orders[1][0]]
  );
  const demoted = await database.query<{ membership_welcomed_at: string; is_member: boolean }>(
    "select membership_welcomed_at::text, is_member from public.profiles where id = $1",
    [customerId]
  );
  assert.equal(demoted.rows[0].is_member, false);
  assert.equal(demoted.rows[0].membership_welcomed_at, firstMembership.rows[0].membership_welcomed_at);

  assert.equal((await confirmOffline(orders[2][0], orders[2][1])).rows[0].member_welcome, false);
  const welcomeCount = await database.query<{ count: number }>(
    `select count(*)::integer as count
     from public.email_notifications notification_row
     join public.orders order_row on order_row.id = notification_row.order_id
     where order_row.customer_id = $1 and notification_row.member_welcome`,
    [customerId]
  );
  assert.equal(welcomeCount.rows[0].count, 1);
});

test("automatic retries back off, quarantine at the bound, sanitize errors, and remain manually recoverable", async () => {
  const notificationId = "50000000-0000-4000-8000-000000000001";
  await database.query(
    `insert into public.email_notifications (
       id, order_number, customer_email, event, subject, preview_text, body_text,
       automatic_delivery_eligible
     ) values ($1, 'RETRY-001', 'buyer@example.test', 'payment_confirmed',
       'Subject', 'Preview', 'Body', true)`,
    [notificationId]
  );

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const claim = await database.query<{ claimed: boolean; lease_token: string | null }>(
      "select claimed, lease_token::text from public.claim_email_notification_delivery($1, 300, true)",
      [notificationId]
    );
    assert.equal(claim.rows[0].claimed, true);
    assert.ok(claim.rows[0].lease_token);

    await database.query(
      "select * from public.finalize_email_notification_delivery($1, $2, false, 'resend', null, $3)",
      [
        notificationId,
        claim.rows[0].lease_token,
        attempt === 1
          ? "buyer@example.test BODY: private provider response"
          : "email_provider_http_error:503"
      ]
    );
    const state = await database.query<{
      attempts: number;
      last_error: string;
      next_attempt_at: string | null;
      automatic_quarantined_at: string | null;
    }>(
      `select attempts, last_error, next_attempt_at::text, automatic_quarantined_at::text
       from public.email_notifications where id = $1`,
      [notificationId]
    );
    assert.doesNotMatch(state.rows[0].last_error, /buyer@example\.test|private provider response/i);
    if (attempt < 5) {
      assert.ok(state.rows[0].next_attempt_at);
      assert.equal(state.rows[0].automatic_quarantined_at, null);
      await database.query(
        "update public.email_notifications set next_attempt_at = now() - interval '1 second' where id = $1",
        [notificationId]
      );
    } else {
      assert.equal(state.rows[0].next_attempt_at, null);
      assert.ok(state.rows[0].automatic_quarantined_at);
    }
  }

  const exhaustedClaim = await database.query<{ claimed: boolean }>(
    "select claimed from public.claim_email_notification_delivery($1, 300, true)",
    [notificationId]
  );
  assert.equal(exhaustedClaim.rows[0].claimed, false);

  const manualRequeue = await database.query<{ transitioned: boolean }>(
    "select transitioned from public.transition_email_notification($1, 'requeue')",
    [notificationId]
  );
  assert.equal(manualRequeue.rows[0].transitioned, true);
  const recovered = await database.query<{
    status: string;
    attempts: number;
    automatic_quarantined_at: string | null;
  }>(
    "select status, attempts, automatic_quarantined_at::text from public.email_notifications where id = $1",
    [notificationId]
  );
  assert.deepEqual(recovered.rows[0], {
    status: "queued",
    attempts: 0,
    automatic_quarantined_at: null
  });

  await database.query(
    "update public.email_notifications set attempts = 4 where id = $1",
    [notificationId]
  );
  const ambiguousClaim = await database.query<{ claimed: boolean }>(
    "select claimed from public.claim_email_notification_delivery($1, 30, true)",
    [notificationId]
  );
  assert.equal(ambiguousClaim.rows[0].claimed, true);
  await database.query(
    "update public.email_notifications set delivery_lease_expires_at = now() - interval '1 second' where id = $1",
    [notificationId]
  );
  const ambiguousManualRecovery = await database.query<{ transitioned: boolean }>(
    "select transitioned from public.transition_email_notification($1, 'requeue')",
    [notificationId]
  );
  assert.equal(ambiguousManualRecovery.rows[0].transitioned, true);
});

test("automatic ambiguity retries keep one timestamp before 24h and quarantine at the provider window", async () => {
  const retryId = "50000000-0000-4000-8000-000000000010";
  await database.query(
    `insert into public.email_notifications (
       id, order_number, customer_email, event, subject, preview_text, body_text,
       automatic_delivery_eligible
     ) values (
       $1, 'AMBIGUOUS-RETRY', 'buyer@example.test', 'payment_confirmed',
       'Subject', 'Preview', 'Body', true
     )`,
    [retryId]
  );

  const firstClaim = await database.query<{
    claimed: boolean;
    first_provider_attempt_at: string | null;
  }>(
    `select claimed,
       (notification->>'first_provider_attempt_at')::text as first_provider_attempt_at
     from public.claim_email_notification_delivery($1, 30, true)`,
    [retryId]
  );
  assert.equal(firstClaim.rows[0].claimed, true);
  assert.ok(firstClaim.rows[0].first_provider_attempt_at);
  await database.query(
    `update public.email_notifications
     set delivery_lease_expires_at = now() - interval '1 second'
     where id = $1`,
    [retryId]
  );
  const beforeWindowClaim = await database.query<{
    claimed: boolean;
    first_provider_attempt_at: string | null;
  }>(
    `select claimed,
       (notification->>'first_provider_attempt_at')::text as first_provider_attempt_at
     from public.claim_email_notification_delivery($1, 30, true)`,
    [retryId]
  );
  assert.equal(beforeWindowClaim.rows[0].claimed, true);
  assert.equal(
    beforeWindowClaim.rows[0].first_provider_attempt_at,
    firstClaim.rows[0].first_provider_attempt_at
  );

  const expiredId = "50000000-0000-4000-8000-000000000011";
  await database.query(
    `insert into public.email_notifications (
       id, order_number, customer_email, event, subject, preview_text, body_text,
       automatic_delivery_eligible, status, attempts, delivery_lease_token,
       delivery_lease_expires_at, first_provider_attempt_at
     ) values (
       $1, 'AMBIGUOUS-EXPIRED', 'buyer@example.test', 'payment_confirmed',
       'Subject', 'Preview', 'Body', true, 'sending', 1, gen_random_uuid(),
       now() - interval '1 second', now() - interval '24 hours'
     )`,
    [expiredId]
  );
  const expiredClaim = await database.query<{ claimed: boolean }>(
    "select claimed from public.claim_email_notification_delivery($1, 30, true)",
    [expiredId]
  );
  assert.equal(expiredClaim.rows[0].claimed, false);
  const expiredState = await database.query<{
    status: string;
    automatic_quarantined_at: string | null;
    delivery_lease_token: string | null;
  }>(
    `select status, automatic_quarantined_at::text, delivery_lease_token::text
     from public.email_notifications where id = $1`,
    [expiredId]
  );
  assert.equal(expiredState.rows[0].status, "failed");
  assert.ok(expiredState.rows[0].automatic_quarantined_at);
  assert.equal(expiredState.rows[0].delivery_lease_token, null);
});

test("concurrent Stripe and offline confirmation serialize membership refresh and produce one welcome", async () => {
  const customerId = "60000000-0000-4000-8000-000000000001";
  const offlineOrderId = "60000000-0000-4000-8000-000000000002";
  const stripeOrderId = "60000000-0000-4000-8000-000000000003";
  await createUserProfile(customerId, "concurrent@example.test");
  await createOrder({
    id: offlineOrderId,
    orderNumber: "CONCURRENT-OFFLINE",
    total: 200,
    customerId
  });
  await createOrder({
    id: stripeOrderId,
    orderNumber: "CONCURRENT-STRIPE",
    total: 150,
    customerId
  });

  await Promise.all([
    confirmOffline(offlineOrderId, "CONCURRENT-OFFLINE"),
    database.query(
      `select * from public.record_stripe_checkout_payment(
         $1, 'checkout.session.completed', $2, $3, $4, $5, 15000, 'EUR', '{}'::jsonb
       )`,
      [
        "evt-concurrent-payment",
        stripeOrderId,
        "CONCURRENT-STRIPE",
        "pi-concurrent-payment",
        "cs-concurrent-payment"
      ]
    )
  ]);

  const membership = await database.query<{
    total_paid_eur: string;
    is_member: boolean;
    membership_welcomed_at: string | null;
    welcome_count: number;
  }>(
    `select
       profile_row.total_paid_eur::text,
       profile_row.is_member,
       profile_row.membership_welcomed_at::text,
       (
         select count(*)::integer
         from public.email_notifications notification_row
         join public.orders order_row on order_row.id = notification_row.order_id
         where order_row.customer_id = profile_row.id and notification_row.member_welcome
       ) as welcome_count
     from public.profiles profile_row where profile_row.id = $1`,
    [customerId]
  );
  assert.deepEqual(membership.rows[0], {
    total_paid_eur: "350.00",
    is_member: true,
    membership_welcomed_at: membership.rows[0].membership_welcomed_at,
    welcome_count: 1
  });
  assert.ok(membership.rows[0].membership_welcomed_at);
});
