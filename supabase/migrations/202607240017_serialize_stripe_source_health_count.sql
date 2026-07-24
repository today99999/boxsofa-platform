-- Serialize every effective writer of Stripe source-health record_count.
--
-- Concurrency contract: after a payment/order flow holds its business locks, it
-- takes this one transaction lock before delegating to the financial writer.
-- The delegated v012 functions then count transaction-visible Stripe payments
-- and refunds and write data_source_health while this lock remains held.
begin;

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

  perform pg_advisory_xact_lock(hashtextextended('stripe:source-health', 0));
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

  -- All payment/order business locks precede the shared source-health lock.
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
  perform pg_advisory_xact_lock(hashtextextended('stripe:source-health', 0));
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
  -- Keep the payment -> order -> source-health acquisition order used by refunds.
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

  perform pg_advisory_xact_lock(hashtextextended('stripe:source-health', 0));
  return query select * from public.record_stripe_checkout_payment_v012(
    p_event_id, p_event_type, p_order_id, p_order_number, p_provider_payment_id,
    p_session_id, p_amount_cents, p_currency, p_raw_payload
  );
end;
$$;

-- Reconciliation takes only the shared health lock, never an order/payment lock.
create or replace function public.reconcile_stripe_source_health_count()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('stripe:source-health', 0));
  update public.data_source_health
  set record_count = public.stripe_source_record_count()
  where source_key = 'stripe';
end;
$$;

revoke all on function public.mark_stripe_webhook_failure(text, text, text) from public, anon, authenticated;
revoke all on function public.record_stripe_refund(text, text, text, text, bigint, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_stripe_checkout_payment(text, text, uuid, text, text, text, bigint, text, jsonb) from public, anon, authenticated;
revoke all on function public.reconcile_stripe_source_health_count() from public, anon, authenticated;
grant execute on function public.mark_stripe_webhook_failure(text, text, text) to service_role;
grant execute on function public.record_stripe_refund(text, text, text, text, bigint, text, text, text, jsonb) to service_role;
grant execute on function public.record_stripe_checkout_payment(text, text, uuid, text, text, text, bigint, text, jsonb) to service_role;
grant execute on function public.reconcile_stripe_source_health_count() to service_role;

commit;
