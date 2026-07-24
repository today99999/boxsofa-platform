import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL("../../supabase/migrations/202607240026_localized_paid_order_email.sql", import.meta.url);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";
const orderRoute = readFileSync(new URL("../../app/api/orders/route.ts", import.meta.url), "utf8");
const cartClient = readFileSync(new URL("../../components/CartClient.tsx", import.meta.url), "utf8");
const bootstrapSchema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

test("orders persist an immutable supported checkout locale", () => {
  assert.match(migration, /add column if not exists locale text/i);
  assert.match(migration, /preferred_locale/i);
  assert.match(
    migration,
    /case when profiles\.preferred_locale in \('zh', 'en', 'es', 'fr', 'de'\) then profiles\.preferred_locale else 'en' end/i
  );
  assert.match(migration, /check \(locale in \('zh', 'en', 'es', 'fr', 'de'\)\)/i);
  assert.match(orderRoute, /locale: z\.enum\(\["zh", "en", "es", "fr", "de"\]\)/);
  assert.match(orderRoute, /locale: order\.locale/);
});

test("checkout sends its current website language and bootstrap schema preserves the locale contract", () => {
  assert.match(cartClient, /const \{ language, t \} = useTranslation\(\)/);
  assert.match(cartClient, /locale: language/);
  assert.match(bootstrapSchema, /locale text not null default 'en' check \(locale in \('zh', 'en', 'es', 'fr', 'de'\)\)/i);
});
