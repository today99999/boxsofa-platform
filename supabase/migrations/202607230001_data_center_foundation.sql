-- Foundation contracts: event_key text not null; session_id text not null.
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
