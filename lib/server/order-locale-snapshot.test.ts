import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../../app/api/orders/route.ts", import.meta.url), "utf8");
const cart = readFileSync(new URL("../../components/CartClient.tsx", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../../supabase/migrations/202607240026_order_locale_snapshot.sql", import.meta.url),
  "utf8"
);

test("checkout persists one supported order locale", () => {
  assert.match(route, /locale: z\.enum\(\["zh", "en", "es", "fr", "de"\]\)/);
  assert.match(route, /locale: order\.locale/);
  assert.match(cart, /locale: language/);
  assert.match(migration, /check \(locale in \('zh', 'en', 'es', 'fr', 'de'\)\)/i);
  assert.doesNotMatch(migration, /email_notifications|cron|resend/i);
});
