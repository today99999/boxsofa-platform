create extension if not exists "pgcrypto";

create type public.admin_role as enum ('owner', 'service');
create type public.order_status as enum (
  'pending_confirm',
  'pending_payment',
  'paid',
  'shipped',
  'completed',
  'cancelled',
  'refund'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  role public.admin_role,
  total_paid_eur numeric(12, 2) not null default 0,
  is_member boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_styles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('single', 'double', 'triple', 'combo')),
  description text,
  detail_image_url text,
  video_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  style_id uuid not null references public.product_styles(id) on delete cascade,
  sku text not null unique,
  slug text not null unique,
  name_zh text not null,
  name_en text,
  name_es text,
  color_zh text not null,
  category text not null check (category in ('single', 'double', 'triple', 'combo')),
  price_eur numeric(12, 2) not null check (price_eur >= 0),
  compare_at_price_eur numeric(12, 2),
  stock integer not null default 0 check (stock >= 0),
  main_image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  style_id uuid references public.product_styles(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video', 'detail_image')),
  url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint product_or_style_media check (
    product_id is not null or style_id is not null
  )
);

create table public.addresses (
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
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references public.profiles(id),
  customer_email text not null,
  status public.order_status not null default 'pending_confirm',
  subtotal_eur numeric(12, 2) not null,
  discount_eur numeric(12, 2) not null default 0,
  shipping_eur numeric(12, 2) not null default 0,
  total_eur numeric(12, 2) not null,
  payment_provider text,
  payment_reference text,
  paid_at timestamptz,
  recipient text not null,
  phone text not null,
  address_snapshot jsonb not null,
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  sku text not null,
  name_snapshot text not null,
  image_snapshot text,
  quantity integer not null check (quantity > 0),
  unit_price_eur numeric(12, 2) not null,
  line_total_eur numeric(12, 2) not null
);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  carrier text not null,
  tracking_number text not null,
  tracking_url text,
  shipped_at timestamptz,
  estimated_days text not null default '23-30 天',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles(id),
  customer_name text,
  customer_email text,
  status text not null default 'open' check (status in ('open', 'closed')),
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer', 'owner', 'service', 'system')),
  sender_id uuid references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.product_styles enable row level security;
alter table public.products enable row level security;
alter table public.product_media enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.shipments enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role in ('owner', 'service')
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'owner'
  );
$$;

create policy "public can read active styles"
on public.product_styles for select
using (is_active = true or public.is_admin());

create policy "public can read active products"
on public.products for select
using (is_active = true or public.is_admin());

create policy "public can read media"
on public.product_media for select
using (true);

create policy "owners manage catalog"
on public.product_styles for all
using (public.is_owner())
with check (public.is_owner());

create policy "owners manage products"
on public.products for all
using (public.is_owner())
with check (public.is_owner());

create policy "owners manage media"
on public.product_media for all
using (public.is_owner())
with check (public.is_owner());

create policy "users read own profile"
on public.profiles for select
using (id = auth.uid() or public.is_admin());

create policy "users update own profile"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "admins read orders"
on public.orders for select
using (public.is_admin());

create policy "customers read own orders"
on public.orders for select
using (customer_id = auth.uid());

create policy "admins update orders"
on public.orders for update
using (public.is_admin())
with check (public.is_admin());

create policy "admins read order items"
on public.order_items for select
using (public.is_admin() or exists (
  select 1 from public.orders
  where orders.id = order_items.order_id and orders.customer_id = auth.uid()
));

create policy "admins manage shipments"
on public.shipments for all
using (public.is_admin())
with check (public.is_admin());

create policy "customers read own shipments"
on public.shipments for select
using (exists (
  select 1 from public.orders
  where orders.id = shipments.order_id and orders.customer_id = auth.uid()
));

create policy "chat participants read threads"
on public.chat_threads for select
using (public.is_admin() or customer_id = auth.uid());

create policy "chat participants read messages"
on public.chat_messages for select
using (public.is_admin() or exists (
  select 1 from public.chat_threads
  where chat_threads.id = chat_messages.thread_id and chat_threads.customer_id = auth.uid()
));
