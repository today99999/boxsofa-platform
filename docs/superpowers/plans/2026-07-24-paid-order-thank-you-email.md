# Paid Order Thank-You Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically send one localized thank-you email after a BoxSofa order is fully paid, with a one-time membership welcome when cumulative confirmed purchases first reach EUR 300.

**Architecture:** Capture the checkout locale on the immutable order snapshot, generate the paid-order notification atomically inside the existing Stripe payment RPC, and deliver queued notifications through the existing lease/idempotency state machine from an authenticated Vercel cron endpoint. Keep payment confirmation independent from email-provider availability.

**Tech Stack:** Next.js 14 route handlers, TypeScript, Zod, Supabase/PostgreSQL migrations and RPCs, Stripe webhooks, Resend, Vercel Cron, Node test runner.

## Global Constraints

- Supported locales are exactly `zh`, `en`, `es`, `fr`, and `de`.
- New orders use the website language selected at checkout; existing orders backfill from `profiles.preferred_locale`, then fall back to `en`.
- Recipient name and address come from `orders.customer_name` and `orders.customer_email`.
- Membership welcome appears only on the first payment that changes `profiles.is_member` from false to true at cumulative confirmed purchases of at least EUR 300.
- Guest orders receive the paid-order thank-you but never a membership welcome.
- Payment confirmation queues mail but never waits for Resend.
- Delivery uses the existing lease RPCs and the `boxsofa-email/{notification-id}` provider idempotency-key format.
- Sent and skipped notifications are terminal.
- Never log credentials, API keys, full customer email addresses, or full message bodies.
- Approved customer-facing copy is verbatim in `docs/superpowers/specs/2026-07-24-paid-order-thank-you-email-design.md`.

---

### Task 1: Persist the Checkout Locale

**Files:**
- Create: `supabase/migrations/202607240026_localized_paid_order_email.sql`
- Modify: `supabase/schema.sql`
- Modify: `supabase/migrations/MANIFEST.json`
- Modify: `app/api/orders/route.ts`
- Modify: `components/CartClient.tsx`
- Test: `lib/server/paid-order-email-contract.test.ts`

**Interfaces:**
- Consumes: `LanguageCode` from `lib/i18n.ts`.
- Produces: `orders.locale text not null`, constrained to the five supported locales; POST `/api/orders` requires `locale`.

- [ ] **Step 1: Write the failing schema and route contract test**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/202607240026_localized_paid_order_email.sql", import.meta.url),
  "utf8"
);
const orderRoute = readFileSync(new URL("../../app/api/orders/route.ts", import.meta.url), "utf8");

test("orders persist an immutable supported checkout locale", () => {
  assert.match(migration, /add column if not exists locale text/i);
  assert.match(migration, /preferred_locale/i);
  assert.match(migration, /coalesce\\([^;]*'en'/is);
  assert.match(migration, /check \\(locale in \\('zh', 'en', 'es', 'fr', 'de'\\)\\)/i);
  assert.match(orderRoute, /locale: z\\.enum\\(\\["zh", "en", "es", "fr", "de"\\]\\)/);
  assert.match(orderRoute, /locale: order\\.locale/);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test lib/server/paid-order-email-contract.test.ts`

Expected: FAIL because the migration is absent and the order route has no locale field.

- [ ] **Step 3: Add and backfill the database column**

Use this migration shape, then mirror the final schema in `supabase/schema.sql`:

```sql
alter table public.orders add column if not exists locale text;

update public.orders order_row
set locale = coalesce(
  (select profile.preferred_locale from public.profiles profile where profile.id = order_row.customer_id),
  'en'
)
where order_row.locale is null;

alter table public.orders alter column locale set default 'en';
alter table public.orders alter column locale set not null;
alter table public.orders drop constraint if exists orders_locale_check;
alter table public.orders
  add constraint orders_locale_check check (locale in ('zh', 'en', 'es', 'fr', 'de'));
```

- [ ] **Step 4: Validate and persist the website locale during order creation**

Add `locale: z.enum(["zh", "en", "es", "fr", "de"])` to `createOrderSchema`, add `preferred_locale: order.locale` to the profile upsert, add `locale: order.locale` to the order insert, and add `locale` to the checkout POST body.

- [ ] **Step 5: Update the migration manifest and bootstrap schema**

Run: `node scripts/verify-migration-manifest.mjs --update`

If the script does not support `--update`, calculate the SHA-256 with:

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath 'supabase\migrations\202607240026_localized_paid_order_email.sql').Hash.ToLower()
```

Add the exact filename and hash to `supabase/migrations/MANIFEST.json`.

- [ ] **Step 6: Run focused and migration tests**

Run: `npm test -- --test-name-pattern="checkout locale|migration"`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202607240026_localized_paid_order_email.sql supabase/schema.sql supabase/migrations/MANIFEST.json app/api/orders/route.ts lib/server/paid-order-email-contract.test.ts
git add components/CartClient.tsx
git commit -m "feat: persist checkout locale on orders"
```

---

### Task 2: Build the Five Approved Database Templates

**Files:**
- Modify: `supabase/migrations/202607240026_localized_paid_order_email.sql`
- Modify: `supabase/schema.sql`
- Modify: `supabase/migrations/MANIFEST.json`
- Test: `lib/server/paid-order-email-contract.test.ts`

**Interfaces:**
- Produces: SQL helper `build_payment_confirmed_email(p_locale text, p_customer_name text, p_order_number text, p_member_welcome boolean)` returning `subject`, `preview_text`, and `body_text`.
- Preserves: existing TypeScript preview behavior for non-payment events. TypeScript reads and displays the paid notification snapshot; it does not duplicate the five paid templates.

- [ ] **Step 1: Write failing database template contract tests**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/202607240026_localized_paid_order_email.sql", import.meta.url),
  "utf8"
);

test("database owns all five approved paid-order templates", () => {
  assert.match(migration, /create or replace function public\\.build_payment_confirmed_email/i);
  for (const subject of [
    "感谢您的购买",
    "Thank you for your purchase",
    "Gracias por tu compra",
    "Merci pour votre achat",
    "Vielen Dank für Ihren Einkauf"
  ]) assert.ok(migration.includes(subject));
  assert.match(migration, /p_member_welcome/i);
  assert.match(migration, /else 'en'/i);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test lib/server/paid-order-email-contract.test.ts`

Expected: FAIL because the SQL template helper is absent.

- [ ] **Step 3: Implement the localized SQL helper**

Create a stable SQL function returning one row:

```sql
create or replace function public.build_payment_confirmed_email(
  p_locale text,
  p_customer_name text,
  p_order_number text,
  p_member_welcome boolean
)
returns table(subject text, preview_text text, body_text text)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_locale text := case when p_locale in ('zh', 'en', 'es', 'fr', 'de') then p_locale else 'en' end;
begin
  -- Each CASE branch contains the verbatim approved subject and body.
  -- Append the locale-specific membership paragraph only when p_member_welcome is true.
  return query select v_subject, v_preview_text, v_body_text;
end;
$$;
```

Fill every branch with the exact approved copy from the design specification. Use `format(..., p_order_number)` only with fixed format strings and concatenate customer data as values. Omit the membership paragraph and its preceding blank line when `p_member_welcome` is false.

- [ ] **Step 4: Add exact-copy, membership, and fallback assertions**

Extend the PGlite/bootstrap validation or a focused SQL execution test to call the helper for each locale, assert the approved subject/body, assert membership text appears only when true, and assert an unsupported locale returns English.

- [ ] **Step 5: Refresh schema and manifest, then run template tests**

Mirror the helper in `supabase/schema.sql`, recalculate the migration hash, then run:

```bash
npm run db:bootstrap:validate
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test lib/server/paid-order-email-contract.test.ts
```

Expected: both commands PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202607240026_localized_paid_order_email.sql supabase/schema.sql supabase/migrations/MANIFEST.json lib/server/paid-order-email-contract.test.ts
git commit -m "feat: add localized paid order email templates"
```

---

### Task 3: Queue Membership-Aware Paid Notifications Atomically

**Files:**
- Modify: `supabase/migrations/202607240026_localized_paid_order_email.sql`
- Modify: `supabase/schema.sql`
- Modify: `supabase/migrations/MANIFEST.json`
- Modify: `scripts/stripe-financial-integration.mjs`
- Test: `lib/server/paid-order-email-contract.test.ts`

**Interfaces:**
- Produces: `email_notifications.member_welcome boolean not null default false`.
- Preserves: `record_stripe_checkout_payment(...)` signature and its replay-safe return fields.

- [ ] **Step 1: Extend failing integration assertions**

In `scripts/stripe-financial-integration.mjs`, create a customer profile with `total_paid_eur` below 300, attach two paid fixtures, and assert:

```js
assert.equal(firstNotification.member_welcome, false);
assert.equal(thresholdNotification.member_welcome, true);
assert.equal(replayNotificationCount, 1);
assert.equal(alreadyMemberNotification.member_welcome, false);
```

Also assert a guest fixture has `member_welcome = false`.

- [ ] **Step 2: Run Stripe integration and verify failure**

Run: `npm run stripe:financial:integration`

Expected: FAIL because `member_welcome` does not exist and the RPC does not capture the transition.

- [ ] **Step 3: Add the notification flag and update the payment RPC**

Add:

```sql
alter table public.email_notifications
  add column if not exists member_welcome boolean not null default false;
```

In `record_stripe_checkout_payment`, capture `v_was_member` before the paid-order update. After membership refresh, load `v_is_member`. Set `v_member_welcome := v_order.customer_id is not null and not v_was_member and v_is_member`. Insert the notification using the order locale, customer name, order number, and `v_member_welcome`.

Keep the existing unique `(order_id, event)` insert conflict behavior so concurrent webhook replays cannot generate a second message.

- [ ] **Step 4: Generate the notification snapshot from the approved SQL helper**

Call `build_payment_confirmed_email(v_order.locale, v_order.customer_name, v_order.order_number, v_member_welcome)` inside the payment RPC and insert the returned subject, preview text, and body text into `email_notifications`. Do not add a second paid-order template in TypeScript.

- [ ] **Step 5: Refresh manifest hash and bootstrap schema**

Mirror the migration in `supabase/schema.sql`, recalculate the migration SHA-256, and replace its manifest hash.

- [ ] **Step 6: Run database and financial verification**

Run:

```bash
npm run db:migrations:verify
npm run db:bootstrap:validate
npm run stripe:financial:integration
```

Expected: all commands exit 0; payment replay creates exactly one paid notification; only threshold crossing has `member_welcome = true`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202607240026_localized_paid_order_email.sql supabase/schema.sql supabase/migrations/MANIFEST.json scripts/stripe-financial-integration.mjs lib/server/paid-order-email-contract.test.ts
git commit -m "feat: queue membership aware payment emails"
```

---

### Task 4: Add a Bounded Automatic Dispatcher

**Files:**
- Create: `lib/server/email-notification-dispatcher.ts`
- Create: `lib/server/email-notification-dispatcher.test.ts`
- Create: `app/api/cron/email-notifications/route.ts`
- Create: `lib/server/email-cron-auth.ts`
- Test: `lib/server/email-cron-auth.test.ts`

**Interfaces:**
- Produces: `dispatchPendingEmailNotifications(repository, sender, options)` returning `{ scanned, delivered, failed, conflicted }`.
- Produces: `isAuthorizedCronRequest(request: Request, secret: string | undefined): boolean`.
- Consumes: `deliverEmailNotification` and `sendTransactionalEmail`.

- [ ] **Step 1: Write failing dispatcher tests**

Test a batch containing queued, failed, active sending, expired sending, sent, and skipped rows. Assert only eligible rows reach `deliverEmailNotification`, the batch is capped at 20, ordering is oldest-first, and one provider failure does not stop later rows.

Use this public result contract:

```ts
type DispatchSummary = {
  scanned: number;
  delivered: number;
  failed: number;
  conflicted: number;
};
```

- [ ] **Step 2: Run dispatcher tests and verify failure**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test lib/server/email-notification-dispatcher.test.ts`

Expected: FAIL because the dispatcher module is absent.

- [ ] **Step 3: Implement the bounded dispatcher**

Query at most 20 eligible notifications ordered by `created_at ASC, id ASC`. Pass each snapshot to `deliverEmailNotification`; count `delivered`, `provider_failed`/`finalization_failed`, and `conflict` without logging personal data.

- [ ] **Step 4: Write and implement cron authentication tests**

Required behavior:

```ts
export function isAuthorizedCronRequest(request: Request, secret: string | undefined) {
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
```

Assert missing secret, missing header, and wrong bearer token are false; exact bearer token is true.

- [ ] **Step 5: Add the cron route**

`GET /api/cron/email-notifications` must:

1. Return 401 unless `isAuthorizedCronRequest(request, process.env.CRON_SECRET)` is true.
2. Return 503 unless Supabase service-role and email-provider configurations are valid.
3. Create the service-role repository using existing claim/finalize RPCs.
4. Dispatch one batch and return only aggregate counts.
5. Return 500 with a generic message on unexpected errors.

- [ ] **Step 6: Run dispatcher and delivery tests**

Run:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test lib/server/email-notification-dispatcher.test.ts lib/server/email-cron-auth.test.ts lib/server/email-notification-delivery.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/server/email-notification-dispatcher.ts lib/server/email-notification-dispatcher.test.ts lib/server/email-cron-auth.ts lib/server/email-cron-auth.test.ts app/api/cron/email-notifications/route.ts
git commit -m "feat: dispatch queued transactional emails automatically"
```

---

### Task 5: Schedule, Document, and Verify Production Safety

**Files:**
- Modify: `vercel.json`
- Modify: `.env.example`
- Modify: `scripts/check-env.mjs`
- Modify: `scripts/production-readiness.mjs`
- Modify: `docs/EMAIL-OPERATIONS.md`
- Modify: `scripts/api-auth-audit.mjs`

**Interfaces:**
- Consumes: `GET /api/cron/email-notifications`.
- Produces: a Vercel cron schedule and required `CRON_SECRET` readiness checks.

- [ ] **Step 1: Add failing configuration contract assertions**

Extend `lib/server/paid-order-email-contract.test.ts` to assert:

```ts
assert.deepEqual(vercel.crons, [
  { path: "/api/cron/email-notifications", schedule: "*/5 * * * *" }
]);
assert.match(envExample, /CRON_SECRET=/);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- --test-name-pattern="cron|email"`

Expected: FAIL because no cron is configured.

- [ ] **Step 3: Configure the five-minute schedule**

Set:

```json
{
  "buildCommand": "node scripts/vercel-build.mjs",
  "crons": [
    {
      "path": "/api/cron/email-notifications",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Document `CRON_SECRET` in `.env.example`; validate that it is present and at least 32 characters without printing its value. Add the cron route to the auth audit with expected 401 when no bearer token is supplied.

- [ ] **Step 4: Document operations**

In `docs/EMAIL-OPERATIONS.md`, document automatic five-minute delivery, queued/failed admin visibility, manual retry, terminal sent/skipped behavior, required provider variables, `CRON_SECRET`, and the rule that payment remains successful during email outages.

- [ ] **Step 5: Run the full verification suite**

Run:

```bash
npm test
npm run typecheck
npm run db:migrations:verify
npm run db:bootstrap:validate
npm run stripe:financial:integration
npm run api:auth-audit
npm run build
```

Expected: every command exits 0.

- [ ] **Step 6: Perform a secrets and copy scan**

Run:

```powershell
rg -n -S "EMAIL_API_KEY|CRON_SECRET|BOXSOFA_MAIL_PASSWORD" app lib scripts docs .env.example
rg -n -S "感谢您的购买|Thank you for your purchase|Gracias por tu compra|Merci pour votre achat|Vielen Dank für Ihren Einkauf" lib supabase
```

Expected: secret names appear only in configuration access/documentation and no secret values appear; all five approved subjects are present.

- [ ] **Step 7: Commit**

```bash
git add vercel.json .env.example scripts/check-env.mjs scripts/production-readiness.mjs docs/EMAIL-OPERATIONS.md scripts/api-auth-audit.mjs
git commit -m "ops: schedule paid order email delivery"
```

---

### Task 6: Controlled Release Check

**Files:**
- No source files unless verification exposes a defect.

**Interfaces:**
- Validates the complete paid-order-to-email flow without contacting a real customer.

- [ ] **Step 1: Confirm deployment prerequisites**

Verify Supabase service-role configuration, Resend configuration, sender-domain verification, and a 32-character-or-longer `CRON_SECRET` through readiness commands without printing values.

- [ ] **Step 2: Apply the migration in the intended environment**

Run `npx supabase db push --include-all`, then:

```bash
npm run db:migrations:verify-remote
```

Expected: local manifest and remote checkpoints agree.

- [ ] **Step 3: Use controlled recipient orders**

Create paid test orders addressed only to an owner-controlled inbox, one per locale. Use a linked test customer whose pre-test cumulative paid total is below EUR 300 for the threshold case.

- [ ] **Step 4: Verify delivery facts**

Confirm each order has the selected locale snapshot, one `payment_confirmed` notification, one provider message ID, and status `sent`. Confirm only the threshold-crossing notification has `member_welcome = true`.

- [ ] **Step 5: Verify replay safety**

Replay the Stripe test event and invoke the cron route twice. Confirm the order still has exactly one `(order_id, payment_confirmed)` notification and the provider has not created a duplicate email.

- [ ] **Step 6: Record release evidence**

Record only test order numbers, notification IDs, statuses, timestamps, and aggregate results in the release notes. Do not record credentials, API keys, full customer emails, or message bodies.
