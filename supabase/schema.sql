create extension if not exists "pgcrypto";

do $$ begin
  create type public.app_role as enum ('customer', 'service', 'owner');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_category as enum ('single', 'double', 'triple', 'combo');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.order_status as enum (
    'pending_confirm',
    'paid_confirmed',
    'processing',
    'shipped',
    'completed',
    'cancelled',
    'refunded'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_status as enum ('not_started', 'pending', 'confirmed_offline', 'paid', 'failed', 'refunded');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.shipment_status as enum ('not_shipped', 'booked', 'shipped', 'delivered', 'exception');
exception when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  role public.app_role not null default 'customer',
  preferred_locale text not null default 'en' check (preferred_locale in ('zh', 'en', 'es', 'fr', 'de')),
  total_paid_eur numeric(12, 2) not null default 0 check (total_paid_eur >= 0),
  is_member boolean not null default false,
  member_since timestamptz,
  marketing_consent boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_styles (
  id uuid primary key default gen_random_uuid(),
  style_key text not null unique,
  name_zh text not null,
  name_en text not null,
  name_es text,
  name_fr text,
  name_de text,
  description_zh text,
  description_en text,
  description_es text,
  description_fr text,
  description_de text,
  seo_title text,
  seo_description text,
  primary_category public.product_category,
  entry_product_id uuid,
  detail_image_url text,
  video_url text,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  style_id uuid not null references public.product_styles(id) on delete cascade,
  sku text not null unique,
  slug text not null unique,
  name_zh text not null,
  name_en text not null,
  name_es text,
  name_fr text,
  name_de text,
  category public.product_category not null,
  seat_type text not null,
  color_zh text not null,
  color_en text,
  color_es text,
  color_fr text,
  color_de text,
  color_group_key text,
  cost_cny numeric(12, 2) check (cost_cny >= 0),
  price_eur numeric(12, 2) not null check (price_eur >= 0),
  compare_at_price_eur numeric(12, 2) check (compare_at_price_eur >= 0),
  stock integer not null default 0 check (stock >= 0),
  reserved_stock integer not null default 0 check (reserved_stock >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  dimensions text,
  package_dimensions text,
  package_count integer not null default 1 check (package_count > 0),
  weight_kg numeric(8, 2) check (weight_kg >= 0),
  material text,
  packaging_method text,
  rebound_time text,
  main_image_url text,
  is_entry_product boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_styles_entry_product_fk'
  ) then
    alter table public.product_styles
      add constraint product_styles_entry_product_fk
      foreign key (entry_product_id) references public.products(id) on delete set null;
  end if;
end $$;

create table if not exists public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  style_id uuid references public.product_styles(id) on delete cascade,
  media_type text not null check (media_type in ('main_image', 'gallery_image', 'detail_image', 'video')),
  url text not null,
  alt_text text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint product_or_style_media check (product_id is not null or style_id is not null)
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  movement_type text not null check (movement_type in ('initial', 'manual_adjust', 'order_reserved', 'order_released', 'payment_confirmed', 'order_cancelled', 'shipped', 'return')),
  quantity_delta integer not null,
  stock_after integer,
  reason text,
  order_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  country_code text not null default 'ES',
  recipient text not null,
  phone text not null,
  line1 text not null,
  line2 text,
  city text not null,
  province text,
  postal_code text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references public.profiles(id) on delete set null,
  customer_email text not null,
  customer_name text not null,
  customer_phone text not null,
  status public.order_status not null default 'pending_confirm',
  payment_status public.payment_status not null default 'not_started',
  subtotal_eur numeric(12, 2) not null check (subtotal_eur >= 0),
  discount_eur numeric(12, 2) not null default 0 check (discount_eur >= 0),
  shipping_eur numeric(12, 2) not null default 0 check (shipping_eur >= 0),
  total_eur numeric(12, 2) not null check (total_eur >= 0),
  member_discount_applied boolean not null default false,
  payment_provider text,
  payment_reference text,
  payment_method_note text,
  paid_at timestamptz,
  paid_confirmed_by uuid references public.profiles(id),
  recipient text not null,
  phone text not null,
  address_snapshot jsonb not null,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  order_lookup_token text not null default encode(gen_random_bytes(18), 'hex'),
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  style_id uuid references public.product_styles(id) on delete set null,
  sku text not null,
  slug text,
  name_snapshot text not null,
  color_snapshot text,
  image_snapshot text,
  quantity integer not null check (quantity > 0),
  unit_price_eur numeric(12, 2) not null check (unit_price_eur >= 0),
  line_total_eur numeric(12, 2) not null check (line_total_eur >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'offline',
  provider_payment_id text,
  status public.payment_status not null default 'pending',
  amount_eur numeric(12, 2) not null check (amount_eur >= 0),
  currency text not null default 'EUR',
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.shipment_status not null default 'not_shipped',
  carrier text,
  tracking_number text,
  tracking_url text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  estimated_days text not null default '23-30 days',
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  style_id uuid not null references public.product_styles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  customer_id uuid references public.profiles(id) on delete set null,
  customer_name text not null,
  rating integer not null check (rating between 1 and 5),
  body text not null,
  locale text not null default 'en' check (locale in ('zh', 'en', 'es', 'fr', 'de')),
  is_pinned boolean not null default false,
  is_visible boolean not null default true,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.analytics_consents (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null,
  consent text not null check (consent in ('necessary', 'analytics')),
  locale text,
  consent_version text not null default '2026-07-11',
  created_at timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('page_view', 'product_view', 'add_to_cart', 'begin_checkout', 'order_submit')),
  created_at timestamptz not null default now(),
  visitor_id text not null,
  customer_id uuid references public.profiles(id) on delete set null,
  path text not null,
  source text not null default 'direct',
  medium text,
  campaign text,
  referrer_domain text,
  product_id uuid references public.products(id) on delete set null,
  product_style_id uuid references public.product_styles(id) on delete set null,
  product_name text,
  value_eur numeric(12, 2),
  consent_id uuid references public.analytics_consents(id) on delete set null
);

create table if not exists public.newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  locale text not null default 'en' check (locale in ('zh', 'en', 'es', 'fr', 'de')),
  consent_checked boolean not null default false,
  source text,
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles(id) on delete set null,
  customer_name text,
  customer_email text,
  customer_access_token_hash text,
  status text not null default 'open' check (status in ('open', 'closed')),
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer', 'owner', 'service', 'system')),
  sender_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.chat_threads
add column if not exists customer_access_token_hash text;

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


create table if not exists public.email_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  order_number text not null,
  customer_email text not null,
  event text not null check (event in ('order_submitted', 'payment_confirmed', 'order_shipped', 'order_cancelled')),
  subject text not null,
  preview_text text not null,
  body_text text not null,
  provider text not null default 'pending',
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_style_id on public.products(style_id);
create index if not exists idx_products_slug on public.products(slug);
create index if not exists idx_products_active_entry on public.products(is_active, is_entry_product);
create index if not exists idx_product_media_product_sort on public.product_media(product_id, sort_order);
create index if not exists idx_product_media_style_sort on public.product_media(style_id, sort_order);
create index if not exists idx_product_media_product_id on public.product_media(product_id);
create index if not exists idx_product_media_style_id on public.product_media(style_id);
create index if not exists idx_orders_customer_created on public.orders(customer_id, created_at desc);
create index if not exists idx_orders_status_created on public.orders(status, created_at desc);
create index if not exists idx_orders_customer_id on public.orders(customer_id);
create index if not exists idx_orders_paid_confirmed_by on public.orders(paid_confirmed_by);
create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_order_items_product_id on public.order_items(product_id);
create index if not exists idx_order_items_style_id on public.order_items(style_id);
create unique index if not exists idx_shipments_order_id_unique on public.shipments(order_id);
create index if not exists idx_shipments_created_by on public.shipments(created_by);
create index if not exists idx_reviews_style_visible on public.product_reviews(style_id, is_visible, is_pinned, created_at desc);
create index if not exists idx_product_reviews_customer_id on public.product_reviews(customer_id);
create index if not exists idx_product_reviews_order_id on public.product_reviews(order_id);
create index if not exists idx_product_reviews_product_id on public.product_reviews(product_id);
create index if not exists idx_product_reviews_style_id on public.product_reviews(style_id);
create index if not exists idx_analytics_created_source on public.analytics_events(created_at desc, source);
create index if not exists idx_analytics_product_style on public.analytics_events(product_style_id, created_at desc);
create index if not exists idx_analytics_events_consent_id on public.analytics_events(consent_id);
create index if not exists idx_analytics_events_customer_id on public.analytics_events(customer_id);
create index if not exists idx_analytics_events_product_id on public.analytics_events(product_id);
create index if not exists idx_analytics_events_product_style_id on public.analytics_events(product_style_id);
create unique index if not exists idx_analytics_events_event_key on public.analytics_events(event_key);
create index if not exists idx_after_sales_status_due on public.after_sales_cases(status, due_at);
create index if not exists idx_after_sales_order on public.after_sales_cases(order_id, created_at desc);
create index if not exists idx_chat_threads_access_token on public.chat_threads(customer_access_token_hash);
create index if not exists idx_chat_threads_assigned_to on public.chat_threads(assigned_to);
create index if not exists idx_chat_threads_customer_id on public.chat_threads(customer_id);
create index if not exists idx_chat_messages_thread_created on public.chat_messages(thread_id, created_at);
create index if not exists idx_chat_messages_sender_id on public.chat_messages(sender_id);
create index if not exists idx_chat_messages_thread_id on public.chat_messages(thread_id);
create index if not exists idx_email_notifications_order_created on public.email_notifications(order_id, created_at desc);
create index if not exists idx_email_notifications_status_created on public.email_notifications(status, created_at desc);
create index if not exists idx_email_notifications_order_id on public.email_notifications(order_id);
create index if not exists idx_addresses_customer_id on public.addresses(customer_id);
create index if not exists idx_admin_audit_log_actor_id on public.admin_audit_log(actor_id);
create index if not exists idx_inventory_movements_created_by on public.inventory_movements(created_by);
create index if not exists idx_inventory_movements_product_id on public.inventory_movements(product_id);
create index if not exists idx_payments_confirmed_by on public.payments(confirmed_by);
create index if not exists idx_payments_order_id on public.payments(order_id);
create index if not exists idx_product_styles_entry_product_id on public.product_styles(entry_product_id);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_product_styles_updated_at on public.product_styles;
create trigger set_product_styles_updated_at before update on public.product_styles
for each row execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists set_addresses_updated_at on public.addresses;
create trigger set_addresses_updated_at before update on public.addresses
for each row execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at before update on public.payments
for each row execute function public.set_updated_at();

drop trigger if exists set_shipments_updated_at on public.shipments;
create trigger set_shipments_updated_at before update on public.shipments
for each row execute function public.set_updated_at();

drop trigger if exists set_product_reviews_updated_at on public.product_reviews;
create trigger set_product_reviews_updated_at before update on public.product_reviews
for each row execute function public.set_updated_at();

drop trigger if exists set_chat_threads_updated_at on public.chat_threads;
create trigger set_chat_threads_updated_at before update on public.chat_threads
for each row execute function public.set_updated_at();

drop trigger if exists set_email_notifications_updated_at on public.email_notifications;
create trigger set_email_notifications_updated_at before update on public.email_notifications
for each row execute function public.set_updated_at();

drop trigger if exists set_after_sales_cases_updated_at on public.after_sales_cases;
create trigger set_after_sales_cases_updated_at before update on public.after_sales_cases
for each row execute function public.set_updated_at();

drop trigger if exists set_payment_refunds_updated_at on public.payment_refunds;
create trigger set_payment_refunds_updated_at before update on public.payment_refunds
for each row execute function public.set_updated_at();

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('owner', 'service')
  );
$$;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'owner'
  );
$$;

revoke all on function private.is_admin() from public;
revoke all on function private.is_owner() from public;
grant execute on function private.is_admin() to anon, authenticated, service_role;
grant execute on function private.is_owner() to anon, authenticated, service_role;

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select private.is_admin();
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select private.is_owner();
$$;

create or replace function public.refresh_customer_membership(customer uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  paid_total numeric(12, 2);
begin
  if customer is null then
    return;
  end if;

  select coalesce(sum(total_eur), 0)
    into paid_total
  from public.orders
  where customer_id = customer
    and status in ('paid_confirmed', 'processing', 'shipped', 'completed');

  update public.profiles
  set total_paid_eur = paid_total,
      is_member = paid_total >= 300,
      member_since = case
        when paid_total >= 300 and member_since is null then now()
        when paid_total < 300 then null
        else member_since
      end
  where id = customer;
end;
$$;

create or replace function public.refresh_membership_after_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_customer_membership(old.customer_id);
    return old;
  end if;

  perform public.refresh_customer_membership(new.customer_id);
  return new;
end;
$$;

drop trigger if exists refresh_membership_after_order_change on public.orders;
create trigger refresh_membership_after_order_change
after insert or update of status, total_eur, customer_id or delete on public.orders
for each row execute function public.refresh_membership_after_order();

revoke execute on function public.refresh_customer_membership(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_membership_after_order() from public, anon, authenticated;
grant execute on function public.refresh_customer_membership(uuid) to service_role;
grant execute on function public.refresh_membership_after_order() to service_role;

alter table public.profiles enable row level security;
alter table public.product_styles enable row level security;
alter table public.products enable row level security;
alter table public.product_media enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.shipments enable row level security;
alter table public.product_reviews enable row level security;
alter table public.analytics_consents enable row level security;
alter table public.analytics_events enable row level security;
alter table public.data_source_health enable row level security;
alter table public.dashboard_alerts enable row level security;
alter table public.after_sales_cases enable row level security;
alter table public.payment_refunds enable row level security;
alter table public.newsletter_subscriptions enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.email_notifications enable row level security;
alter table public.admin_audit_log enable row level security;

drop policy if exists "public can read active styles" on public.product_styles;
drop policy if exists "product styles readable when active or admin" on public.product_styles;
create policy "product styles readable when active or admin"
on public.product_styles for select
using (is_active = true or (select public.is_admin()));

drop policy if exists "public can read active products" on public.products;
drop policy if exists "products readable when active or admin" on public.products;
create policy "products readable when active or admin"
on public.products for select
using (is_active = true or (select public.is_admin()));

drop policy if exists "public can read active media" on public.product_media;
drop policy if exists "product media readable when active or owner" on public.product_media;
create policy "product media readable when active or owner"
on public.product_media for select
using (is_active = true or (select public.is_owner()));

drop policy if exists "owners manage catalog styles" on public.product_styles;
drop policy if exists "owners insert product styles" on public.product_styles;
create policy "owners insert product styles"
on public.product_styles for insert
with check ((select public.is_owner()));
drop policy if exists "owners update product styles" on public.product_styles;
create policy "owners update product styles"
on public.product_styles for update
using ((select public.is_owner()))
with check ((select public.is_owner()));
drop policy if exists "owners delete product styles" on public.product_styles;
create policy "owners delete product styles"
on public.product_styles for delete
using ((select public.is_owner()));

drop policy if exists "owners manage catalog products" on public.products;
drop policy if exists "owners insert products" on public.products;
create policy "owners insert products"
on public.products for insert
with check ((select public.is_owner()));
drop policy if exists "owners update products" on public.products;
create policy "owners update products"
on public.products for update
using ((select public.is_owner()))
with check ((select public.is_owner()));
drop policy if exists "owners delete products" on public.products;
create policy "owners delete products"
on public.products for delete
using ((select public.is_owner()));

drop policy if exists "owners manage catalog media" on public.product_media;
drop policy if exists "owners insert product media" on public.product_media;
create policy "owners insert product media"
on public.product_media for insert
with check ((select public.is_owner()));
drop policy if exists "owners update product media" on public.product_media;
create policy "owners update product media"
on public.product_media for update
using ((select public.is_owner()))
with check ((select public.is_owner()));
drop policy if exists "owners delete product media" on public.product_media;
create policy "owners delete product media"
on public.product_media for delete
using ((select public.is_owner()));

drop policy if exists "admins read inventory movements" on public.inventory_movements;
drop policy if exists "inventory movements readable by admin or owner" on public.inventory_movements;
create policy "inventory movements readable by admin or owner"
on public.inventory_movements for select
using ((select public.is_admin()) or (select public.is_owner()));

drop policy if exists "owners manage inventory movements" on public.inventory_movements;
drop policy if exists "owners insert inventory movements" on public.inventory_movements;
create policy "owners insert inventory movements"
on public.inventory_movements for insert
with check ((select public.is_owner()));
drop policy if exists "owners update inventory movements" on public.inventory_movements;
create policy "owners update inventory movements"
on public.inventory_movements for update
using ((select public.is_owner()))
with check ((select public.is_owner()));
drop policy if exists "owners delete inventory movements" on public.inventory_movements;
create policy "owners delete inventory movements"
on public.inventory_movements for delete
using ((select public.is_owner()));

drop policy if exists "users read own profile" on public.profiles;
drop policy if exists "profiles readable by owner admin or self" on public.profiles;
create policy "profiles readable by owner admin or self"
on public.profiles for select
using (id = (select auth.uid()) or (select public.is_admin()) or (select public.is_owner()));

drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "profiles updatable by owner or self" on public.profiles;
create policy "profiles updatable by owner or self"
on public.profiles for update
using (id = (select auth.uid()) or (select public.is_owner()))
with check (id = (select auth.uid()) or (select public.is_owner()));

drop policy if exists "owners manage profiles" on public.profiles;
drop policy if exists "profiles insertable by owner" on public.profiles;
create policy "profiles insertable by owner"
on public.profiles for insert
with check ((select public.is_owner()));
drop policy if exists "profiles deletable by owner" on public.profiles;
create policy "profiles deletable by owner"
on public.profiles for delete
using ((select public.is_owner()));

drop policy if exists "users manage own addresses" on public.addresses;
create policy "users manage own addresses"
on public.addresses for all
using (customer_id = (select auth.uid()) or (select public.is_admin()))
with check (customer_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "admins read orders" on public.orders;
drop policy if exists "customers read own orders" on public.orders;
drop policy if exists "orders readable by admin or customer" on public.orders;
create policy "orders readable by admin or customer"
on public.orders for select
using ((select public.is_admin()) or customer_id = (select auth.uid()));

drop policy if exists "admins update orders" on public.orders;
create policy "admins update orders"
on public.orders for update
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "admins read order items" on public.order_items;
create policy "admins read order items"
on public.order_items for select
using (
  (select public.is_admin())
  or exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and orders.customer_id = (select auth.uid())
  )
);

drop policy if exists "admins manage payments" on public.payments;
create policy "admins manage payments"
on public.payments for all
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "admins manage shipments" on public.shipments;
drop policy if exists "customers read own shipments" on public.shipments;
drop policy if exists "shipments readable by admin or customer" on public.shipments;
create policy "shipments readable by admin or customer"
on public.shipments for select
using (
  (select public.is_admin())
  or
  exists (
    select 1
    from public.orders
    where orders.id = shipments.order_id
      and orders.customer_id = (select auth.uid())
  )
);
drop policy if exists "admins insert shipments" on public.shipments;
create policy "admins insert shipments"
on public.shipments for insert
with check ((select public.is_admin()));
drop policy if exists "admins update shipments" on public.shipments;
create policy "admins update shipments"
on public.shipments for update
using ((select public.is_admin()))
with check ((select public.is_admin()));
drop policy if exists "admins delete shipments" on public.shipments;
create policy "admins delete shipments"
on public.shipments for delete
using ((select public.is_admin()));

drop policy if exists "public read visible reviews" on public.product_reviews;
drop policy if exists "reviews readable when visible or admin" on public.product_reviews;
create policy "reviews readable when visible or admin"
on public.product_reviews for select
using ((is_visible = true and deleted_at is null) or (select public.is_admin()));

drop policy if exists "admins manage reviews" on public.product_reviews;
drop policy if exists "customers create own reviews" on public.product_reviews;
drop policy if exists "reviews insertable by customer or admin" on public.product_reviews;
create policy "reviews insertable by customer or admin"
on public.product_reviews for insert
with check (customer_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "admins update reviews" on public.product_reviews;
create policy "admins update reviews"
on public.product_reviews for update
using ((select public.is_admin()))
with check ((select public.is_admin()));
drop policy if exists "admins delete reviews" on public.product_reviews;
create policy "admins delete reviews"
on public.product_reviews for delete
using ((select public.is_admin()));

drop policy if exists "admins read analytics consents" on public.analytics_consents;
create policy "admins read analytics consents"
on public.analytics_consents for select
using ((select public.is_admin()));

drop policy if exists "admins read analytics events" on public.analytics_events;
create policy "admins read analytics events"
on public.analytics_events for select
using ((select public.is_admin()));

drop policy if exists "admins manage source health" on public.data_source_health;
drop policy if exists "owners manage source health" on public.data_source_health;
create policy "owners manage source health" on public.data_source_health
for all using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "admins manage dashboard alerts" on public.dashboard_alerts;
drop policy if exists "owners manage dashboard alerts" on public.dashboard_alerts;
create policy "owners manage dashboard alerts" on public.dashboard_alerts
for all using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "admins manage after sales" on public.after_sales_cases;
drop policy if exists "owners manage after sales" on public.after_sales_cases;
create policy "owners manage after sales" on public.after_sales_cases
for all using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "admins manage payment refunds" on public.payment_refunds;
drop policy if exists "owners manage payment refunds" on public.payment_refunds;
create policy "owners manage payment refunds" on public.payment_refunds
for all using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "admins manage newsletter" on public.newsletter_subscriptions;
create policy "admins manage newsletter"
on public.newsletter_subscriptions for all
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "chat participants read threads" on public.chat_threads;
create policy "chat participants read threads"
on public.chat_threads for select
using ((select public.is_admin()) or customer_id = (select auth.uid()));

drop policy if exists "chat participants read messages" on public.chat_messages;
create policy "chat participants read messages"
on public.chat_messages for select
using (
  (select public.is_admin())
  or exists (
    select 1
    from public.chat_threads
    where chat_threads.id = chat_messages.thread_id
      and chat_threads.customer_id = (select auth.uid())
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_threads'
  ) then
    alter publication supabase_realtime add table public.chat_threads;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

drop policy if exists "admins read email notifications" on public.email_notifications;
drop policy if exists "admins manage email notifications" on public.email_notifications;
create policy "admins manage email notifications"
on public.email_notifications for all
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "admins read audit log" on public.admin_audit_log;
create policy "admins read audit log"
on public.admin_audit_log for select
using ((select public.is_owner()));

insert into public.data_source_health (source_key, source_type, state)
values
  ('orders', 'database', 'partial'),
  ('website_analytics', 'website', 'disconnected'),
  ('stripe', 'stripe', 'partial')
on conflict (source_key) do nothing;

-- Public inserts for orders, analytics, newsletter, chat, and reviews should be
-- performed through Next.js Route Handlers using the Supabase service role key.
-- This keeps customer addresses, payment notes, and visitor attribution private
-- while still allowing the storefront to work for guest buyers.

-- Atomic, consent-aware analytics ingestion and distributed rate limiting.
create sequence if not exists public.analytics_consents_revision_seq;

alter table public.analytics_consents add column if not exists revision bigint;
alter table public.analytics_consents
  alter column revision set default nextval('public.analytics_consents_revision_seq'::regclass);

update public.analytics_consents
set revision = nextval('public.analytics_consents_revision_seq'::regclass)
where revision is null;

select setval(
  'public.analytics_consents_revision_seq'::regclass,
  greatest(coalesce((select max(revision) from public.analytics_consents), 0), 1),
  true
);

alter table public.analytics_consents alter column revision set not null;
create unique index if not exists idx_analytics_consents_revision
  on public.analytics_consents(revision);
create index if not exists idx_analytics_consents_visitor_revision
  on public.analytics_consents(visitor_id, revision desc);

create table if not exists public.analytics_rate_limit_buckets (
  bucket_key text primary key check (bucket_key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.analytics_rate_limit_buckets enable row level security;
revoke all on table public.analytics_rate_limit_buckets from public, anon, authenticated;

create or replace function public.record_analytics_consent(
  p_visitor_id text,
  p_consent text,
  p_locale text,
  p_consent_version text
)
returns table(id uuid, consent text, revision bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_visitor_id is null or length(p_visitor_id) not between 8 and 120
    or p_consent not in ('necessary', 'analytics')
    or p_locale not in ('zh', 'en', 'es', 'fr', 'de')
    or p_consent_version is null or length(p_consent_version) not between 1 and 40
  then
    raise exception 'Invalid analytics consent input' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_visitor_id, 0));

  return query
  insert into public.analytics_consents (visitor_id, consent, locale, consent_version)
  values (p_visitor_id, p_consent, p_locale, p_consent_version)
  returning analytics_consents.id, analytics_consents.consent, analytics_consents.revision;
end;
$$;

create or replace function public.consume_analytics_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bucket public.analytics_rate_limit_buckets%rowtype;
  v_window interval;
  v_inserted boolean;
begin
  if p_bucket_key !~ '^[a-f0-9]{64}$' or p_limit < 1 or p_limit > 10000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid analytics rate limit input' using errcode = '22023';
  end if;

  v_window := make_interval(secs => p_window_seconds);
  insert into public.analytics_rate_limit_buckets (bucket_key, window_started_at, request_count)
  values (p_bucket_key, now(), 1)
  on conflict (bucket_key) do nothing
  returning true into v_inserted;

  if coalesce(v_inserted, false) then
    return query select true, 0;
    return;
  end if;

  select * into v_bucket
  from public.analytics_rate_limit_buckets
  where bucket_key = p_bucket_key
  for update;

  if v_bucket.window_started_at + v_window <= now() then
    update public.analytics_rate_limit_buckets
    set window_started_at = now(), request_count = 1, updated_at = now()
    where bucket_key = p_bucket_key;
    return query select true, 0;
    return;
  end if;

  if v_bucket.request_count >= p_limit then
    return query select false, greatest(1, ceil(extract(epoch from (v_bucket.window_started_at + v_window - now())))::integer);
    return;
  end if;

  update public.analytics_rate_limit_buckets
  set request_count = request_count + 1, updated_at = now()
  where bucket_key = p_bucket_key;
  return query select true, 0;
end;
$$;

create or replace function public.ingest_analytics_event(
  p_event_key text,
  p_event_type text,
  p_created_at timestamptz,
  p_visitor_id text,
  p_session_id text,
  p_path text,
  p_source text,
  p_medium text,
  p_campaign text,
  p_referrer_domain text,
  p_device_type text,
  p_product_id uuid,
  p_product_name text,
  p_value_eur numeric,
  p_raw_utm jsonb
)
returns table(accepted boolean, inserted boolean, consent_id uuid, reason text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_consent_id uuid;
  v_consent text;
  v_event_id uuid;
begin
  if p_event_key is null or length(p_event_key) not between 8 and 160
    or p_visitor_id is null or length(p_visitor_id) not between 8 and 120
    or p_session_id is null or length(p_session_id) not between 8 and 120
    or p_event_type not in ('page_view', 'product_view', 'add_to_cart', 'begin_checkout', 'order_submit')
    or p_path !~ '^/[^\\[:cntrl:]]*$' or p_path like '//%' or position('://' in p_path) > 0
    or p_created_at < now() - interval '7 days' or p_created_at > now() + interval '15 minutes'
    or p_source is null or length(p_source) > 80
    or (p_value_eur is not null and (p_value_eur < 0 or p_value_eur > 100000))
    or p_raw_utm is null or jsonb_typeof(p_raw_utm) <> 'object'
  then
    raise exception 'Invalid analytics event input' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_visitor_id, 0));

  select id, consent into v_consent_id, v_consent
  from public.analytics_consents
  where visitor_id = p_visitor_id
  order by revision desc
  limit 1
  for update;

  if not found or v_consent <> 'analytics' then
    return query select false, false, null::uuid, 'analytics_consent_required'::text;
    return;
  end if;

  insert into public.analytics_events (
    event_key,
    event_type,
    created_at,
    visitor_id,
    session_id,
    path,
    source,
    medium,
    campaign,
    referrer_domain,
    device_type,
    product_id,
    product_name,
    value_eur,
    raw_utm,
    consent_id
  ) values (
    p_event_key,
    p_event_type,
    p_created_at,
    p_visitor_id,
    p_session_id,
    p_path,
    p_source,
    p_medium,
    p_campaign,
    p_referrer_domain,
    p_device_type,
    p_product_id,
    p_product_name,
    p_value_eur,
    p_raw_utm,
    v_consent_id
  )
  on conflict (event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return query select true, false, v_consent_id, 'accepted'::text;
    return;
  end if;

  insert into public.data_source_health (
    source_key,
    source_type,
    state,
    last_attempt_at,
    last_success_at,
    last_error,
    record_count
  ) values (
    'website_analytics',
    'website',
    'current',
    now(),
    now(),
    null,
    1
  )
  on conflict (source_key) do update
  set state = 'current',
      last_attempt_at = excluded.last_attempt_at,
      last_success_at = excluded.last_success_at,
      last_error = null,
      record_count = public.data_source_health.record_count + 1,
      updated_at = now();

  return query select true, true, v_consent_id, 'accepted'::text;
end;
$$;

revoke all on function public.record_analytics_consent(text, text, text, text) from public, anon, authenticated;
revoke all on function public.consume_analytics_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.ingest_analytics_event(text, text, timestamptz, text, text, text, text, text, text, text, text, uuid, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.record_analytics_consent(text, text, text, text) to service_role;
grant execute on function public.consume_analytics_rate_limit(text, integer, integer) to service_role;
grant execute on function public.ingest_analytics_event(text, text, timestamptz, text, text, text, text, text, text, text, text, uuid, text, numeric, jsonb) to service_role;

-- Final analytics hardening state. This mirrors the additive production migration
-- after the legacy bootstrap statements above.
begin;
lock table public.analytics_consents in access exclusive mode;

do $$
declare
  v_offset bigint;
  v_max_revision bigint;
  v_has_rows boolean;
begin
  select coalesce(max(revision), 0) + count(*) + 1
  into v_offset
  from public.analytics_consents;

  update public.analytics_consents
  set revision = revision + v_offset;

  with ordered as (
    select id, row_number() over (order by visitor_id, created_at, id)::bigint as revision
    from public.analytics_consents
  )
  update public.analytics_consents consent_row
  set revision = ordered.revision
  from ordered
  where consent_row.id = ordered.id;

  select max(revision), count(*) > 0
  into v_max_revision, v_has_rows
  from public.analytics_consents;

  perform setval('public.analytics_consents_revision_seq'::regclass, coalesce(v_max_revision, 1), v_has_rows);
end;
$$;

drop policy if exists "admins read analytics consents" on public.analytics_consents;
drop policy if exists "owners read analytics consents" on public.analytics_consents;
create policy "owners read analytics consents"
on public.analytics_consents for select
using ((select public.is_owner()));

drop policy if exists "admins read analytics events" on public.analytics_events;
drop policy if exists "owners read analytics events" on public.analytics_events;
create policy "owners read analytics events"
on public.analytics_events for select
using ((select public.is_owner()));

alter table public.analytics_rate_limit_buckets add column if not exists expires_at timestamptz;
update public.analytics_rate_limit_buckets
set expires_at = greatest(window_started_at, updated_at) + interval '2 days'
where expires_at is null;
alter table public.analytics_rate_limit_buckets alter column expires_at set not null;
create index if not exists idx_analytics_rate_limit_buckets_expires_at
  on public.analytics_rate_limit_buckets(expires_at);

create or replace function public.cleanup_analytics_rate_limit_buckets(
  p_max_rows integer default 200
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  if p_max_rows < 1 or p_max_rows > 2000 then
    raise exception 'Invalid analytics rate limit cleanup limit' using errcode = '22023';
  end if;

  with candidates as (
    select ctid
    from public.analytics_rate_limit_buckets
    where expires_at <= now()
    order by expires_at
    for update skip locked
    limit p_max_rows
  ), deleted as (
    delete from public.analytics_rate_limit_buckets bucket
    using candidates
    where bucket.ctid = candidates.ctid
    returning 1
  )
  select count(*) into v_deleted from deleted;

  return v_deleted;
end;
$$;

create or replace function public.consume_analytics_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bucket public.analytics_rate_limit_buckets%rowtype;
  v_window interval;
  v_inserted boolean;
begin
  if p_bucket_key !~ '^[a-f0-9]{64}$' or p_limit < 1 or p_limit > 10000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid analytics rate limit input' using errcode = '22023';
  end if;

  if random() < 0.02 then
    begin
      perform public.cleanup_analytics_rate_limit_buckets(200);
    exception when others then
      null;
    end;
  end if;

  v_window := make_interval(secs => p_window_seconds);
  insert into public.analytics_rate_limit_buckets (bucket_key, window_started_at, request_count, expires_at)
  values (p_bucket_key, now(), 1, now() + interval '2 days')
  on conflict (bucket_key) do nothing
  returning true into v_inserted;

  if coalesce(v_inserted, false) then
    return query select true, 0;
    return;
  end if;

  select * into v_bucket
  from public.analytics_rate_limit_buckets
  where bucket_key = p_bucket_key
  for update;

  if v_bucket.window_started_at + v_window <= now() then
    update public.analytics_rate_limit_buckets
    set window_started_at = now(), request_count = 1, expires_at = now() + interval '2 days', updated_at = now()
    where bucket_key = p_bucket_key;
    return query select true, 0;
    return;
  end if;

  if v_bucket.request_count >= p_limit then
    return query select false, greatest(1, ceil(extract(epoch from (v_bucket.window_started_at + v_window - now())))::integer);
    return;
  end if;

  update public.analytics_rate_limit_buckets
  set request_count = request_count + 1, expires_at = now() + interval '2 days', updated_at = now()
  where bucket_key = p_bucket_key;
  return query select true, 0;
end;
$$;

revoke all on function public.cleanup_analytics_rate_limit_buckets(integer) from public, anon, authenticated;
revoke all on function public.consume_analytics_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.cleanup_analytics_rate_limit_buckets(integer) to service_role;
grant execute on function public.consume_analytics_rate_limit(text, integer, integer) to service_role;
commit;

-- Final database-ordered consent intent state. This mirrors migration 006.
begin;
create sequence if not exists public.analytics_consent_intent_revision_seq;
create table if not exists public.analytics_consent_intents (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null check (length(visitor_id) between 8 and 120),
  intent_revision bigint not null default nextval('public.analytics_consent_intent_revision_seq'::regclass),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  consumed_at timestamptz,
  consumed_result text check (consumed_result in ('accepted', 'stale')),
  check (expires_at > issued_at),
  check ((consumed_at is null and consumed_result is null) or (consumed_at is not null and consumed_result is not null))
);
alter table public.analytics_consent_intents enable row level security;
revoke all on table public.analytics_consent_intents from public, anon, authenticated;
create unique index if not exists idx_analytics_consent_intents_revision on public.analytics_consent_intents(intent_revision);
create index if not exists idx_analytics_consent_intents_visitor_expiry on public.analytics_consent_intents(visitor_id, expires_at desc);

lock table public.analytics_consents in access exclusive mode;
alter table public.analytics_consents add column if not exists intent_revision bigint;
with ordered as (
  select id, row_number() over (order by revision, created_at, id)::bigint as intent_revision
  from public.analytics_consents
)
update public.analytics_consents consent_row
set intent_revision = ordered.intent_revision
from ordered
where consent_row.id = ordered.id and consent_row.intent_revision is null;
alter table public.analytics_consents alter column intent_revision set not null;
create unique index if not exists idx_analytics_consents_intent_revision on public.analytics_consents(intent_revision);
create index if not exists idx_analytics_consents_visitor_intent_revision on public.analytics_consents(visitor_id, intent_revision desc);

do $$
declare v_max_revision bigint; v_has_rows boolean;
begin
  select greatest(coalesce((select max(intent_revision) from public.analytics_consents), 0), coalesce((select max(intent_revision) from public.analytics_consent_intents), 0)) into v_max_revision;
  v_has_rows := v_max_revision > 0;
  perform setval('public.analytics_consent_intent_revision_seq'::regclass, greatest(v_max_revision, 1), v_has_rows);
end;
$$;

create or replace function public.issue_analytics_consent_intent(p_visitor_id text)
returns table(intent_id uuid, intent_revision bigint, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_visitor_id is null or length(p_visitor_id) not between 8 and 120 then
    raise exception 'Invalid analytics consent intent input' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_visitor_id, 0));
  return query insert into public.analytics_consent_intents (visitor_id)
  values (p_visitor_id)
  returning analytics_consent_intents.id, analytics_consent_intents.intent_revision, analytics_consent_intents.expires_at;
end;
$$;

drop function if exists public.record_analytics_consent(text, text, text, text);
create or replace function public.record_analytics_consent(
  p_visitor_id text, p_consent text, p_locale text, p_consent_version text, p_intent_id uuid
)
returns table(accepted boolean, stale boolean, id uuid, consent text, revision bigint, intent_revision bigint)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_intent public.analytics_consent_intents%rowtype;
  v_current_id uuid; v_current_consent text; v_current_revision bigint; v_current_intent_revision bigint;
  v_inserted public.analytics_consents%rowtype;
begin
  if p_visitor_id is null or length(p_visitor_id) not between 8 and 120
    or p_consent not in ('necessary', 'analytics')
    or p_locale not in ('zh', 'en', 'es', 'fr', 'de')
    or p_consent_version is null or length(p_consent_version) not between 1 and 40
    or p_intent_id is null then
    raise exception 'Invalid analytics consent input' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_visitor_id, 0));
  select id, consent, revision, intent_revision into v_current_id, v_current_consent, v_current_revision, v_current_intent_revision
  from public.analytics_consents where visitor_id = p_visitor_id order by intent_revision desc limit 1 for update;
  select * into v_intent from public.analytics_consent_intents
  where id = p_intent_id and visitor_id = p_visitor_id for update;
  if not found then
    return query select false, true, v_current_id, v_current_consent, v_current_revision, v_current_intent_revision;
    return;
  end if;
  if v_intent.consumed_at is not null or v_intent.expires_at <= now()
    or v_intent.intent_revision <= coalesce(v_current_intent_revision, 0) then
    if v_intent.consumed_at is null then
      update public.analytics_consent_intents set consumed_at = now(), consumed_result = 'stale' where id = v_intent.id;
    end if;
    return query select false, true, v_current_id, v_current_consent, v_current_revision, v_current_intent_revision;
    return;
  end if;
  insert into public.analytics_consents (visitor_id, consent, locale, consent_version, intent_revision)
  values (p_visitor_id, p_consent, p_locale, p_consent_version, v_intent.intent_revision)
  returning * into v_inserted;
  update public.analytics_consent_intents set consumed_at = now(), consumed_result = 'accepted' where id = v_intent.id;
  return query select true, false, v_inserted.id, v_inserted.consent, v_inserted.revision, v_inserted.intent_revision;
end;
$$;

create or replace function public.ingest_analytics_event(
  p_event_key text, p_event_type text, p_created_at timestamptz, p_visitor_id text,
  p_session_id text, p_path text, p_source text, p_medium text, p_campaign text,
  p_referrer_domain text, p_device_type text, p_product_id uuid, p_product_name text,
  p_value_eur numeric, p_raw_utm jsonb
)
returns table(accepted boolean, inserted boolean, consent_id uuid, reason text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_consent_id uuid; v_consent text; v_event_id uuid;
begin
  if p_event_key is null or length(p_event_key) not between 8 and 160
    or p_visitor_id is null or length(p_visitor_id) not between 8 and 120
    or p_session_id is null or length(p_session_id) not between 8 and 120
    or p_event_type not in ('page_view', 'product_view', 'add_to_cart', 'begin_checkout', 'order_submit')
    or p_path !~ '^/[^\\[:cntrl:]]*$' or p_path like '//%' or position('://' in p_path) > 0
    or p_created_at < now() - interval '7 days' or p_created_at > now() + interval '15 minutes'
    or p_source is null or length(p_source) > 80
    or (p_value_eur is not null and (p_value_eur < 0 or p_value_eur > 100000))
    or p_raw_utm is null or jsonb_typeof(p_raw_utm) <> 'object' then
    raise exception 'Invalid analytics event input' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_visitor_id, 0));
  select id, consent into v_consent_id, v_consent from public.analytics_consents
  where visitor_id = p_visitor_id order by intent_revision desc limit 1 for update;
  if not found or v_consent <> 'analytics' then
    return query select false, false, null::uuid, 'analytics_consent_required'::text;
    return;
  end if;
  insert into public.analytics_events (
    event_key, event_type, created_at, visitor_id, session_id, path, source, medium, campaign,
    referrer_domain, device_type, product_id, product_name, value_eur, raw_utm, consent_id
  ) values (
    p_event_key, p_event_type, p_created_at, p_visitor_id, p_session_id, p_path, p_source, p_medium,
    p_campaign, p_referrer_domain, p_device_type, p_product_id, p_product_name, p_value_eur, p_raw_utm, v_consent_id
  ) on conflict (event_key) do nothing returning id into v_event_id;
  if v_event_id is null then
    return query select true, false, v_consent_id, 'accepted'::text;
    return;
  end if;
  insert into public.data_source_health (
    source_key, source_type, state, last_attempt_at, last_success_at, last_error, record_count
  ) values (
    'website_analytics', 'website', 'current', now(), now(), null, 1
  ) on conflict (source_key) do update
  set state = 'current', last_attempt_at = excluded.last_attempt_at, last_success_at = excluded.last_success_at,
      last_error = null, record_count = public.data_source_health.record_count + 1, updated_at = now();
  return query select true, true, v_consent_id, 'accepted'::text;
end;
$$;

revoke all on function public.issue_analytics_consent_intent(text) from public, anon, authenticated;
revoke all on function public.record_analytics_consent(text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.ingest_analytics_event(text, text, timestamptz, text, text, text, text, text, text, text, text, uuid, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.issue_analytics_consent_intent(text) to service_role;
grant execute on function public.record_analytics_consent(text, text, text, text, uuid) to service_role;
grant execute on function public.ingest_analytics_event(text, text, timestamptz, text, text, text, text, text, text, text, text, uuid, text, numeric, jsonb) to service_role;

-- Latest-issued intent heads make late browser requests harmless after cleanup.
alter table public.analytics_consent_intents
  add column if not exists superseded_at timestamptz;

alter table public.analytics_consent_intents
  drop constraint if exists analytics_consent_intents_consumed_result_check;
alter table public.analytics_consent_intents
  add constraint analytics_consent_intents_consumed_result_check
  check (consumed_result in ('accepted', 'stale', 'superseded'));
alter table public.analytics_consent_intents
  drop constraint if exists analytics_consent_intents_superseded_state_check;
alter table public.analytics_consent_intents
  add constraint analytics_consent_intents_superseded_state_check
  check (
    superseded_at is null
    or (consumed_at is not null and consumed_result = 'superseded')
  );

create table if not exists public.analytics_consent_intent_heads (
  visitor_id text primary key check (length(visitor_id) between 8 and 120),
  latest_intent_revision bigint not null check (latest_intent_revision > 0),
  issued_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.analytics_consent_intent_heads enable row level security;
revoke all on table public.analytics_consent_intent_heads from public, anon, authenticated;

insert into public.analytics_consent_intent_heads (visitor_id, latest_intent_revision, issued_at, updated_at)
select visitor_id, max(intent_revision), max(issued_at), now()
from public.analytics_consent_intents
group by visitor_id
on conflict (visitor_id) do update
set latest_intent_revision = greatest(
      public.analytics_consent_intent_heads.latest_intent_revision,
      excluded.latest_intent_revision
    ),
    issued_at = case
      when excluded.latest_intent_revision >= public.analytics_consent_intent_heads.latest_intent_revision
        then excluded.issued_at
      else public.analytics_consent_intent_heads.issued_at
    end,
    updated_at = now();

update public.analytics_consent_intents intent
set consumed_at = now(),
    consumed_result = 'superseded',
    superseded_at = now()
from public.analytics_consent_intent_heads head
where intent.visitor_id = head.visitor_id
  and intent.consumed_at is null
  and intent.intent_revision < head.latest_intent_revision;

create index if not exists idx_analytics_consent_intents_expiry_cleanup
  on public.analytics_consent_intents(expires_at, id)
  where consumed_at is null;
create index if not exists idx_analytics_consent_intents_consumed_cleanup
  on public.analytics_consent_intents(consumed_at, id)
  where consumed_at is not null;
create index if not exists idx_analytics_consent_intents_superseded_cleanup
  on public.analytics_consent_intents(superseded_at, id)
  where superseded_at is not null;

create or replace function public.cleanup_analytics_consent_intents(
  p_limit integer default 25
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer;
  v_deleted integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 250 then
    raise exception 'Invalid analytics consent intent cleanup limit' using errcode = '22023';
  end if;

  v_limit := p_limit;

  with candidates as (
    select id
    from public.analytics_consent_intents
    where expires_at <= now() - interval '1 hour'
      or consumed_at <= now() - interval '1 hour'
      or superseded_at <= now() - interval '1 hour'
    order by coalesce(superseded_at, consumed_at, expires_at), id
    for update skip locked
    limit v_limit
  ), deleted as (
    delete from public.analytics_consent_intents intent
    using candidates
    where intent.id = candidates.id
    returning 1
  )
  select count(*) into v_deleted from deleted;

  return v_deleted;
end;
$$;

create or replace function public.issue_analytics_consent_intent(
  p_visitor_id text
)
returns table(intent_id uuid, intent_revision bigint, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_intent_id uuid;
  v_intent_revision bigint;
  v_expires_at timestamptz;
begin
  if p_visitor_id is null or length(p_visitor_id) not between 8 and 120 then
    raise exception 'Invalid analytics consent intent input' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_visitor_id, 0));

  insert into public.analytics_consent_intents (visitor_id)
  values (p_visitor_id)
  returning analytics_consent_intents.id,
    analytics_consent_intents.intent_revision,
    analytics_consent_intents.expires_at
  into v_intent_id, v_intent_revision, v_expires_at;

  update public.analytics_consent_intents
  set consumed_at = now(),
      consumed_result = 'superseded',
      superseded_at = now()
  where visitor_id = p_visitor_id
    and consumed_at is null
    and id <> v_intent_id;

  insert into public.analytics_consent_intent_heads (
    visitor_id,
    latest_intent_revision,
    issued_at,
    updated_at
  ) values (
    p_visitor_id,
    v_intent_revision,
    now(),
    now()
  )
  on conflict (visitor_id) do update
  set latest_intent_revision = excluded.latest_intent_revision,
      issued_at = excluded.issued_at,
      updated_at = excluded.updated_at;

  begin
    perform public.cleanup_analytics_consent_intents(25);
  exception when others then
    null;
  end;

  return query select v_intent_id, v_intent_revision, v_expires_at;
end;
$$;

create or replace function public.record_analytics_consent(
  p_visitor_id text,
  p_consent text,
  p_locale text,
  p_consent_version text,
  p_intent_id uuid
)
returns table(
  accepted boolean,
  stale boolean,
  id uuid,
  consent text,
  revision bigint,
  intent_revision bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_intent public.analytics_consent_intents%rowtype;
  v_current_id uuid;
  v_current_consent text;
  v_current_revision bigint;
  v_current_intent_revision bigint;
  v_latest_intent_revision bigint;
  v_inserted public.analytics_consents%rowtype;
begin
  if p_visitor_id is null or length(p_visitor_id) not between 8 and 120
    or p_consent not in ('necessary', 'analytics')
    or p_locale not in ('zh', 'en', 'es', 'fr', 'de')
    or p_consent_version is null or length(p_consent_version) not between 1 and 40
    or p_intent_id is null
  then
    raise exception 'Invalid analytics consent input' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_visitor_id, 0));

  select consent_row.id, consent_row.consent, consent_row.revision, consent_row.intent_revision
  into v_current_id, v_current_consent, v_current_revision, v_current_intent_revision
  from public.analytics_consents consent_row
  where consent_row.visitor_id = p_visitor_id
  order by consent_row.intent_revision desc
  limit 1
  for update;

  select latest_intent_revision
  into v_latest_intent_revision
  from public.analytics_consent_intent_heads head
  where head.visitor_id = p_visitor_id
  for update;

  select * into v_intent
  from public.analytics_consent_intents intent_row
  where intent_row.id = p_intent_id
    and intent_row.visitor_id = p_visitor_id
  for update;

  if not found then
    return query select false, true, v_current_id, v_current_consent, v_current_revision, v_current_intent_revision;
    return;
  end if;

  if v_intent.consumed_at is not null
    or v_intent.expires_at <= now()
    or v_latest_intent_revision is null
    or v_intent.intent_revision <> v_latest_intent_revision
    or v_intent.intent_revision <= coalesce(v_current_intent_revision, 0)
  then
    if v_intent.consumed_at is null then
      update public.analytics_consent_intents intent_row
      set consumed_at = now(),
          consumed_result = case
            when v_latest_intent_revision is not null
              and v_intent.intent_revision <> v_latest_intent_revision
              then 'superseded'
            else 'stale'
          end,
          superseded_at = case
            when v_latest_intent_revision is not null
              and v_intent.intent_revision <> v_latest_intent_revision
              then now()
            else intent_row.superseded_at
          end
      where intent_row.id = v_intent.id;
    end if;
    return query select false, true, v_current_id, v_current_consent, v_current_revision, v_current_intent_revision;
    return;
  end if;

  insert into public.analytics_consents (
    visitor_id,
    consent,
    locale,
    consent_version,
    intent_revision
  ) values (
    p_visitor_id,
    p_consent,
    p_locale,
    p_consent_version,
    v_intent.intent_revision
  )
  returning * into v_inserted;

  update public.analytics_consent_intents intent_row
  set consumed_at = now(),
      consumed_result = 'accepted'
  where intent_row.id = v_intent.id;

  return query select true, false, v_inserted.id, v_inserted.consent, v_inserted.revision, v_inserted.intent_revision;
end;
$$;

revoke all on function public.cleanup_analytics_consent_intents(integer) from public, anon, authenticated;
revoke all on function public.issue_analytics_consent_intent(text) from public, anon, authenticated;
revoke all on function public.record_analytics_consent(text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.cleanup_analytics_consent_intents(integer) to service_role;
grant execute on function public.issue_analytics_consent_intent(text) to service_role;
grant execute on function public.record_analytics_consent(text, text, text, text, uuid) to service_role;
commit;
-- Financial correctness for Stripe payment/refund webhooks and Data Center aggregates.
-- All money crossing the RPC boundary is integer EUR cents.
begin;

alter table public.payment_refunds
  add column if not exists succeeded_at timestamptz;

update public.payment_refunds
set succeeded_at = coalesce(succeeded_at, updated_at, created_at)
where status = 'succeeded'
  and succeeded_at is null;

do $$
begin
  if exists (
    select 1
    from public.payments
    where provider_payment_id is not null
    group by provider, provider_payment_id
    having count(*) > 1
  ) then
    raise exception 'Cannot add payments provider uniqueness: duplicate provider/payment identifiers exist. Resolve the duplicate business records manually before applying this migration.';
  end if;

  if exists (
    select 1
    from public.inventory_movements
    where movement_type = 'payment_confirmed'
      and order_id is not null
    group by order_id, product_id, movement_type
    having count(*) > 1
  ) then
    raise exception 'Cannot add payment inventory idempotency: duplicate payment_confirmed inventory movements exist. Resolve the duplicate business records manually before applying this migration.';
  end if;

  if exists (
    select 1
    from public.email_notifications
    where order_id is not null
    group by order_id, event
    having count(*) > 1
  ) then
    raise exception 'Cannot add payment email idempotency: duplicate order/email event records exist. Resolve the duplicate business records manually before applying this migration.';
  end if;
end;
$$;

create unique index if not exists idx_payments_provider_payment_id_unique
  on public.payments(provider, provider_payment_id)
  where provider_payment_id is not null;

create unique index if not exists idx_inventory_payment_confirmed_once
  on public.inventory_movements(order_id, product_id)
  where movement_type = 'payment_confirmed'
    and order_id is not null;

create unique index if not exists idx_email_notifications_order_event_unique
  on public.email_notifications(order_id, event)
  where order_id is not null;

create index if not exists idx_payment_refunds_succeeded_at
  on public.payment_refunds(succeeded_at)
  where status = 'succeeded' and currency = 'EUR';

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  status text not null check (status in ('processing', 'processed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_stripe_webhook_events_status_updated
  on public.stripe_webhook_events(status, updated_at desc);

alter table public.stripe_webhook_events enable row level security;

drop trigger if exists set_stripe_webhook_events_updated_at on public.stripe_webhook_events;
create trigger set_stripe_webhook_events_updated_at before update on public.stripe_webhook_events
for each row execute function public.set_updated_at();

create or replace function public.enforce_payment_refund_financial_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'succeeded' then
      new.succeeded_at = coalesce(new.succeeded_at, now());
    else
      new.succeeded_at = null;
    end if;
    return new;
  end if;

  if new.provider is distinct from old.provider
    or new.provider_refund_id is distinct from old.provider_refund_id
    or new.order_id is distinct from old.order_id
    or new.payment_id is distinct from old.payment_id
    or new.amount_eur is distinct from old.amount_eur
    or new.currency is distinct from old.currency
  then
    raise exception 'Payment refund financial identity is immutable';
  end if;

  if old.status = 'succeeded' and new.status <> 'succeeded' then
    raise exception 'Succeeded payment refunds cannot be downgraded';
  end if;

  if old.status <> 'pending' and new.status <> old.status then
    raise exception 'Only pending payment refunds may advance to a terminal state';
  end if;

  if old.succeeded_at is not null and new.succeeded_at is distinct from old.succeeded_at then
    raise exception 'Payment refund succeeded_at is immutable';
  end if;

  if new.status = 'succeeded' then
    new.succeeded_at = coalesce(old.succeeded_at, new.succeeded_at, now());
  elsif new.succeeded_at is not null then
    raise exception 'Only succeeded payment refunds may have succeeded_at';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_payment_refund_financial_identity on public.payment_refunds;
create trigger enforce_payment_refund_financial_identity
before insert or update on public.payment_refunds
for each row execute function public.enforce_payment_refund_financial_identity();

create or replace function public.stripe_source_record_count()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (
    select count(*) from public.payments where provider = 'stripe'
  ) + (
    select count(*) from public.payment_refunds where provider = 'stripe'
  );
$$;

create or replace function public.mark_stripe_webhook_failure(
  p_event_id text,
  p_event_type text,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record_count bigint;
begin
  if p_event_id is null or length(p_event_id) not between 3 and 255
    or p_event_type is null or length(p_event_type) not between 3 and 120
  then
    raise exception 'Invalid Stripe webhook failure input' using errcode = '22023';
  end if;

  insert into public.stripe_webhook_events (event_id, event_type, status, attempts, last_error)
  values (p_event_id, p_event_type, 'failed', 1, coalesce(nullif(p_error_code, ''), 'stripe_webhook_failed'))
  on conflict (event_id) do update
  set event_type = excluded.event_type,
      status = case when public.stripe_webhook_events.status = 'processed' then 'processed' else 'failed' end,
      attempts = case
        when public.stripe_webhook_events.status = 'processed' then public.stripe_webhook_events.attempts
        else public.stripe_webhook_events.attempts + 1
      end,
      last_error = case
        when public.stripe_webhook_events.status = 'processed' then public.stripe_webhook_events.last_error
        else excluded.last_error
      end;

  select public.stripe_source_record_count() into v_record_count;
  insert into public.data_source_health (
    source_key, source_type, state, last_attempt_at, last_error, record_count, metadata
  ) values (
    'stripe', 'stripe', 'failed', now(), 'stripe_webhook_failed', v_record_count,
    jsonb_build_object('lastEventType', p_event_type, 'lastOutcome', 'failure')
  )
  on conflict (source_key) do update
  set state = 'failed',
      last_attempt_at = excluded.last_attempt_at,
      last_error = excluded.last_error,
      record_count = excluded.record_count,
      metadata = excluded.metadata;
end;
$$;

create or replace function public.record_stripe_refund(
  p_event_id text,
  p_event_type text,
  p_provider_refund_id text,
  p_provider_payment_id text,
  p_amount_cents bigint,
  p_currency text,
  p_status text,
  p_reason text,
  p_raw_payload jsonb
)
returns table(
  ok boolean,
  error_code text,
  order_refunded boolean,
  event_processed boolean,
  source_record_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_existing public.payment_refunds%rowtype;
  v_event public.stripe_webhook_events%rowtype;
  v_effective_status text;
  v_refund_exists boolean := false;
  v_existing_succeeded_cents bigint := 0;
  v_succeeded_total_cents bigint := 0;
  v_order_total_cents bigint := 0;
  v_record_count bigint := 0;
  v_order_refunded boolean := false;
begin
  if p_event_id is null or length(p_event_id) not between 3 and 255
    or p_event_type not in ('refund.created', 'refund.updated', 'refund.failed')
    or p_provider_refund_id is null or length(p_provider_refund_id) not between 3 and 255
    or p_provider_payment_id is null or length(p_provider_payment_id) not between 3 and 255
    or p_amount_cents is null or p_amount_cents < 0
    or upper(coalesce(p_currency, '')) <> 'EUR'
  then
    raise exception 'Invalid Stripe refund input' using errcode = '22023';
  end if;

  if lower(coalesce(p_status, '')) = 'succeeded' then
    v_effective_status := 'succeeded';
  elsif lower(coalesce(p_status, '')) in ('failed', 'failure') then
    v_effective_status := 'failed';
  elsif lower(coalesce(p_status, '')) in ('canceled', 'cancelled') then
    v_effective_status := 'cancelled';
  else
    v_effective_status := 'pending';
  end if;

  select * into v_payment
  from public.payments payment_row
  where payment_row.provider = 'stripe'
    and payment_row.provider_payment_id = p_provider_payment_id
    and payment_row.status in ('paid', 'refunded')
  for update;

  if not found then
    return query select false, 'payment_not_found', false, false, 0::bigint;
    return;
  end if;

  select * into v_order
  from public.orders order_row
  where order_row.id = v_payment.order_id
  for update;

  if not found then
    return query select false, 'order_not_found', false, false, 0::bigint;
    return;
  end if;

  insert into public.stripe_webhook_events (event_id, event_type, status, attempts)
  values (p_event_id, p_event_type, 'processing', 1)
  on conflict (event_id) do nothing;

  select * into v_event
  from public.stripe_webhook_events webhook_row
  where webhook_row.event_id = p_event_id
  for update;

  if v_event.status = 'processed' then
    select public.stripe_source_record_count() into v_record_count;
    return query select true, null::text, v_order.payment_status = 'refunded', true, v_record_count;
    return;
  end if;

  update public.stripe_webhook_events
  set status = 'processing',
      attempts = case when v_event.status = 'failed' then attempts + 1 else attempts end,
      last_error = null
  where event_id = p_event_id;

  select * into v_existing
  from public.payment_refunds refund_row
  where refund_row.provider = 'stripe'
    and refund_row.provider_refund_id = p_provider_refund_id
  for update;

  if found then
    v_refund_exists := true;
    if v_existing.order_id <> v_order.id
      or v_existing.payment_id is distinct from v_payment.id
      or round(v_existing.amount_eur * 100)::bigint <> p_amount_cents
      or upper(v_existing.currency) <> 'EUR'
    then
      update public.stripe_webhook_events
      set status = 'failed', last_error = 'stripe_refund_identity_mismatch'
      where event_id = p_event_id;
      return query select false, 'refund_identity_mismatch', false, false, 0::bigint;
      return;
    end if;

    if v_existing.status = 'succeeded' then
      v_effective_status := 'succeeded';
    elsif v_existing.status <> 'pending' then
      v_effective_status := v_existing.status;
    end if;

    if v_existing.status = 'succeeded' then
      v_existing_succeeded_cents := round(v_existing.amount_eur * 100)::bigint;
    end if;
  end if;

  select coalesce(sum(round(refund_row.amount_eur * 100)::bigint), 0)
  into v_succeeded_total_cents
  from public.payment_refunds refund_row
  where refund_row.order_id = v_order.id
    and refund_row.provider = 'stripe'
    and refund_row.currency = 'EUR'
    and refund_row.status = 'succeeded'
    and refund_row.provider_refund_id <> p_provider_refund_id;

  if v_effective_status = 'succeeded' then
    v_succeeded_total_cents := v_succeeded_total_cents + p_amount_cents;
  end if;
  v_order_total_cents := round(v_order.total_eur * 100)::bigint;

  if v_succeeded_total_cents > v_order_total_cents then
    update public.stripe_webhook_events
    set status = 'failed', last_error = 'stripe_refund_total_exceeds_order'
    where event_id = p_event_id;
    return query select false, 'refund_total_exceeds_order', false, false, 0::bigint;
    return;
  end if;

  if v_refund_exists then
    update public.payment_refunds
    set status = v_effective_status,
        reason = p_reason,
        raw_payload = coalesce(p_raw_payload, '{}'::jsonb)
    where id = v_existing.id;
  else
    insert into public.payment_refunds (
      order_id, payment_id, provider, provider_refund_id, amount_eur, currency,
      status, reason, raw_payload, succeeded_at
    ) values (
      v_order.id, v_payment.id, 'stripe', p_provider_refund_id,
      p_amount_cents::numeric / 100, 'EUR', v_effective_status, p_reason,
      coalesce(p_raw_payload, '{}'::jsonb), case when v_effective_status = 'succeeded' then now() else null end
    );
  end if;

  if v_succeeded_total_cents >= v_order_total_cents and v_order_total_cents >= 0 then
    update public.orders
    set payment_status = 'refunded',
        status = 'refunded'
    where id = v_order.id
      and payment_status <> 'refunded';
    v_order_refunded := true;
  else
    v_order_refunded := v_order.payment_status = 'refunded';
  end if;

  update public.stripe_webhook_events
  set status = 'processed', processed_at = now(), last_error = null
  where event_id = p_event_id;

  select public.stripe_source_record_count() into v_record_count;
  insert into public.data_source_health (
    source_key, source_type, state, last_attempt_at, last_success_at, last_error, record_count, metadata
  ) values (
    'stripe', 'stripe', 'current', now(), now(), null, v_record_count,
    jsonb_build_object('lastEventType', p_event_type, 'lastOutcome', 'success')
  )
  on conflict (source_key) do update
  set state = 'current',
      last_attempt_at = excluded.last_attempt_at,
      last_success_at = excluded.last_success_at,
      last_error = null,
      record_count = excluded.record_count,
      metadata = excluded.metadata;

  return query select true, null::text, v_order_refunded, true, v_record_count;
end;
$$;

create or replace function public.record_stripe_checkout_payment(
  p_event_id text,
  p_event_type text,
  p_order_id uuid,
  p_order_number text,
  p_provider_payment_id text,
  p_session_id text,
  p_amount_cents bigint,
  p_currency text,
  p_raw_payload jsonb
)
returns table(
  ok boolean,
  error_code text,
  event_processed boolean,
  payment_confirmed boolean,
  email_queued boolean,
  source_record_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_event public.stripe_webhook_events%rowtype;
  v_item record;
  v_stock_after integer;
  v_order_total_cents bigint;
  v_record_count bigint := 0;
  v_existing_payment boolean := false;
  v_payment_confirmed boolean := false;
  v_email_queued boolean := false;
  v_email_inserted integer := 0;
begin
  if p_event_id is null or length(p_event_id) not between 3 and 255
    or p_event_type not in ('checkout.session.completed', 'checkout.session.async_payment_succeeded')
    or p_order_id is null
    or p_order_number is null or length(p_order_number) not between 3 and 120
    or p_provider_payment_id is null or length(p_provider_payment_id) not between 3 and 255
    or p_session_id is null or length(p_session_id) not between 3 and 255
    or p_amount_cents is null or p_amount_cents < 0
    or upper(coalesce(p_currency, '')) <> 'EUR'
  then
    raise exception 'Invalid Stripe checkout payment input' using errcode = '22023';
  end if;

  select * into v_order
  from public.orders order_row
  where order_row.id = p_order_id
  for update;

  if not found or v_order.order_number <> p_order_number then
    return query select false, 'order_not_found', false, false, false, 0::bigint;
    return;
  end if;

  v_order_total_cents := round(v_order.total_eur * 100)::bigint;
  if v_order_total_cents <> p_amount_cents then
    return query select false, 'payment_amount_mismatch', false, false, false, 0::bigint;
    return;
  end if;

  if v_order.payment_status = 'confirmed_offline' then
    return query select false, 'offline_payment_conflict', false, false, false, 0::bigint;
    return;
  end if;

  insert into public.stripe_webhook_events (event_id, event_type, status, attempts)
  values (p_event_id, p_event_type, 'processing', 1)
  on conflict (event_id) do nothing;

  select * into v_event
  from public.stripe_webhook_events webhook_row
  where webhook_row.event_id = p_event_id
  for update;

  if v_event.status = 'processed' then
    select public.stripe_source_record_count() into v_record_count;
    return query select true, null::text, true, false, false, v_record_count;
    return;
  end if;

  update public.stripe_webhook_events
  set status = 'processing',
      attempts = case when v_event.status = 'failed' then attempts + 1 else attempts end,
      last_error = null
  where event_id = p_event_id;

  select * into v_payment
  from public.payments payment_row
  where payment_row.provider = 'stripe'
    and payment_row.provider_payment_id = p_provider_payment_id
  for update;

  if found then
    v_existing_payment := true;
    if v_payment.order_id <> v_order.id
      or round(v_payment.amount_eur * 100)::bigint <> p_amount_cents
      or upper(v_payment.currency) <> 'EUR'
    then
      update public.stripe_webhook_events
      set status = 'failed', last_error = 'stripe_payment_identity_mismatch'
      where event_id = p_event_id;
      return query select false, 'payment_identity_mismatch', false, false, false, 0::bigint;
      return;
    end if;
  end if;

  if v_order.payment_status = 'refunded' or v_order.status = 'refunded' then
    if not v_existing_payment then
      insert into public.payments (
        order_id, provider, provider_payment_id, status, amount_eur, currency, confirmed_at, raw_payload
      ) values (
        v_order.id, 'stripe', p_provider_payment_id, 'refunded', p_amount_cents::numeric / 100,
        'EUR', now(), coalesce(p_raw_payload, '{}'::jsonb)
      );
    end if;
  elsif v_existing_payment and v_payment.status in ('paid', 'refunded') then
    if v_payment.status = 'refunded' then
      update public.stripe_webhook_events
      set status = 'failed', last_error = 'stripe_payment_order_state_mismatch'
      where event_id = p_event_id;
      return query select false, 'payment_order_state_mismatch', false, false, false, 0::bigint;
      return;
    end if;
  else
    if v_order.payment_status = 'paid' then
      update public.stripe_webhook_events
      set status = 'failed', last_error = 'stripe_paid_order_payment_missing'
      where event_id = p_event_id;
      return query select false, 'paid_order_payment_missing', false, false, false, 0::bigint;
      return;
    end if;

    if v_existing_payment then
      update public.payments
      set status = 'paid',
          confirmed_at = coalesce(confirmed_at, now()),
          raw_payload = coalesce(p_raw_payload, '{}'::jsonb)
      where id = v_payment.id;
    else
      insert into public.payments (
        order_id, provider, provider_payment_id, status, amount_eur, currency, confirmed_at, raw_payload
      ) values (
        v_order.id, 'stripe', p_provider_payment_id, 'paid', p_amount_cents::numeric / 100,
        'EUR', now(), coalesce(p_raw_payload, '{}'::jsonb)
      );
    end if;

    for v_item in
      select order_item.product_id, sum(order_item.quantity)::integer as quantity
      from public.order_items order_item
      where order_item.order_id = v_order.id
        and order_item.product_id is not null
      group by order_item.product_id
    loop
      update public.products
      set stock = stock - v_item.quantity,
          reserved_stock = reserved_stock - v_item.quantity
      where id = v_item.product_id
        and stock >= v_item.quantity
        and reserved_stock >= v_item.quantity
      returning stock into v_stock_after;

      if not found then
        raise exception 'Stripe payment inventory is unavailable' using errcode = 'P0001';
      end if;

      insert into public.inventory_movements (
        product_id, movement_type, quantity_delta, stock_after, reason, order_id
      ) values (
        v_item.product_id, 'payment_confirmed', -v_item.quantity, v_stock_after,
        'Stripe payment confirmed', v_order.id
      );
    end loop;

    update public.orders
    set status = 'paid_confirmed',
        payment_status = 'paid',
        payment_provider = 'stripe',
        payment_reference = p_session_id,
        payment_method_note = 'Stripe Checkout',
        paid_at = coalesce(paid_at, now())
    where id = v_order.id
      and payment_status <> 'refunded';

    insert into public.email_notifications (
      order_id, order_number, customer_email, event, subject, preview_text, body_text, provider, status, attempts
    ) values (
      v_order.id,
      v_order.order_number,
      v_order.customer_email,
      'payment_confirmed',
      format('Payment confirmed for BoxSofa order %s', v_order.order_number),
      'Your payment has been confirmed. We are preparing your sofa for dispatch.',
      format(
        'Hi %s,\n\nPayment has been confirmed for order %s.\nWe are preparing your sofa for dispatch.\n\nEstimated cross-border delivery after dispatch: 23-30 days.\n\nThank you,\nBoxSofa',
        coalesce(nullif(trim(v_order.customer_name), ''), 'there'),
        v_order.order_number
      ),
      'pending', 'queued', 0
    )
    on conflict (order_id, event) where order_id is not null do nothing;

    get diagnostics v_email_inserted = row_count;

    v_payment_confirmed := true;
    v_email_queued := v_email_inserted > 0;
  end if;

  update public.stripe_webhook_events
  set status = 'processed', processed_at = now(), last_error = null
  where event_id = p_event_id;

  select public.stripe_source_record_count() into v_record_count;
  insert into public.data_source_health (
    source_key, source_type, state, last_attempt_at, last_success_at, last_error, record_count, metadata
  ) values (
    'stripe', 'stripe', 'current', now(), now(), null, v_record_count,
    jsonb_build_object('lastEventType', p_event_type, 'lastOutcome', 'success')
  )
  on conflict (source_key) do update
  set state = 'current',
      last_attempt_at = excluded.last_attempt_at,
      last_success_at = excluded.last_success_at,
      last_error = null,
      record_count = excluded.record_count,
      metadata = excluded.metadata;

  return query select true, null::text, true, v_payment_confirmed, v_email_queued, v_record_count;
end;
$$;

create or replace function public.get_data_center_overview(
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns table(
  paid_gmv_cents bigint,
  succeeded_refund_cents bigint,
  paid_order_count bigint,
  unique_visitor_count bigint,
  open_after_sales_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_start_at is null or p_end_at is null or p_start_at >= p_end_at then
    raise exception 'Invalid overview range' using errcode = '22023';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' and not public.is_owner() then
    raise exception 'Owner access is required' using errcode = '42501';
  end if;

  return query
  select
    coalesce((
      select sum(round(order_row.total_eur * 100)::bigint)
      from public.orders order_row
      where order_row.payment_provider = 'stripe'
        and order_row.payment_status in ('paid', 'refunded')
        and order_row.paid_at >= p_start_at
        and order_row.paid_at < p_end_at
    ), 0)::bigint,
    coalesce((
      select sum(round(refund_row.amount_eur * 100)::bigint)
      from public.payment_refunds refund_row
      where refund_row.provider = 'stripe'
        and refund_row.currency = 'EUR'
        and refund_row.status = 'succeeded'
        and refund_row.succeeded_at >= p_start_at
        and refund_row.succeeded_at < p_end_at
    ), 0)::bigint,
    coalesce((
      select count(*)
      from public.orders order_row
      where order_row.payment_provider = 'stripe'
        and order_row.payment_status in ('paid', 'refunded')
        and order_row.paid_at >= p_start_at
        and order_row.paid_at < p_end_at
    ), 0)::bigint,
    coalesce((
      select count(distinct event_row.visitor_id)
      from public.analytics_events event_row
      where event_row.event_type = 'page_view'
        and event_row.created_at >= p_start_at
        and event_row.created_at < p_end_at
    ), 0)::bigint,
    coalesce((
      select count(*)
      from public.after_sales_cases after_sales_row
      where after_sales_row.status not in ('resolved', 'rejected')
    ), 0)::bigint;
end;
$$;

revoke all on function public.stripe_source_record_count() from public, anon, authenticated;
revoke all on function public.mark_stripe_webhook_failure(text, text, text) from public, anon, authenticated;
revoke all on function public.record_stripe_refund(text, text, text, text, bigint, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_stripe_checkout_payment(text, text, uuid, text, text, text, bigint, text, jsonb) from public, anon, authenticated;
revoke all on function public.get_data_center_overview(timestamptz, timestamptz) from public, anon;
grant execute on function public.mark_stripe_webhook_failure(text, text, text) to service_role;
grant execute on function public.record_stripe_refund(text, text, text, text, bigint, text, text, text, jsonb) to service_role;
grant execute on function public.record_stripe_checkout_payment(text, text, uuid, text, text, text, bigint, text, jsonb) to service_role;
grant execute on function public.get_data_center_overview(timestamptz, timestamptz) to service_role, authenticated;

commit;
-- Promote the temporary partial unique index to the durable payment identity constraint.
begin;

do $$
begin
  if exists (
    select 1
    from public.payments
    where provider_payment_id is not null
    group by provider, provider_payment_id
    having count(*) > 1
  ) then
    raise exception 'Cannot add payments provider uniqueness: duplicate provider/payment identifiers exist. Resolve the duplicate business records manually before applying this migration.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_provider_payment_id_unique'
  ) then
    alter table public.payments
      add constraint payments_provider_payment_id_unique
      unique (provider, provider_payment_id);
  end if;
end;
$$;

drop index if exists public.idx_payments_provider_payment_id_unique;

commit;
-- Task 5 production safety: immutable Stripe event identity, truthful consented visitors,
-- owner-only financial data, and idempotent outbox delivery.
begin;

-- Stop instead of guessing when an old partial Stripe payment write exists. See the
-- accompanying diagnostic document for the read-only query and a manual recovery path.
do $$
begin
  if exists (
    select 1
    from public.orders order_row
    where order_row.payment_provider = 'stripe'
      and order_row.payment_status in ('paid', 'refunded')
      and not exists (
        select 1
        from public.payments payment_row
        where payment_row.order_id = order_row.id
          and payment_row.provider = 'stripe'
          and payment_row.status in ('paid', 'refunded')
      )
  ) then
    raise exception 'Cannot harden Stripe webhook transactions: paid/refunded Stripe orders without a Stripe payment row exist. Run docs/data-center-financial-diagnostics.md and reconcile from Stripe before retrying this migration.';
  end if;
end;
$$;

alter table public.stripe_webhook_events
  add column if not exists object_type text,
  add column if not exists object_id text;

alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_events_object_identity_check;
alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_object_identity_check
  check ((object_type is null) = (object_id is null));

alter table public.email_notifications
  add column if not exists provider_message_id text,
  add column if not exists delivery_lease_token uuid,
  add column if not exists delivery_lease_expires_at timestamptz;

alter table public.email_notifications
  drop constraint if exists email_notifications_status_check;
alter table public.email_notifications
  add constraint email_notifications_status_check
  check (status in ('queued', 'sending', 'sent', 'failed', 'skipped'));

create index if not exists idx_email_notifications_delivery_claim
  on public.email_notifications(status, delivery_lease_expires_at, created_at);

drop policy if exists "admins manage payments" on public.payments;
drop policy if exists "owners manage payments" on public.payments;
create policy "owners manage payments"
on public.payments for all
using ((select public.is_owner()))
with check ((select public.is_owner()));

drop policy if exists "admins read email notifications" on public.email_notifications;
drop policy if exists "admins manage email notifications" on public.email_notifications;
drop policy if exists "owners manage email notifications" on public.email_notifications;
create policy "owners manage email notifications"
on public.email_notifications for all
using ((select public.is_owner()))
with check ((select public.is_owner()));

create or replace function public.claim_stripe_webhook_event_identity(
  p_event_id text,
  p_event_type text,
  p_object_type text,
  p_object_id text
)
returns table(
  accepted boolean,
  already_processed boolean,
  error_code text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.stripe_webhook_events%rowtype;
begin
  if p_event_id is null or length(p_event_id) not between 3 and 255
    or p_event_type is null or length(p_event_type) not between 3 and 120
    or p_object_type not in ('checkout_session', 'refund')
    or p_object_id is null or length(p_object_id) not between 3 and 255
  then
    raise exception 'Invalid Stripe webhook identity input' using errcode = '22023';
  end if;

  insert into public.stripe_webhook_events (
    event_id, event_type, object_type, object_id, status, attempts
  ) values (
    p_event_id, p_event_type, p_object_type, p_object_id, 'processing', 1
  ) on conflict (event_id) do nothing;

  select * into v_event
  from public.stripe_webhook_events event_row
  where event_row.event_id = p_event_id
  for update;

  if v_event.event_type is distinct from p_event_type
    or v_event.object_type is distinct from p_object_type
    or v_event.object_id is distinct from p_object_id
  then
    return query select false, false, 'event_identity_mismatch'::text;
    return;
  end if;

  if v_event.status = 'processed' then
    return query select true, true, null::text;
    return;
  end if;

  update public.stripe_webhook_events
  set status = 'processing',
      attempts = case when v_event.status = 'failed' then v_event.attempts + 1 else v_event.attempts end,
      last_error = null
  where event_id = p_event_id;

  return query select true, false, null::text;
end;
$$;

alter function public.record_stripe_refund(text, text, text, text, bigint, text, text, text, jsonb)
  rename to record_stripe_refund_v012;
alter function public.record_stripe_checkout_payment(text, text, uuid, text, text, text, bigint, text, jsonb)
  rename to record_stripe_checkout_payment_v012;

create or replace function public.record_stripe_refund(
  p_event_id text,
  p_event_type text,
  p_provider_refund_id text,
  p_provider_payment_id text,
  p_amount_cents bigint,
  p_currency text,
  p_status text,
  p_reason text,
  p_raw_payload jsonb
)
returns table(
  ok boolean,
  error_code text,
  order_refunded boolean,
  event_processed boolean,
  source_record_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_identity record;
begin
  -- All Stripe payment/refund work takes the payment key, then the order key.
  perform pg_advisory_xact_lock(hashtextextended('stripe:payment:' || coalesce(p_provider_payment_id, ''), 0));
  select payment_row.order_id into v_order_id
  from public.payments payment_row
  where payment_row.provider = 'stripe'
    and payment_row.provider_payment_id = p_provider_payment_id;

  if not found then
    return query select * from public.record_stripe_refund_v012(
      p_event_id, p_event_type, p_provider_refund_id, p_provider_payment_id,
      p_amount_cents, p_currency, p_status, p_reason, p_raw_payload
    );
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stripe:order:' || v_order_id::text, 0));
  select * into v_identity
  from public.claim_stripe_webhook_event_identity(
    p_event_id, p_event_type, 'refund', p_provider_refund_id
  );

  if v_identity.accepted is not true then
    return query select false, coalesce(v_identity.error_code, 'event_identity_mismatch'), false, false, 0::bigint;
    return;
  end if;

  return query select * from public.record_stripe_refund_v012(
    p_event_id, p_event_type, p_provider_refund_id, p_provider_payment_id,
    p_amount_cents, p_currency, p_status, p_reason, p_raw_payload
  );
end;
$$;

create or replace function public.record_stripe_checkout_payment(
  p_event_id text,
  p_event_type text,
  p_order_id uuid,
  p_order_number text,
  p_provider_payment_id text,
  p_session_id text,
  p_amount_cents bigint,
  p_currency text,
  p_raw_payload jsonb
)
returns table(
  ok boolean,
  error_code text,
  event_processed boolean,
  payment_confirmed boolean,
  email_queued boolean,
  source_record_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identity record;
begin
  -- Keep the same lock order as refunds before delegating to the proven v012 transaction.
  perform pg_advisory_xact_lock(hashtextextended('stripe:payment:' || coalesce(p_provider_payment_id, ''), 0));
  perform pg_advisory_xact_lock(hashtextextended('stripe:order:' || coalesce(p_order_id::text, ''), 0));
  select * into v_identity
  from public.claim_stripe_webhook_event_identity(
    p_event_id, p_event_type, 'checkout_session', p_session_id
  );

  if v_identity.accepted is not true then
    return query select false, coalesce(v_identity.error_code, 'event_identity_mismatch'), false, false, false, 0::bigint;
    return;
  end if;

  return query select * from public.record_stripe_checkout_payment_v012(
    p_event_id, p_event_type, p_order_id, p_order_number, p_provider_payment_id,
    p_session_id, p_amount_cents, p_currency, p_raw_payload
  );
end;
$$;

create or replace function public.get_data_center_overview(
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns table(
  paid_gmv_cents bigint,
  succeeded_refund_cents bigint,
  paid_order_count bigint,
  unique_visitor_count bigint,
  open_after_sales_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_start_at is null or p_end_at is null or p_start_at >= p_end_at then
    raise exception 'Invalid overview range' using errcode = '22023';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' and not public.is_owner() then
    raise exception 'Owner access is required' using errcode = '42501';
  end if;

  return query
  select
    coalesce((
      select sum(round(order_row.total_eur * 100)::bigint)
      from public.orders order_row
      where order_row.payment_provider = 'stripe'
        and order_row.payment_status in ('paid', 'refunded')
        and order_row.paid_at >= p_start_at
        and order_row.paid_at < p_end_at
    ), 0)::bigint,
    coalesce((
      select sum(round(refund_row.amount_eur * 100)::bigint)
      from public.payment_refunds refund_row
      where refund_row.provider = 'stripe'
        and refund_row.currency = 'EUR'
        and refund_row.status = 'succeeded'
        and refund_row.succeeded_at >= p_start_at
        and refund_row.succeeded_at < p_end_at
    ), 0)::bigint,
    coalesce((
      select count(*)
      from public.orders order_row
      where order_row.payment_provider = 'stripe'
        and order_row.payment_status in ('paid', 'refunded')
        and order_row.paid_at >= p_start_at
        and order_row.paid_at < p_end_at
    ), 0)::bigint,
    coalesce((
      select count(distinct event_row.visitor_id)
      from public.analytics_events event_row
      join public.analytics_consents consent_row
        on consent_row.id = event_row.consent_id
       and consent_row.consent = 'analytics'
      where event_row.event_type = 'page_view'
        and event_row.created_at >= p_start_at
        and event_row.created_at < p_end_at
    ), 0)::bigint,
    coalesce((
      select count(*)
      from public.after_sales_cases after_sales_row
      where after_sales_row.status not in ('resolved', 'rejected')
    ), 0)::bigint;
end;
$$;

create or replace function public.claim_email_notification_delivery(
  p_notification_id uuid,
  p_lease_seconds integer default 300
)
returns table(
  claimed boolean,
  lease_token uuid,
  notification jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_notification public.email_notifications%rowtype;
  v_lease_token uuid := gen_random_uuid();
begin
  if p_notification_id is null or p_lease_seconds not between 30 and 900 then
    raise exception 'Invalid email delivery claim input' using errcode = '22023';
  end if;

  update public.email_notifications notification_row
  set status = 'sending',
      attempts = notification_row.attempts + 1,
      delivery_lease_token = v_lease_token,
      delivery_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      last_error = null
  where notification_row.id = p_notification_id
    and (
      notification_row.status in ('queued', 'failed')
      or (
        notification_row.status = 'sending'
        and (notification_row.delivery_lease_expires_at is null or notification_row.delivery_lease_expires_at <= now())
      )
    )
  returning * into v_notification;

  if not found then
    return query select false, null::uuid, null::jsonb;
    return;
  end if;

  return query select true, v_lease_token, to_jsonb(v_notification);
end;
$$;

create or replace function public.finalize_email_notification_delivery(
  p_notification_id uuid,
  p_lease_token uuid,
  p_succeeded boolean,
  p_provider text,
  p_provider_message_id text,
  p_error text
)
returns table(
  finalized boolean,
  notification jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_notification public.email_notifications%rowtype;
begin
  if p_notification_id is null or p_lease_token is null
    or coalesce(nullif(trim(p_provider), ''), '') = ''
  then
    raise exception 'Invalid email delivery finalization input' using errcode = '22023';
  end if;

  update public.email_notifications notification_row
  set status = case when p_succeeded then 'sent' else 'failed' end,
      provider = p_provider,
      provider_message_id = case when p_succeeded then p_provider_message_id else notification_row.provider_message_id end,
      last_error = case when p_succeeded then null else coalesce(nullif(trim(p_error), ''), 'Email sending failed.') end,
      sent_at = case when p_succeeded then coalesce(notification_row.sent_at, now()) else notification_row.sent_at end,
      delivery_lease_token = null,
      delivery_lease_expires_at = null
  where notification_row.id = p_notification_id
    and notification_row.status = 'sending'
    and notification_row.delivery_lease_token = p_lease_token
  returning * into v_notification;

  if not found then
    return query select false, null::jsonb;
    return;
  end if;

  return query select true, to_jsonb(v_notification);
end;
$$;

revoke all on function public.record_stripe_refund_v012(text, text, text, text, bigint, text, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.record_stripe_checkout_payment_v012(text, text, uuid, text, text, text, bigint, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.claim_stripe_webhook_event_identity(text, text, text, text) from public, anon, authenticated;
revoke all on function public.record_stripe_refund(text, text, text, text, bigint, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_stripe_checkout_payment(text, text, uuid, text, text, text, bigint, text, jsonb) from public, anon, authenticated;
revoke all on function public.claim_email_notification_delivery(uuid, integer) from public, anon, authenticated;
revoke all on function public.finalize_email_notification_delivery(uuid, uuid, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_stripe_webhook_event_identity(text, text, text, text) to service_role;
grant execute on function public.record_stripe_refund(text, text, text, text, bigint, text, text, text, jsonb) to service_role;
grant execute on function public.record_stripe_checkout_payment(text, text, uuid, text, text, text, bigint, text, jsonb) to service_role;
grant execute on function public.claim_email_notification_delivery(uuid, integer) to service_role;
grant execute on function public.finalize_email_notification_delivery(uuid, uuid, boolean, text, text, text) to service_role;

commit;
-- Keep the Stripe event identity immutable even if future server-side code updates the table directly.
begin;

create or replace function public.enforce_stripe_webhook_identity_immutability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.event_type is distinct from old.event_type then
    raise exception 'Stripe webhook event type is immutable';
  end if;

  if old.object_type is not null and (
    new.object_type is distinct from old.object_type
    or new.object_id is distinct from old.object_id
  ) then
    raise exception 'Stripe webhook object identity is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_stripe_webhook_identity_immutability on public.stripe_webhook_events;
create trigger enforce_stripe_webhook_identity_immutability
before update on public.stripe_webhook_events
for each row execute function public.enforce_stripe_webhook_identity_immutability();

commit;
-- Final Task 5 financial recovery: bind Stripe refund identity before payment lookup
-- and reconcile the persisted Stripe health count without touching its freshness state.
begin;

create or replace function public.claim_stripe_webhook_event_identity(
  p_event_id text,
  p_event_type text,
  p_object_type text,
  p_object_id text
)
returns table(
  accepted boolean,
  already_processed boolean,
  error_code text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.stripe_webhook_events%rowtype;
begin
  if p_event_id is null or length(p_event_id) not between 3 and 255
    or p_event_type is null or length(p_event_type) not between 3 and 120
    or p_object_id is null or length(p_object_id) not between 3 and 255
    or (p_object_type = 'refund' and p_event_type not in ('refund.created', 'refund.updated', 'refund.failed'))
    or (p_object_type = 'checkout_session' and p_event_type not in ('checkout.session.completed', 'checkout.session.async_payment_succeeded'))
    or p_object_type not in ('checkout_session', 'refund')
  then
    raise exception 'Invalid Stripe webhook identity input' using errcode = '22023';
  end if;

  insert into public.stripe_webhook_events (
    event_id, event_type, object_type, object_id, status, attempts
  ) values (
    p_event_id, p_event_type, p_object_type, p_object_id, 'processing', 1
  ) on conflict (event_id) do nothing;

  select * into v_event
  from public.stripe_webhook_events event_row
  where event_row.event_id = p_event_id
  for update;

  if v_event.event_type is distinct from p_event_type then
    return query select false, false, 'event_identity_mismatch'::text;
    return;
  end if;

  if v_event.object_type is null and v_event.object_id is null then
    update public.stripe_webhook_events
    set object_type = p_object_type,
        object_id = p_object_id
    where event_id = p_event_id
    returning * into v_event;
  elsif v_event.object_type is distinct from p_object_type
    or v_event.object_id is distinct from p_object_id
  then
    return query select false, false, 'event_identity_mismatch'::text;
    return;
  end if;

  if v_event.status = 'processed' then
    return query select true, true, null::text;
    return;
  end if;

  update public.stripe_webhook_events
  set status = 'processing',
      attempts = case when v_event.status = 'failed' then v_event.attempts + 1 else v_event.attempts end,
      last_error = null
  where event_id = p_event_id;

  return query select true, false, null::text;
end;
$$;

create or replace function public.record_stripe_refund(
  p_event_id text,
  p_event_type text,
  p_provider_refund_id text,
  p_provider_payment_id text,
  p_amount_cents bigint,
  p_currency text,
  p_status text,
  p_reason text,
  p_raw_payload jsonb
)
returns table(
  ok boolean,
  error_code text,
  order_refunded boolean,
  event_processed boolean,
  source_record_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identity record;
  v_order_id uuid;
begin
  select * into v_identity
  from public.claim_stripe_webhook_event_identity(
    p_event_id, p_event_type, 'refund', p_provider_refund_id
  );

  if v_identity.accepted is not true then
    return query select false, coalesce(v_identity.error_code, 'event_identity_mismatch'), false, false, 0::bigint;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stripe:payment:' || coalesce(p_provider_payment_id, ''), 0));
  select payment_row.order_id into v_order_id
  from public.payments payment_row
  where payment_row.provider = 'stripe'
    and payment_row.provider_payment_id = p_provider_payment_id;

  if not found then
    return query select false, 'payment_not_found', false, false, 0::bigint;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stripe:order:' || v_order_id::text, 0));
  return query select * from public.record_stripe_refund_v012(
    p_event_id, p_event_type, p_provider_refund_id, p_provider_payment_id,
    p_amount_cents, p_currency, p_status, p_reason, p_raw_payload
  );
end;
$$;

create or replace function public.reconcile_stripe_source_health_count()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.data_source_health
  set record_count = public.stripe_source_record_count()
  where source_key = 'stripe';
end;
$$;

select public.reconcile_stripe_source_health_count();

revoke all on function public.claim_stripe_webhook_event_identity(text, text, text, text) from public, anon, authenticated;
revoke all on function public.record_stripe_refund(text, text, text, text, bigint, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.reconcile_stripe_source_health_count() from public, anon, authenticated;
grant execute on function public.claim_stripe_webhook_event_identity(text, text, text, text) to service_role;
grant execute on function public.record_stripe_refund(text, text, text, text, bigint, text, text, text, jsonb) to service_role;
grant execute on function public.reconcile_stripe_source_health_count() to service_role;

commit;
-- Final Task 5 outbox transitions. Terminal notification states cannot be
-- reopened; delivery continues to use lease-bound service-role RPCs.
begin;

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

drop trigger if exists enforce_email_notification_state_machine on public.email_notifications;
create trigger enforce_email_notification_state_machine
before update on public.email_notifications
for each row execute function public.enforce_email_notification_state_machine();

create or replace function public.transition_email_notification(
  p_notification_id uuid,
  p_action text
)
returns table(
  transitioned boolean,
  error_code text,
  notification jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_notification public.email_notifications%rowtype;
begin
  if p_notification_id is null or p_action not in ('requeue', 'skip') then
    raise exception 'Invalid email notification transition input' using errcode = '22023';
  end if;

  select * into v_notification
  from public.email_notifications notification_row
  where notification_row.id = p_notification_id
  for update;

  if not found then
    return query select false, 'notification_not_found'::text, null::jsonb;
    return;
  end if;

  if v_notification.status in ('sent', 'skipped') then
    return query select false, 'terminal_state'::text, to_jsonb(v_notification);
    return;
  end if;

  if v_notification.status = 'sending' then
    return query select false, 'delivery_in_progress'::text, to_jsonb(v_notification);
    return;
  end if;

  if p_action = 'requeue' and v_notification.status = 'failed' then
    update public.email_notifications
    set status = 'queued',
        provider = 'pending',
        last_error = null,
        delivery_lease_token = null,
        delivery_lease_expires_at = null
    where id = p_notification_id
    returning * into v_notification;
  elsif p_action = 'skip' and v_notification.status in ('queued', 'failed') then
    update public.email_notifications
    set status = 'skipped',
        last_error = null,
        delivery_lease_token = null,
        delivery_lease_expires_at = null
    where id = p_notification_id
    returning * into v_notification;
  else
    return query select false, 'invalid_transition'::text, to_jsonb(v_notification);
    return;
  end if;

  return query select true, null::text, to_jsonb(v_notification);
end;
$$;

revoke all on function public.transition_email_notification(uuid, text) from public, anon, authenticated;
grant execute on function public.transition_email_notification(uuid, text) to service_role;

commit;
