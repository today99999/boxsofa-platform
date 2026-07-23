# BoxSofa Data Center Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a truthful, owner-only BoxSofa operating cockpit that installs on Windows, works on mobile, ingests consent-aware website analytics, reports real GMV/orders/visitors/sources, exposes data freshness, and provides an after-sales foundation.

**Architecture:** Add a server-side analytics and operations data layer to the existing Next.js/Supabase application, then build a new `/data-center` PWA that consumes owner-only APIs. Existing order, customer, support, review, and inventory contracts remain in place; local browser analytics stops being the reporting source of truth.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript 5, Supabase PostgreSQL/RLS, Stripe, Zod, Vercel, Web App Manifest, Service Worker, `lucide-react`, Node test runner.

## Global Constraints

- Production must never display demo business data.
- The first release is owner-only; do not add employee roles.
- Store raw timestamps in UTC and present them in `Europe/Madrid`.
- GMV is successful Stripe-paid order merchandise total before refunds.
- Net sales is GMV minus completed refunds.
- Use UTM attribution first, then recognized referrer, with last non-direct click for orders.
- Analytics collection must require analytics consent.
- Missing cost is `unknown`, never zero.
- Every metric block must expose source, last successful sync, and health state.
- Secrets stay server-side and must not enter the PWA bundle.
- Refunds, cancellations, customer messages, publishing, imports, and manual corrections require confirmation.
- Reuse current order, auth, audit, support, review, product, and Supabase patterns.
- Do not refactor unrelated storefront code.

## Scope Boundary

This plan is the first independently deployable subsystem from the approved design. Follow-up plans will cover:

1. social/API synchronization and marketing intelligence;
2. procurement, landed cost, margin, VAT exports, and advanced Data Cube;
3. saved reports, scheduled exports, and richer mobile notifications.

Phase 1 must be usable without those later subsystems. Their navigation entries may show a clear `Planned` state, but they must not show sample metrics.

## File Map

### Data and domain

- Create `supabase/migrations/202607230001_data_center_foundation.sql`: additive analytics, source-health, alert, and after-sales schema.
- Modify `supabase/schema.sql`: mirror the migration for clean project bootstrap.
- Create `lib/data-center/types.ts`: shared DTOs for metrics, freshness, alerts, and after-sales.
- Create `lib/data-center/metrics.ts`: pure metric calculations and source attribution helpers.
- Create `lib/data-center/metrics.test.ts`: metric definition tests.
- Create `lib/data-center/schema.test.ts`: migration contract checks.
- Create `lib/data-center/after-sales.ts`: after-sales identifiers and mapping helpers.
- Modify `package.json`: include nested Data Center tests in the standard test command.

### Analytics ingestion

- Modify `lib/analytics.ts`: queue and deliver consented events to the server.
- Modify `components/CookieConsent.tsx`: persist consent server-side and trigger the first event once.
- Modify `app/api/orders/route.ts`: accept validated last non-direct attribution from checkout.
- Create `app/api/analytics/consent/route.ts`: public, rate-limited consent endpoint.
- Create `app/api/analytics/events/route.ts`: public, rate-limited event ingestion endpoint.
- Modify `scripts/api-auth-audit.mjs`: assert analytics endpoints are public but validate malformed input.

### Owner APIs

- Create `lib/server/data-center-overview.ts`: bounded Supabase queries and overview aggregation.
- Create `app/api/admin/data-center/overview/route.ts`: owner-only overview endpoint.
- Create `app/api/admin/data-center/search/route.ts`: owner-only bounded universal search.
- Create `app/api/admin/after-sales/route.ts`: owner-only list/create endpoint.
- Create `app/api/admin/after-sales/[caseId]/route.ts`: owner-only case update endpoint.
- Modify `scripts/api-auth-audit.mjs`: protect every new owner API.

### Installable application

- Create `app/manifest.ts`: BoxSofa Data Center install metadata.
- Create `public/sw.js`: minimal network-safe service worker.
- Create `components/data-center/PwaRegistrar.tsx`: register the service worker.
- Create `app/data-center/layout.tsx`: private metadata and Data Center stylesheet.
- Create `app/data-center/page.tsx`: owner application route.
- Create `components/data-center/DataCenterApp.tsx`: application shell and section router.
- Create `components/data-center/OverviewSection.tsx`: real operating cockpit.
- Create `components/data-center/AfterSalesSection.tsx`: after-sales list/create/update UI.
- Create `components/data-center/DataFreshness.tsx`: freshness and health presentation.
- Create `components/data-center/UniversalSearch.tsx`: owner search.
- Create `app/data-center/data-center.css`: desktop/mobile layout.
- Modify `app/layout.tsx`: expose the manifest metadata.
- Modify `next.config.js`: private no-store headers for `/data-center`.
- Modify `package.json`: add `lucide-react`.

### Verification and documentation

- Modify `scripts/prelaunch-smoke.mjs`: include `/data-center`.
- Modify `scripts/production-verify.mjs`: preserve payment-enabled verification.
- Modify `docs/PROJECT-CONTEXT-COMPACT.md`: record the delivered application and data semantics.

---

### Task 1: Foundation Migration and Shared Contracts

**Files:**
- Create: `supabase/migrations/202607230001_data_center_foundation.sql`
- Modify: `supabase/schema.sql`
- Create: `lib/data-center/types.ts`
- Create: `lib/data-center/schema.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `public.analytics_consents`, `public.analytics_events`, `public.orders`, `public.payments`, `public.profiles`.
- Produces: `DataHealthState`, `DataFreshness`, `DashboardAlert`, `AfterSalesCase`, and additive database tables used by later tasks.

- [ ] **Step 1: Write the failing schema contract test**

```ts
// lib/data-center/schema.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/202607230001_data_center_foundation.sql", import.meta.url),
  "utf8"
);

test("data center migration declares required tables and idempotency keys", () => {
  for (const contract of [
    "event_key text not null",
    "session_id text not null",
    "create table if not exists public.data_source_health",
    "create table if not exists public.dashboard_alerts",
    "create table if not exists public.after_sales_cases",
    "create table if not exists public.payment_refunds",
    "unique index if not exists idx_analytics_events_event_key"
  ]) {
    assert.match(migration.toLowerCase(), new RegExp(contract.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
```

- [ ] **Step 2: Run the schema test and verify it fails**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test lib/data-center/schema.test.ts`

Expected: FAIL with `ENOENT` for `202607230001_data_center_foundation.sql`.

- [ ] **Step 3: Create the additive migration**

```sql
-- supabase/migrations/202607230001_data_center_foundation.sql
alter table public.analytics_events add column if not exists event_key text;
alter table public.analytics_events add column if not exists session_id text;
alter table public.analytics_events add column if not exists device_type text;
alter table public.analytics_events add column if not exists country_code text;
alter table public.analytics_events add column if not exists raw_utm jsonb not null default '{}'::jsonb;

update public.analytics_events
set event_key = coalesce(event_key, id::text),
    session_id = coalesce(session_id, visitor_id)
where event_key is null or session_id is null;

alter table public.analytics_events alter column event_key set not null;
alter table public.analytics_events alter column session_id set not null;

create unique index if not exists idx_analytics_events_event_key
on public.analytics_events(event_key);

create table if not exists public.data_source_health (
  source_key text primary key,
  source_type text not null check (source_type in ('database', 'website', 'stripe', 'social', 'manual')),
  state text not null check (state in ('current', 'delayed', 'failed', 'disconnected', 'manual', 'partial')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  record_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.dashboard_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  title text not null,
  detail text,
  entity_type text,
  entity_id text,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.after_sales_cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique,
  order_id uuid not null references public.orders(id) on delete restrict,
  customer_id uuid references public.profiles(id) on delete set null,
  case_type text not null check (case_type in ('return', 'refund', 'replacement', 'damage', 'delivery', 'quality', 'other')),
  status text not null default 'requested' check (status in ('requested', 'reviewing', 'approved', 'return_in_transit', 'received', 'replacement_sent', 'refunded', 'resolved', 'rejected')),
  responsibility text check (responsibility in ('customer', 'boxsofa', 'carrier', 'supplier', 'unknown')),
  requested_remedy text,
  reason text not null,
  evidence jsonb not null default '[]'::jsonb,
  refund_amount_eur numeric(12, 2) check (refund_amount_eur >= 0),
  return_shipping_cost_eur numeric(12, 2) check (return_shipping_cost_eur >= 0),
  replacement_cost_eur numeric(12, 2) check (replacement_cost_eur >= 0),
  internal_note text,
  due_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete set null,
  provider text not null default 'stripe',
  provider_refund_id text not null unique,
  amount_eur numeric(12, 2) not null check (amount_eur >= 0),
  currency text not null default 'EUR',
  status text not null check (status in ('pending', 'succeeded', 'failed', 'cancelled')),
  reason text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.data_source_health enable row level security;
alter table public.dashboard_alerts enable row level security;
alter table public.after_sales_cases enable row level security;
alter table public.payment_refunds enable row level security;

drop policy if exists "admins manage source health" on public.data_source_health;
create policy "admins manage source health" on public.data_source_health
for all using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admins manage dashboard alerts" on public.dashboard_alerts;
create policy "admins manage dashboard alerts" on public.dashboard_alerts
for all using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admins manage after sales" on public.after_sales_cases;
create policy "admins manage after sales" on public.after_sales_cases
for all using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admins manage payment refunds" on public.payment_refunds;
create policy "admins manage payment refunds" on public.payment_refunds
for all using ((select public.is_admin())) with check ((select public.is_admin()));

create index if not exists idx_after_sales_status_due
on public.after_sales_cases(status, due_at);
create index if not exists idx_after_sales_order
on public.after_sales_cases(order_id, created_at desc);

drop trigger if exists set_after_sales_cases_updated_at on public.after_sales_cases;
create trigger set_after_sales_cases_updated_at before update on public.after_sales_cases
for each row execute function public.set_updated_at();
drop trigger if exists set_payment_refunds_updated_at on public.payment_refunds;
create trigger set_payment_refunds_updated_at before update on public.payment_refunds
for each row execute function public.set_updated_at();

insert into public.data_source_health (source_key, source_type, state)
values
  ('orders', 'database', 'partial'),
  ('website_analytics', 'website', 'disconnected'),
  ('stripe', 'stripe', 'partial')
on conflict (source_key) do nothing;
```

- [ ] **Step 4: Mirror the migration in the bootstrap schema**

Append the same additive column, table, RLS, policy, and index declarations to `supabase/schema.sql` immediately after the current analytics/chat declarations, preserving the schema's existing organization.

- [ ] **Step 5: Add shared DTOs**

```ts
// lib/data-center/types.ts
export type DataHealthState = "current" | "delayed" | "failed" | "disconnected" | "manual" | "partial";

export type DataFreshness = {
  sourceKey: string;
  label: string;
  state: DataHealthState;
  lastSuccessAt: string | null;
  recordCount: number;
  message?: string;
};

export type DashboardAlert = {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail?: string;
  entityType?: string;
  entityId?: string;
  createdAt: string;
};

export type AfterSalesCase = {
  id: string;
  caseNumber: string;
  orderNumber: string;
  customerName: string;
  type: "return" | "refund" | "replacement" | "damage" | "delivery" | "quality" | "other";
  status: "requested" | "reviewing" | "approved" | "return_in_transit" | "received" | "replacement_sent" | "refunded" | "resolved" | "rejected";
  reason: string;
  dueAt: string | null;
  refundAmountEur: number | null;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 6: Apply and verify the migration**

Use the connected Supabase project `osmjevtynywbkokzejcp` to apply `supabase/migrations/202607230001_data_center_foundation.sql` as migration name `data_center_foundation`.

Verify with a read-only SQL query:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('data_source_health', 'dashboard_alerts', 'after_sales_cases', 'payment_refunds')
order by table_name;
```

Expected: exactly four rows.

- [ ] **Step 7: Run tests and typecheck**

Update the test script in `package.json`:

```json
"test": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test lib/*.test.ts lib/data-center/*.test.ts"
```

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: all existing tests plus `schema.test.ts` PASS; TypeScript exits 0.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/202607230001_data_center_foundation.sql supabase/schema.sql lib/data-center/types.ts lib/data-center/schema.test.ts package.json
git commit -m "Add data center foundation schema"
```

---

### Task 2: Canonical Metrics and Attribution

**Files:**
- Create: `lib/data-center/metrics.ts`
- Create: `lib/data-center/metrics.test.ts`

**Interfaces:**
- Consumes: normalized paid-order, refund, and analytics-event records.
- Produces: `calculateCommerceMetrics(input): CommerceMetrics` and `resolveAttribution(input): Attribution`.

- [ ] **Step 1: Write failing metric tests**

```ts
// lib/data-center/metrics.test.ts
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
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test lib/data-center/metrics.test.ts`

Expected: FAIL with module-not-found for `metrics.ts`.

- [ ] **Step 3: Implement the pure metric module**

```ts
// lib/data-center/metrics.ts
export type CommerceMetricInput = {
  orders: Array<{ id: string; paymentStatus: string; totalEur: number }>;
  refunds: Array<{ orderId: string; amountEur: number; completed: boolean }>;
  uniqueVisitors: number;
};

export type CommerceMetrics = {
  gmvEur: number;
  netSalesEur: number;
  paidOrders: number;
  averageOrderValueEur: number;
  conversionRate: number | null;
};

const PAID_PAYMENT_STATUSES = new Set(["paid", "refunded"]);

export function calculateCommerceMetrics(input: CommerceMetricInput): CommerceMetrics {
  const paid = input.orders.filter((order) => PAID_PAYMENT_STATUSES.has(order.paymentStatus));
  const gmvEur = paid.reduce((sum, order) => sum + order.totalEur, 0);
  const refundedEur = input.refunds
    .filter((refund) => refund.completed)
    .reduce((sum, refund) => sum + refund.amountEur, 0);
  return {
    gmvEur,
    netSalesEur: gmvEur - refundedEur,
    paidOrders: paid.length,
    averageOrderValueEur: paid.length ? gmvEur / paid.length : 0,
    conversionRate: input.uniqueVisitors > 0 ? paid.length / input.uniqueVisitors : null
  };
}

export function resolveAttribution(input: { utmSource?: string | null; referrer?: string | null }) {
  if (input.utmSource?.trim()) return { source: input.utmSource.trim().toLowerCase(), method: "utm" as const };
  const referrer = input.referrer?.toLowerCase() ?? "";
  for (const source of ["tiktok", "instagram", "facebook", "youtube", "pinterest", "google"]) {
    if (referrer.includes(source)) return { source, method: "referrer" as const };
  }
  return { source: referrer ? "referral" : "direct", method: "inferred" as const };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm.cmd test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/data-center/metrics.ts lib/data-center/metrics.test.ts
git commit -m "Define canonical commerce metrics"
```

---

### Task 3: Consent and Analytics Ingestion APIs

**Files:**
- Create: `app/api/analytics/consent/route.ts`
- Create: `app/api/analytics/events/route.ts`
- Modify: `scripts/api-auth-audit.mjs`

**Interfaces:**
- Consumes: JSON consent and event payloads from the storefront.
- Produces: `POST /api/analytics/consent` and `POST /api/analytics/events`, both returning `{ ok: true }` on accepted input.

- [ ] **Step 1: Add malformed-input checks to the API audit**

Add to `publicChecks` in `scripts/api-auth-audit.mjs`:

```js
  { method: 'POST', path: '/api/analytics/consent', body: {}, allowedStatuses: [400] },
  { method: 'POST', path: '/api/analytics/events', body: {}, allowedStatuses: [400] },
```

- [ ] **Step 2: Run the API audit against local production and verify it fails**

Run:

```powershell
npm.cmd run build
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm.cmd run start -- -p 3002" -WorkingDirectory $PWD -WindowStyle Hidden
$env:API_AUDIT_BASE_URL="http://localhost:3002"
npm.cmd run api:auth-audit
```

Expected: FAIL because both analytics routes return 404.

- [ ] **Step 3: Implement the consent endpoint**

```ts
// app/api/analytics/consent/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const schema = z.object({
  visitorId: z.string().min(8).max(120),
  consent: z.enum(["necessary", "analytics"]),
  locale: z.enum(["zh", "en", "es", "fr", "de"]).default("en"),
  version: z.string().min(1).max(40)
});

export async function POST(request: Request) {
  const limit = checkRateLimit(request, { key: "analytics:consent", limit: 30, windowMs: 60_000 });
  if (!limit.ok) return rateLimitResponse(limit.resetAt);
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, issues: parsed.error.flatten() }, { status: 400 });
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("analytics_consents").insert({
    visitor_id: parsed.data.visitorId,
    consent: parsed.data.consent,
    locale: parsed.data.locale,
    consent_version: parsed.data.version
  });
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Implement the event endpoint**

```ts
// app/api/analytics/events/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const eventSchema = z.object({
  eventKey: z.string().min(8).max(160),
  type: z.enum(["page_view", "product_view", "add_to_cart", "begin_checkout", "order_submit"]),
  createdAt: z.string().datetime(),
  visitorId: z.string().min(8).max(120),
  sessionId: z.string().min(8).max(120),
  path: z.string().startsWith("/").max(500),
  source: z.string().min(1).max(80),
  medium: z.string().max(80).optional(),
  campaign: z.string().max(160).optional(),
  referrerDomain: z.string().max(255).optional(),
  deviceType: z.enum(["desktop", "mobile", "tablet"]).optional(),
  productId: z.string().max(120).optional(),
  productName: z.string().max(300).optional(),
  valueEur: z.number().nonnegative().optional()
});

export async function POST(request: Request) {
  const limit = checkRateLimit(request, { key: "analytics:event", limit: 120, windowMs: 60_000 });
  if (!limit.ok) return rateLimitResponse(limit.resetAt);
  const parsed = eventSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, issues: parsed.error.flatten() }, { status: 400 });
  const event = parsed.data;
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("analytics_events").upsert({
    event_key: event.eventKey,
    event_type: event.type,
    created_at: event.createdAt,
    visitor_id: event.visitorId,
    session_id: event.sessionId,
    path: event.path,
    source: event.source,
    medium: event.medium ?? null,
    campaign: event.campaign ?? null,
    referrer_domain: event.referrerDomain ?? null,
    device_type: event.deviceType ?? null,
    product_name: event.productName ?? null,
    value_eur: event.valueEur ?? null
  }, { onConflict: "event_key", ignoreDuplicates: true });
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  await supabase.from("data_source_health").upsert({
    source_key: "website_analytics",
    source_type: "website",
    state: "current",
    last_attempt_at: new Date().toISOString(),
    last_success_at: new Date().toISOString(),
    last_error: null
  }, { onConflict: "source_key" });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run audit and build**

Run: `npm.cmd run typecheck && npm.cmd run build && npm.cmd run api:auth-audit`

Expected: typecheck/build PASS; both new public endpoint checks report `OK public`.

- [ ] **Step 6: Commit**

```bash
git add app/api/analytics/consent/route.ts app/api/analytics/events/route.ts scripts/api-auth-audit.mjs
git commit -m "Add consent-aware analytics ingestion"
```

---

### Task 4: Storefront Event Delivery

**Files:**
- Modify: `lib/analytics.ts`
- Modify: `components/CookieConsent.tsx`
- Modify: `components/AddToCart.tsx`
- Modify: `components/CartClient.tsx`
- Modify: `app/api/orders/route.ts`
- Create: `lib/analytics.test.ts`

**Interfaces:**
- Consumes: consent in `ANALYTICS_CONSENT_KEY`.
- Produces: idempotent server events while retaining a bounded local delivery queue.

- [ ] **Step 1: Write failing analytics helper tests**

```ts
// lib/analytics.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { inferDeviceType, sanitizeReferrerDomain } from "./analytics.ts";

test("analytics helpers normalize device and referrer", () => {
  assert.equal(inferDeviceType(390), "mobile");
  assert.equal(inferDeviceType(1024), "tablet");
  assert.equal(inferDeviceType(1440), "desktop");
  assert.equal(sanitizeReferrerDomain("https://www.instagram.com/reel/1"), "www.instagram.com");
  assert.equal(sanitizeReferrerDomain("not a url"), "");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm.cmd test`

Expected: FAIL because `inferDeviceType` and `sanitizeReferrerDomain` are not exported.

- [ ] **Step 3: Replace local-only tracking with a delivery queue**

In `lib/analytics.ts`, preserve existing public types and add:

```ts
export const ANALYTICS_QUEUE_KEY = "boxsofa_analytics_queue_v1";
export const ANALYTICS_SESSION_KEY = "boxsofa_analytics_session_v1";
export const ANALYTICS_ATTRIBUTION_KEY = "boxsofa_analytics_attribution_v1";

export function inferDeviceType(width: number) {
  return width < 768 ? "mobile" : width < 1200 ? "tablet" : "desktop";
}

export function sanitizeReferrerDomain(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function getSessionId() {
  const existing = sessionStorage.getItem(ANALYTICS_SESSION_KEY);
  if (existing) return existing;
  const next = `s-${crypto.randomUUID()}`;
  sessionStorage.setItem(ANALYTICS_SESSION_KEY, next);
  return next;
}

async function deliverEvent(event: AnalyticsEvent & { eventKey: string; sessionId: string }) {
  const response = await fetch("/api/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...event,
      eventKey: event.eventKey,
      sessionId: event.sessionId,
      referrerDomain: sanitizeReferrerDomain(event.referrer ?? ""),
      deviceType: inferDeviceType(window.innerWidth)
    }),
    keepalive: true
  });
  if (!response.ok) throw new Error(`Analytics delivery failed: ${response.status}`);
}

export function getStoredAttribution() {
  try {
    return JSON.parse(localStorage.getItem(ANALYTICS_ATTRIBUTION_KEY) || "null") as {
      source: string;
      medium?: string;
      campaign?: string;
      referrer?: string;
      occurredAt: string;
    } | null;
  } catch {
    return null;
  }
}
```

Update `trackEvent` so it:

1. exits unless consent is `analytics`;
2. creates `eventKey` with `crypto.randomUUID()`;
3. stores at most 200 queued events;
4. writes non-direct attribution to `ANALYTICS_ATTRIBUTION_KEY`;
5. calls `deliverEvent`;
6. removes the event from the queue only after HTTP success.

- [ ] **Step 4: Persist consent server-side**

In `components/CookieConsent.tsx`, update `saveConsent`:

```ts
async function saveConsent(nextConsent: AnalyticsConsent) {
  localStorage.setItem(ANALYTICS_CONSENT_KEY, nextConsent);
  setConsent(nextConsent);
  const visitorId = getOrCreateVisitorId();
  await fetch("/api/analytics/consent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ visitorId, consent: nextConsent, locale: language, version: "2026-07-23" })
  }).catch(() => undefined);
  if (nextConsent === "analytics") trackCurrentPage();
}
```

Import `getOrCreateVisitorId` and obtain the existing `language` value from `useTranslation()`.

- [ ] **Step 5: Carry last non-direct attribution into the order**

In `components/CartClient.tsx`, import `getStoredAttribution` and include:

```ts
attribution: getStoredAttribution()
```

in the order POST body.

In `app/api/orders/route.ts`, add:

```ts
const attributionSchema = z.object({
  source: z.string().trim().min(1).max(80),
  medium: z.string().trim().max(80).optional(),
  campaign: z.string().trim().max(160).optional(),
  referrer: z.string().url().max(500).optional(),
  occurredAt: z.string().datetime()
});
```

Add `attribution: attributionSchema.nullable().optional()` to `createOrderSchema`, then replace the current attribution assignment with:

```ts
const requestAttribution = trackOrderEventFields(request);
const attribution = order.attribution
  ? {
      source: order.attribution.source,
      utm_source: order.attribution.source,
      utm_medium: order.attribution.medium ?? null,
      utm_campaign: order.attribution.campaign ?? null,
      referrer: order.attribution.referrer ?? null
    }
  : requestAttribution;
```

- [ ] **Step 6: Verify event call sites retain product and value fields**

Ensure:

- `AddToCart.tsx` sends SKU/name/value for add-to-cart and begin-checkout.
- `CartClient.tsx` sends `order_submit` only after the order API succeeds, not before payment.
- Stripe-paid conversion remains calculated from order/payment data, not the browser event.

- [ ] **Step 7: Run tests, typecheck, and build**

Run: `npm.cmd test && npm.cmd run typecheck && npm.cmd run build`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/analytics.ts lib/analytics.test.ts components/CookieConsent.tsx components/AddToCart.tsx components/CartClient.tsx app/api/orders/route.ts
git commit -m "Deliver storefront analytics to the server"
```

---

### Task 5: Stripe Refund Truth and Real Owner Overview API

**Files:**
- Create: `lib/server/stripe-refunds.ts`
- Modify: `app/api/stripe/webhook/route.ts`
- Create: `lib/server/data-center-overview.ts`
- Create: `app/api/admin/data-center/overview/route.ts`
- Modify: `scripts/api-auth-audit.mjs`
- Create: `lib/data-center/overview.test.ts`

**Interfaces:**
- Consumes: Stripe refund webhooks plus `orders`, `payment_refunds`, `analytics_events`, `after_sales_cases`, `dashboard_alerts`, and `data_source_health`.
- Produces: `GET /api/admin/data-center/overview?range=7d` returning `DataCenterOverview`.

- [ ] **Step 1: Define and test refund completion and range parsing**

```ts
// lib/data-center/overview.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { parseOverviewRange } from "../server/data-center-overview.ts";
import { isFullRefund } from "../server/stripe-refunds.ts";

test("overview range accepts bounded presets", () => {
  assert.equal(parseOverviewRange("today").days, 1);
  assert.equal(parseOverviewRange("7d").days, 7);
  assert.equal(parseOverviewRange("30d").days, 30);
  assert.equal(parseOverviewRange("bad").days, 7);
});

test("full refund requires the succeeded refund total to cover the paid total", () => {
  assert.equal(isFullRefund(719, 719), true);
  assert.equal(isFullRefund(719, 100), false);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm.cmd test`

Expected: FAIL because `data-center-overview.ts` and `stripe-refunds.ts` do not exist.

- [ ] **Step 3: Implement idempotent Stripe refund persistence**

```ts
// lib/server/stripe-refunds.ts
import type Stripe from "stripe";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export function isFullRefund(orderTotalEur: number, succeededRefundEur: number) {
  return succeededRefundEur + 0.005 >= orderTotalEur;
}

export async function recordStripeRefund(supabase: ServiceClient, refund: Stripe.Refund) {
  const paymentIntentId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
  if (!paymentIntentId) return { ok: false as const, message: "Refund is missing payment intent." };
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, order_id")
    .eq("provider", "stripe")
    .eq("provider_payment_id", paymentIntentId)
    .eq("status", "paid")
    .maybeSingle();
  if (paymentError || !payment) return { ok: false as const, message: paymentError?.message || "Payment not found." };
  const status = refund.status === "succeeded" ? "succeeded" : refund.status === "failed" ? "failed" : refund.status === "canceled" ? "cancelled" : "pending";
  const { error } = await supabase.from("payment_refunds").upsert({
    order_id: payment.order_id,
    payment_id: payment.id,
    provider: "stripe",
    provider_refund_id: refund.id,
    amount_eur: refund.amount / 100,
    currency: refund.currency.toUpperCase(),
    status,
    reason: refund.reason ?? null,
    raw_payload: refund
  }, { onConflict: "provider_refund_id" });
  if (error) return { ok: false as const, message: error.message };
  if (status === "succeeded") {
    const [{ data: refunds }, { data: order }] = await Promise.all([
      supabase.from("payment_refunds").select("amount_eur").eq("order_id", payment.order_id).eq("status", "succeeded"),
      supabase.from("orders").select("total_eur").eq("id", payment.order_id).single()
    ]);
    const refunded = (refunds ?? []).reduce((sum, row) => sum + Number(row.amount_eur), 0);
    const orderTotal = Number(order?.total_eur ?? 0);
    if (isFullRefund(orderTotal, refunded)) {
      await supabase.from("orders").update({ payment_status: "refunded", status: "refunded" }).eq("id", payment.order_id);
    }
  }
  return { ok: true as const };
}
```

In `app/api/stripe/webhook/route.ts`, after the checkout handling, add:

```ts
if (event.type === "refund.created" || event.type === "refund.updated") {
  const result = await recordStripeRefund(createSupabaseServiceRoleClient(), event.data.object as Stripe.Refund);
  if (!result.ok) return NextResponse.json({ ok: false, message: result.message }, { status: 500 });
}
```

Import `recordStripeRefund` from `@/lib/server/stripe-refunds`.
After any successfully handled Stripe event, upsert `data_source_health` for `source_key: "stripe"` with `state: "current"` and both attempt/success timestamps set to the current UTC ISO timestamp.

- [ ] **Step 4: Implement the bounded overview service**

```ts
// lib/server/data-center-overview.ts
import { calculateCommerceMetrics } from "@/lib/data-center/metrics";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export function parseOverviewRange(value: string | null) {
  const days = value === "today" ? 1 : value === "30d" ? 30 : 7;
  return { key: days === 1 ? "today" : `${days}d`, days };
}

export async function loadDataCenterOverview(rangeValue: string | null) {
  const range = parseOverviewRange(rangeValue);
  const since = new Date(Date.now() - range.days * 86_400_000).toISOString();
  const supabase = createSupabaseServiceRoleClient();
  const [ordersResult, visitorsResult, refundsResult, alertsResult, healthResult, afterSalesResult] = await Promise.all([
    supabase.from("orders").select("id, payment_status, total_eur, created_at").gte("created_at", since),
    supabase.from("analytics_events").select("visitor_id").eq("event_type", "page_view").gte("created_at", since),
    supabase.from("payment_refunds").select("order_id, amount_eur, status").eq("status", "succeeded").gte("updated_at", since),
    supabase.from("dashboard_alerts").select("id, alert_type, severity, title, detail, entity_type, entity_id, created_at").eq("status", "open").order("created_at", { ascending: false }).limit(20),
    supabase.from("data_source_health").select("source_key, state, last_success_at, record_count, last_error").order("source_key"),
    supabase.from("after_sales_cases").select("id", { count: "exact", head: true }).not("status", "in", '("resolved","rejected")')
  ]);
  const errors = [ordersResult.error, visitorsResult.error, refundsResult.error, alertsResult.error, healthResult.error, afterSalesResult.error].filter(Boolean);
  if (errors.length) throw new Error(errors.map((error) => error!.message).join("; "));
  const visitors = new Set((visitorsResult.data ?? []).map((row) => row.visitor_id)).size;
  await supabase.from("data_source_health").upsert({
    source_key: "orders",
    source_type: "database",
    state: "current",
    last_attempt_at: new Date().toISOString(),
    last_success_at: new Date().toISOString(),
    record_count: ordersResult.data?.length ?? 0,
    last_error: null
  }, { onConflict: "source_key" });
  const metrics = calculateCommerceMetrics({
    orders: (ordersResult.data ?? []).map((row) => ({ id: row.id, paymentStatus: row.payment_status, totalEur: Number(row.total_eur) })),
    refunds: (refundsResult.data ?? []).map((row) => ({ orderId: row.order_id, amountEur: Number(row.amount_eur), completed: true })),
    uniqueVisitors: visitors
  });
  return {
    range: range.key,
    metrics,
    visitors,
    openAfterSales: afterSalesResult.count ?? 0,
    alerts: (alertsResult.data ?? []).map((row) => ({
      id: row.id,
      type: row.alert_type,
      severity: row.severity,
      title: row.title,
      detail: row.detail ?? undefined,
      entityType: row.entity_type ?? undefined,
      entityId: row.entity_id ?? undefined,
      createdAt: row.created_at
    })),
    freshness: (healthResult.data ?? []).map((row) => ({
      sourceKey: row.source_key,
      label: row.source_key,
      state: row.state,
      lastSuccessAt: row.last_success_at,
      recordCount: row.record_count,
      message: row.last_error ?? undefined
    }))
  };
}
```

- [ ] **Step 5: Add the owner-only route**

```ts
// app/api/admin/data-center/overview/route.ts
import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/server/admin-auth";
import { loadDataCenterOverview } from "@/lib/server/data-center-overview";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireAdminAccess();
  if (!access.ok || access.role !== "owner") {
    return NextResponse.json({ ok: false, message: "Owner access required." }, { status: 401 });
  }
  try {
    const overview = await loadDataCenterOverview(new URL(request.url).searchParams.get("range"));
    return NextResponse.json({ ok: true, overview });
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Could not load data center overview.", detail: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Add API auth coverage**

Add to `protectedChecks`:

```js
  { method: 'GET', path: '/api/admin/data-center/overview?range=7d' },
```

- [ ] **Step 7: Run tests and API audit**

Run: `npm.cmd test && npm.cmd run typecheck && npm.cmd run build && npm.cmd run api:auth-audit`

Expected: PASS and `OK protected GET /api/admin/data-center/overview?range=7d`.

- [ ] **Step 8: Commit**

```bash
git add lib/server/stripe-refunds.ts app/api/stripe/webhook/route.ts lib/server/data-center-overview.ts lib/data-center/overview.test.ts app/api/admin/data-center/overview/route.ts scripts/api-auth-audit.mjs
git commit -m "Add refund-aware owner overview API"
```

---

### Task 6: After-Sales Foundation

**Files:**
- Create: `lib/data-center/after-sales.ts`
- Create: `app/api/admin/after-sales/route.ts`
- Create: `app/api/admin/after-sales/[caseId]/route.ts`
- Modify: `scripts/api-auth-audit.mjs`
- Create: `lib/data-center/after-sales.test.ts`

**Interfaces:**
- Consumes: owner session, valid order number, after-sales payload.
- Produces: list/create/update APIs returning `AfterSalesCase`.

- [ ] **Step 1: Write the case-number test**

```ts
// lib/data-center/after-sales.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { createAfterSalesCaseNumber } from "./after-sales.ts";

test("after-sales case numbers are recognizable and unique per timestamp", () => {
  assert.match(createAfterSalesCaseNumber(1784820000000), /^AS-\d{10}$/);
});
```

- [ ] **Step 2: Implement the tested identifier helper**

```ts
// lib/data-center/after-sales.ts
export function createAfterSalesCaseNumber(now = Date.now()) {
  return `AS-${String(now).slice(-10)}`;
}
```

- [ ] **Step 3: Implement list/create with validated order linkage**

`app/api/admin/after-sales/route.ts` must:

- import `createAfterSalesCaseNumber` from `@/lib/data-center/after-sales`;
- require owner access;
- validate `orderNumber`, `type`, `reason`, `requestedRemedy`, and optional `dueAt`;
- resolve `orders.id` before insert;
- set `created_by` to the owner user ID;
- return no more than 200 recent cases joined to order number and customer name.

Core schema:

```ts
const createCaseSchema = z.object({
  orderNumber: z.string().trim().min(3).max(80),
  type: z.enum(["return", "refund", "replacement", "damage", "delivery", "quality", "other"]),
  reason: z.string().trim().min(5).max(4000),
  requestedRemedy: z.string().trim().max(1000).optional(),
  dueAt: z.string().datetime().optional()
});
```

- [ ] **Step 4: Implement safe updates**

`app/api/admin/after-sales/[caseId]/route.ts` must accept only:

```ts
const patchSchema = z.object({
  status: z.enum(["requested", "reviewing", "approved", "return_in_transit", "received", "replacement_sent", "refunded", "resolved", "rejected"]).optional(),
  responsibility: z.enum(["customer", "boxsofa", "carrier", "supplier", "unknown"]).nullable().optional(),
  refundAmountEur: z.number().nonnegative().nullable().optional(),
  internalNote: z.string().max(4000).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional()
}).refine((value) => Object.keys(value).length > 0, "At least one change is required.");
```

Before update, load the current row and write `before_data` and `after_data` through the existing admin audit helper.

- [ ] **Step 5: Add anonymous-access audit checks**

```js
  { method: 'GET', path: '/api/admin/after-sales' },
  { method: 'POST', path: '/api/admin/after-sales', body: {} },
  { method: 'PATCH', path: '/api/admin/after-sales/test-case-id', body: { status: 'reviewing' } },
```

- [ ] **Step 6: Run tests, build, and API audit**

Run: `npm.cmd test && npm.cmd run typecheck && npm.cmd run build && npm.cmd run api:auth-audit`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/admin/after-sales lib/data-center/after-sales.ts lib/data-center/after-sales.test.ts scripts/api-auth-audit.mjs
git commit -m "Add owner after-sales workflow"
```

---

### Task 7: Installable PWA Shell

**Files:**
- Modify: `package.json`
- Create: `app/manifest.ts`
- Create: `public/sw.js`
- Create: `components/data-center/PwaRegistrar.tsx`
- Create: `app/data-center/layout.tsx`
- Create: `app/data-center/page.tsx`
- Create: `components/data-center/DataCenterApp.tsx`
- Create: `app/data-center/data-center.css`
- Modify: `app/layout.tsx`
- Modify: `next.config.js`

**Interfaces:**
- Consumes: owner session and existing brand mark `/assets/brand/boxsofa-mark.png` (512 × 512).
- Produces: installable `/data-center` application shell with desktop sidebar and mobile bottom navigation.

- [ ] **Step 1: Add the icon dependency**

Run: `npm.cmd install lucide-react`

Expected: `package.json` and `package-lock.json` add `lucide-react`.

- [ ] **Step 2: Add the manifest**

```ts
// app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BoxSofa Data Center",
    short_name: "BoxSofa Data",
    description: "BoxSofa owner operations and analytics center",
    start_url: "/data-center",
    scope: "/",
    display: "standalone",
    background_color: "#f4f6f5",
    theme_color: "#173f35",
    icons: [
      { src: "/assets/brand/boxsofa-mark.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
    ]
  };
}
```

- [ ] **Step 3: Add the minimal service worker and registrar**

```js
// public/sw.js
const VERSION = "boxsofa-data-center-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request, { cache: "no-store" }));
});
```

```tsx
// components/data-center/PwaRegistrar.tsx
"use client";
import { useEffect } from "react";

export function PwaRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
  }, []);
  return null;
}
```

- [ ] **Step 4: Add the route layout and page**

```tsx
// app/data-center/layout.tsx
import type { Metadata } from "next";
import "./data-center.css";

export const metadata: Metadata = {
  title: "数据中心",
  robots: { index: false, follow: false }
};

export default function DataCenterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

```tsx
// app/data-center/page.tsx
import { DataCenterApp } from "@/components/data-center/DataCenterApp";
import { PwaRegistrar } from "@/components/data-center/PwaRegistrar";

export default function DataCenterPage() {
  return <><PwaRegistrar /><DataCenterApp /></>;
}
```

- [ ] **Step 5: Add a functional shell**

`DataCenterApp.tsx` must use Lucide icons and define these sections:

```ts
type DataCenterSection = "overview" | "orders" | "products" | "inventory" | "customers" | "traffic" | "social" | "marketing" | "after-sales" | "reviews" | "finance" | "cube" | "system";
```

Initial behavior:

- default to `overview`;
- render desktop sidebar at `min-width: 900px`;
- render mobile bottom tabs for Overview, Orders, After-sales, Data, More;
- link existing working modules to `/admin/orders`, `/admin/products`, `/admin/customers`, `/admin/stock`, `/admin/reviews`, and `/admin/support`;
- keep planned modules disabled with visible `Planned` text rather than sample data;
- show a login-required screen with a link to `/login` when overview returns 401.

- [ ] **Step 6: Add private headers and manifest metadata**

In `app/layout.tsx`, add:

```ts
manifest: "/manifest.webmanifest",
```

to the root metadata.

In `next.config.js`, add:

```js
{
  source: "/data-center/:path*",
  headers: privateHeaders
},
{
  source: "/data-center",
  headers: privateHeaders
}
```

- [ ] **Step 7: Add stable responsive CSS**

`app/data-center/data-center.css` must define:

- `--dc-brand: #173f35`;
- desktop grid tracks `220px minmax(0, 1fr)`;
- cards with radius no greater than `6px`;
- no nested decorative cards;
- `min-width: 0` on content tracks;
- fixed 64 px mobile bottom navigation;
- visible focus outlines;
- reduced-motion support;
- no horizontal overflow at 390 px.

- [ ] **Step 8: Build and verify manifest**

Run: `npm.cmd run typecheck && npm.cmd run build`

Expected: PASS and generated routes include `/data-center` and `/manifest.webmanifest`.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json app/manifest.ts public/sw.js components/data-center app/data-center app/layout.tsx next.config.js
git commit -m "Add installable BoxSofa data center shell"
```

---

### Task 8: Real Operations Cockpit

**Files:**
- Create: `components/data-center/OverviewSection.tsx`
- Create: `components/data-center/DataFreshness.tsx`
- Modify: `components/data-center/DataCenterApp.tsx`
- Modify: `app/data-center/data-center.css`

**Interfaces:**
- Consumes: `GET /api/admin/data-center/overview?range=today|7d|30d`.
- Produces: desktop and mobile cockpit with no demo fallback.

- [ ] **Step 1: Define the client response type**

In `lib/data-center/types.ts`, add:

```ts
export type DataCenterOverview = {
  range: "today" | "7d" | "30d";
  metrics: {
    gmvEur: number;
    netSalesEur: number;
    paidOrders: number;
    averageOrderValueEur: number;
    conversionRate: number | null;
  };
  visitors: number;
  openAfterSales: number;
  alerts: DashboardAlert[];
  freshness: DataFreshness[];
};
```

- [ ] **Step 2: Implement the freshness component**

```tsx
// components/data-center/DataFreshness.tsx
import { CircleAlert, CircleCheck, Clock3, Unplug } from "lucide-react";
import type { DataFreshness as Freshness } from "@/lib/data-center/types";

export function DataFreshness({ item }: { item: Freshness }) {
  const Icon = item.state === "current" ? CircleCheck : item.state === "disconnected" ? Unplug : item.state === "failed" ? CircleAlert : Clock3;
  return (
    <span className={`dc-freshness ${item.state}`} title={item.message || item.state}>
      <Icon aria-hidden size={14} />
      {item.label}
      <time>{item.lastSuccessAt ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" }).format(new Date(item.lastSuccessAt)) : "尚未同步"}</time>
    </span>
  );
}
```

- [ ] **Step 3: Implement the overview with loading, error, empty, and ready states**

`OverviewSection.tsx` must:

- request `today`, `7d`, or `30d`;
- use a segmented control for range;
- show loading placeholders without layout shift;
- show a retry button for HTTP/server failure;
- show `—` when conversion is unavailable;
- render GMV, net sales, paid orders, visitors, conversion, and open after-sales;
- render alerts ordered critical, warning, info;
- render source freshness;
- never construct fallback sample numbers.

Currency formatter:

```ts
const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "EUR" });
```

- [ ] **Step 4: Wire overview into the shell**

Render `<OverviewSection />` only for `section === "overview"`. Preserve selection across reload with `?section=overview` or a stable pathname/hash; do not store sensitive data in local storage.

- [ ] **Step 5: Verify responsive states**

Start local production:

```powershell
npm.cmd run build
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm.cmd run start -- -p 3002" -WorkingDirectory $PWD -WindowStyle Hidden
```

Verify in the chosen browser:

- desktop 1280 × 720: sidebar, KPIs, alerts, freshness;
- mobile 390 × 844: no horizontal overflow, bottom navigation visible, KPI cards readable;
- anonymous state: login CTA and no private numbers.

- [ ] **Step 6: Commit**

```bash
git add lib/data-center/types.ts components/data-center/OverviewSection.tsx components/data-center/DataFreshness.tsx components/data-center/DataCenterApp.tsx app/data-center/data-center.css
git commit -m "Build real operations cockpit"
```

---

### Task 9: After-Sales Application Section

**Files:**
- Create: `components/data-center/AfterSalesSection.tsx`
- Modify: `components/data-center/DataCenterApp.tsx`
- Modify: `app/data-center/data-center.css`

**Interfaces:**
- Consumes: after-sales GET/POST/PATCH APIs from Task 6.
- Produces: searchable case list and create/update flow with confirmations.

- [ ] **Step 1: Implement bounded loading and filters**

`AfterSalesSection.tsx` must load at most 200 cases and provide:

- status filter;
- type filter;
- order/customer search;
- overdue indicator using `Europe/Madrid`;
- distinct empty, loading, error, and ready states.

- [ ] **Step 2: Implement case creation**

The create form fields are:

- order number;
- case type;
- reason;
- requested remedy;
- due date.

Before POST, show a summary confirmation dialog. On success, prepend the returned case and close the form. On 409 invalid order, keep entered data and show the server message.

- [ ] **Step 3: Implement case updates**

Allow status, responsibility, due date, refund amount, and internal note updates. Refund amount entry is bookkeeping only in Phase 1; label it `记录退款金额` and do not call Stripe.

Require confirmation for transitions to `refunded`, `resolved`, or `rejected`.

- [ ] **Step 4: Verify desktop and mobile workflows**

Verify:

- create form fits 390 px without horizontal overflow;
- status change is keyboard accessible;
- canceling confirmation creates no API call;
- failed save preserves the draft;
- overview open-after-sales count changes after refresh.

- [ ] **Step 5: Commit**

```bash
git add components/data-center/AfterSalesSection.tsx components/data-center/DataCenterApp.tsx app/data-center/data-center.css
git commit -m "Add after-sales management section"
```

---

### Task 10: Universal Owner Search

**Files:**
- Create: `app/api/admin/data-center/search/route.ts`
- Create: `components/data-center/UniversalSearch.tsx`
- Modify: `components/data-center/DataCenterApp.tsx`
- Modify: `scripts/api-auth-audit.mjs`

**Interfaces:**
- Consumes: owner query `q` with 2-100 characters.
- Produces: up to 8 results per entity type for orders, customers, products, and after-sales.

- [ ] **Step 1: Add anonymous-access audit**

```js
  { method: 'GET', path: '/api/admin/data-center/search?q=test' },
```

- [ ] **Step 2: Implement bounded parallel search**

The route must:

- require owner access;
- reject query shorter than 2 characters;
- escape `%`, `_`, and `,` before Supabase `.or(...)`;
- query no more than 8 rows from each table;
- return only display-safe fields;
- never return addresses, payment payloads, tokens, or customer message bodies.

Response:

```ts
type SearchResponse = {
  ok: true;
  results: Array<{
    id: string;
    kind: "order" | "customer" | "product" | "after-sales";
    title: string;
    subtitle: string;
    href: string;
  }>;
};
```

- [ ] **Step 3: Implement the search UI**

`UniversalSearch.tsx` must:

- use a Search icon and a labeled input;
- debounce 250 ms;
- cancel stale requests with `AbortController`;
- support ArrowUp, ArrowDown, Enter, and Escape;
- group results by kind;
- show no-results and error states;
- clear results after navigation.

- [ ] **Step 4: Run full validation**

Run: `npm.cmd run typecheck && npm.cmd run build && npm.cmd run api:auth-audit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/data-center/search/route.ts components/data-center/UniversalSearch.tsx components/data-center/DataCenterApp.tsx scripts/api-auth-audit.mjs
git commit -m "Add owner universal search"
```

---

### Task 11: Smoke, Installation, and Production Verification

**Files:**
- Modify: `scripts/prelaunch-smoke.mjs`
- Modify: `scripts/production-verify.mjs`
- Modify: `docs/PROJECT-CONTEXT-COMPACT.md`
- Create: `docs/audits/2026-07-23-data-center-phase-1/README.md`

**Interfaces:**
- Consumes: complete Phase 1 application.
- Produces: reproducible release evidence and documented limitations.

- [ ] **Step 1: Add route checks**

Add `/data-center` to private smoke routes. Add `/manifest.webmanifest` and `/sw.js` to public asset checks. Keep `/api/admin/data-center/overview`, `/api/admin/data-center/search`, and after-sales endpoints in the API auth audit.

- [ ] **Step 2: Run the complete local gate**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
$env:EXPECT_PAYMENT_ENABLED='true'
$env:SMOKE_BASE_URL='http://localhost:3002'
npm.cmd run smoke
npm.cmd run seo:audit
npm.cmd run api:auth-audit
```

Expected: all commands PASS. SEO routes remain unchanged; private Data Center routes are not indexed.

- [ ] **Step 3: Verify installation behavior**

In the chosen browser:

- open `/data-center`;
- confirm installability and standalone launch;
- confirm app name `BoxSofa Data Center`;
- confirm 512 × 512 brand icon;
- confirm standalone window starts at `/data-center`;
- confirm the app can be removed through Windows installed-app controls.

Record exact browser/Windows versions in the audit.

- [ ] **Step 4: Verify real data and privacy**

With the owner signed in:

- compare paid-order count and GMV against the existing order data for one bounded date range;
- verify visitor data comes from `analytics_events`;
- verify conversion shows `—` when visitor coverage is zero;
- verify every freshness state has a source and timestamp;
- verify disconnected future social sources show no numeric values;
- verify anonymous requests return 401;
- create and update a non-refund after-sales test case, then remove it through a controlled database cleanup recorded in the audit;
- do not send customer mail or execute a Stripe refund.

- [ ] **Step 5: Write the audit**

`docs/audits/2026-07-23-data-center-phase-1/README.md` must include:

1. commit SHA;
2. migration application result;
3. automated command results;
4. desktop and mobile viewport results;
5. install/uninstall result;
6. GMV reconciliation method and sampled range;
7. analytics consent and coverage result;
8. owner API access result;
9. known disconnected integrations;
10. explicit statement that no real refund/message/publish occurred.

- [ ] **Step 6: Update project context**

Append a dated section to `docs/PROJECT-CONTEXT-COMPACT.md` describing:

- the Data Center URL and installation mode;
- owner-only scope;
- canonical GMV/net-sales definitions;
- server-side analytics source of truth;
- after-sales foundation;
- deferred social/procurement/Data Cube plans;
- audit path.

- [ ] **Step 7: Commit**

```bash
git add scripts/prelaunch-smoke.mjs scripts/production-verify.mjs docs/PROJECT-CONTEXT-COMPACT.md docs/audits/2026-07-23-data-center-phase-1/README.md
git commit -m "Verify BoxSofa data center phase one"
```

- [ ] **Step 8: Push and verify production**

Run:

```powershell
git push origin main
$env:EXPECT_PAYMENT_ENABLED='true'
npm.cmd run production:verify
```

Expected:

- Vercel deployment reaches `READY`;
- `https://boxsofa.eu` and `https://www.boxsofa.eu` pass smoke, SEO, API auth, and readiness;
- `/data-center` loads the owner application;
- anonymous owner APIs remain protected;
- no storefront regression appears.
