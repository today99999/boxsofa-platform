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
