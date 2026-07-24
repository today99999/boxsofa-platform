import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationPath = new URL("../../supabase/migrations/202607240026_localized_paid_order_email.sql", import.meta.url);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";
const orderRoute = readFileSync(new URL("../../app/api/orders/route.ts", import.meta.url), "utf8");
const cartClient = readFileSync(new URL("../../components/CartClient.tsx", import.meta.url), "utf8");
const bootstrapSchema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

function effectivePaymentRpc(sql: string) {
  const marker = "create or replace function public.record_stripe_checkout_payment(";
  const start = sql.toLowerCase().lastIndexOf(marker);
  assert.notEqual(start, -1, "effective payment RPC must exist");
  const end = sql.indexOf("\n$$;", start);
  assert.notEqual(end, -1, "effective payment RPC must have a complete body");
  return sql.slice(start, end + 4);
}

function paymentEmailHelperSql(sql: string) {
  const start = sql.indexOf("create or replace function public.build_payment_confirmed_email(");
  assert.notEqual(start, -1, "payment email helper must exist");
  const end = sql.indexOf("create or replace function public.sanitize_email_delivery_error", start);
  assert.notEqual(end, -1, "payment email helper boundary must exist");
  return sql.slice(start, end);
}

test("orders persist an immutable supported checkout locale", () => {
  assert.match(migration, /add column if not exists locale text/i);
  assert.match(migration, /preferred_locale/i);
  assert.match(
    migration,
    /case when profiles\.preferred_locale in \('zh', 'en', 'es', 'fr', 'de'\) then profiles\.preferred_locale else 'en' end/i
  );
  assert.match(migration, /alter column locale drop default/i);
  assert.doesNotMatch(migration, /alter column locale set default 'en'/i);
  assert.match(migration, /check \(locale in \('zh', 'en', 'es', 'fr', 'de'\)\)/i);
  assert.match(orderRoute, /locale: z\.enum\(\["zh", "en", "es", "fr", "de"\]\)/);
  assert.match(orderRoute, /locale: order\.locale/);
});

test("checkout sends its current website language and bootstrap schema preserves the locale contract", () => {
  assert.match(cartClient, /const \{ language, t \} = useTranslation\(\)/);
  assert.match(cartClient, /locale: language/);
  assert.match(bootstrapSchema, /locale text not null check \(locale in \('zh', 'en', 'es', 'fr', 'de'\)\)/i);
  assert.doesNotMatch(
    bootstrapSchema,
    /create table if not exists public\.orders\s*\([^;]*locale text not null default 'en'/i
  );
});

test("payment-confirmed email helper owns the five approved templates", () => {
  assert.match(
    migration,
    /create or replace function public\.build_payment_confirmed_email\(\s*p_locale text,\s*p_customer_name text,\s*p_order_number text,\s*p_member_welcome boolean\s*\)\s*returns table\(\s*subject text,\s*preview_text text,\s*body_text text\s*\)/is
  );
  assert.match(bootstrapSchema, /create or replace function public\.build_payment_confirmed_email\(/i);

  for (const copy of [
    "感谢您的购买｜BoxSofa 订单",
    "Thank you for your purchase | BoxSofa order",
    "Gracias por tu compra | Pedido BoxSofa",
    "Merci pour votre achat | Commande BoxSofa",
    "Vielen Dank für Ihren Einkauf | BoxSofa-Bestellung",
    "感谢您在 boxsofa.eu 购买我们的产品。您的订单",
    "Thank you for purchasing from boxsofa.eu. Payment for your order",
    "Gracias por comprar en boxsofa.eu. Hemos confirmado el pago de tu pedido",
    "Merci pour votre achat sur boxsofa.eu. Le paiement de votre commande",
    "vielen Dank für Ihren Einkauf bei boxsofa.eu. Die Zahlung für Ihre Bestellung",
    "感谢您成为 BoxSofa 会员！您今后符合条件的订单可享受 10% 会员折扣。",
    "We would also like to thank you for becoming a BoxSofa member! You can now receive a 10% member discount on eligible future orders.",
    "¡También queremos darte las gracias por hacerte miembro de BoxSofa! A partir de ahora podrás disfrutar de un 10 % de descuento para miembros en futuros pedidos que cumplan las condiciones.",
    "Nous vous remercions également d’être devenu membre de BoxSofa ! Vous pouvez désormais bénéficier d’une remise membre de 10 % sur vos prochaines commandes éligibles.",
    "Außerdem bedanken wir uns herzlich dafür, dass Sie BoxSofa-Mitglied geworden sind! Bei zukünftigen berechtigten Bestellungen erhalten Sie nun 10 % Mitgliederrabatt."
  ]) {
    assert.ok(migration.includes(copy), `migration is missing approved copy: ${copy}`);
    assert.ok(bootstrapSchema.includes(copy), `bootstrap schema is missing approved copy: ${copy}`);
  }

  assert.match(migration, /revoke all on function public\.build_payment_confirmed_email\(text, text, text, boolean\) from public, anon, authenticated;/i);
  assert.match(migration, /grant execute on function public\.build_payment_confirmed_email\(text, text, text, boolean\) to service_role, postgres;/i);
});

test("payment-confirmed email helper executes with English fallback, immutable snapshot interpolation, and conditional membership copy", async () => {
  const database = await PGlite.create();
  try {
    await database.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
    `);
    await database.exec(paymentEmailHelperSql(migration));

    const withMembership = await database.query<{ subject: string; body_text: string }>(
      "select subject, body_text from public.build_payment_confirmed_email('en', 'Ada Lovelace', 'BS-1001', true)"
    );
    assert.equal(withMembership.rows[0].subject, "Thank you for your purchase | BoxSofa order BS-1001");
    assert.match(withMembership.rows[0].body_text, /Hello Ada Lovelace,/);
    assert.match(withMembership.rows[0].body_text, /order BS-1001 has been confirmed/);
    assert.match(withMembership.rows[0].body_text, /We would also like to thank you for becoming a BoxSofa member!/);

    const withoutMembership = await database.query<{ body_text: string }>(
      "select body_text from public.build_payment_confirmed_email('en', 'Ada Lovelace', 'BS-1001', false)"
    );
    assert.doesNotMatch(withoutMembership.rows[0].body_text, /becoming a BoxSofa member/);
    assert.match(withoutMembership.rows[0].body_text, /possible\.\n\nKind regards,/);

    const unsupportedFallback = await database.query<{ subject: string }>(
      "select subject from public.build_payment_confirmed_email('it', 'Ada Lovelace', 'BS-1001', false)"
    );
    assert.equal(unsupportedFallback.rows[0].subject, "Thank you for your purchase | BoxSofa order BS-1001");

    const nullFallback = await database.query<{ subject: string }>(
      "select subject from public.build_payment_confirmed_email(null, 'Ada Lovelace', 'BS-1001', false)"
    );
    assert.equal(nullFallback.rows[0].subject, "Thank you for your purchase | BoxSofa order BS-1001");
  } finally {
    await database.close();
  }
});

test("paid notification schema and RPC atomically snapshot the lifetime membership welcome", () => {
  for (const sql of [migration, bootstrapSchema]) {
    const paymentRpc = effectivePaymentRpc(sql);
    assert.match(
      sql,
      /email_notifications[\s\S]*member_welcome boolean not null default false/i,
      "email notification snapshots must persist whether this payment welcomed a member"
    );
    assert.match(
      sql,
      /membership_welcomed_at timestamptz/i,
      "profiles must retain a durable lifetime welcome marker"
    );
    assert.match(
      paymentRpc,
      /create or replace function public\.record_stripe_checkout_payment\(\s*p_event_id text,\s*p_event_type text,\s*p_order_id uuid,\s*p_order_number text,\s*p_provider_payment_id text,\s*p_session_id text,\s*p_amount_cents bigint,\s*p_currency text,\s*p_raw_payload jsonb\s*\)\s*returns table\(\s*ok boolean,\s*error_code text,\s*event_processed boolean,\s*payment_confirmed boolean,\s*email_queued boolean,\s*source_record_count bigint\s*\)/is
    );
    assert.match(
      paymentRpc,
      /select\s+order_row\.customer_id,[\s\S]*from public\.orders order_row\s*where order_row\.id = p_order_id\s*for update;[\s\S]*from public\.profiles profile_row[\s\S]*for update;[\s\S]*record_stripe_checkout_payment_v012[\s\S]*set membership_welcomed_at = coalesce\(profile_row\.member_since, now\(\)\)[\s\S]*profile_row\.membership_welcomed_at is null[\s\S]*returning true into v_member_welcome;[\s\S]*build_payment_confirmed_email\(\s*v_order_locale,\s*v_customer_name,\s*v_order_number,\s*v_member_welcome\s*\)/is,
      "the wrapper must serialize the profile and atomically claim its lifetime welcome marker"
    );
    assert.match(
      paymentRpc,
      /set subject = v_email\.subject,\s*preview_text = v_email\.preview_text,\s*body_text = v_email\.body_text,\s*member_welcome = v_member_welcome,\s*automatic_delivery_eligible = true/is,
      "the queued row must store one immutable localized snapshot"
    );
  }

  assert.match(
    bootstrapSchema,
    /on public\.email_notifications\(order_id, event\)[\s\S]*where order_id is not null/i,
    "the unique paid-notification replay guard must remain present"
  );
  assert.match(migration, /where order_id = p_order_id\s*and event = 'payment_confirmed'/i);

  const integration = readFileSync(new URL("../../scripts/stripe-financial-integration.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(integration, /We would also like to thank you for becoming a BoxSofa member!/);
  assert.match(integration, /below EUR 300[\s\S]*member_welcome/);
  assert.match(integration, /first crosses EUR 300[\s\S]*member_welcome/);
  assert.match(integration, /already-member customer[\s\S]*member_welcome/);
  assert.match(integration, /guest paid order[\s\S]*member_welcome/);
  assert.match(integration, /refund[\s\S]*requalif[\s\S]*member_welcome/is);
  assert.match(
    integration,
    /Promise\.all\(\[\s*callPayment\(clientA, crossingThreshold,[\s\S]*callPayment\(clientB, crossingThreshold,[\s\S]*\]\)[\s\S]*expectExactCount\(\s*"email_notifications",\s*\{ order_id: crossingThreshold\.orderId, event: "payment_confirmed" \},\s*1,[\s\S]*expectPaidNotification\(\s*crossingThreshold,\s*true/is,
    "the threshold-crossing fixture must exercise concurrent replay and preserve one welcome notification"
  );
});
