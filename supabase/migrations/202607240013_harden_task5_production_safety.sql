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
