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

  -- Pre-013 rows did not store object identity. Bind that historical hole exactly
  -- once while holding the event row lock; a populated identity is immutable.
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
  -- Claiming the signed Stripe event identity happens before payment lookup. A
  -- refund that arrives before its payment can therefore be safely retried.
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
    -- Do not fail the event: a later Stripe retry must be able to resume it.
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

-- Reconcile only the derived count. Existing source state, timestamps, errors,
-- and metadata remain the record of the last real Stripe synchronization.
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
