begin;

alter table public.orders
  add column if not exists locale text;

update public.orders
set locale = case when profiles.preferred_locale in ('zh', 'en', 'es', 'fr', 'de') then profiles.preferred_locale else 'en' end
from public.profiles as profiles
where orders.customer_id = profiles.id
  and orders.locale is null;

update public.orders
set locale = 'en'
where locale is null;

alter table public.orders
  alter column locale drop default;

alter table public.orders
  alter column locale set not null;

alter table public.orders
  drop constraint if exists orders_locale_check;

alter table public.orders
  add constraint orders_locale_check
  check (locale in ('zh', 'en', 'es', 'fr', 'de'));

commit;

begin;

alter table public.profiles
  add column if not exists membership_welcomed_at timestamptz;

alter table public.email_notifications
  add column if not exists member_welcome boolean not null default false;

alter table public.email_notifications
  add column if not exists automatic_delivery_eligible boolean not null default false,
  add column if not exists automatic_quarantined_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists first_provider_attempt_at timestamptz;

update public.email_notifications
set first_provider_attempt_at = created_at
where first_provider_attempt_at is null
  and attempts > 0
  and status in ('queued', 'failed', 'sending');

update public.profiles profile_row
set membership_welcomed_at = coalesce(
  (
    select min(notification_row.created_at)
    from public.email_notifications notification_row
    join public.orders order_row on order_row.id = notification_row.order_id
    where order_row.customer_id = profile_row.id
      and notification_row.member_welcome
  ),
  profile_row.member_since,
  case when profile_row.is_member then profile_row.created_at else null end
)
where profile_row.membership_welcomed_at is null
  and (
    profile_row.is_member
    or profile_row.member_since is not null
    or exists (
      select 1
      from public.email_notifications notification_row
      join public.orders order_row on order_row.id = notification_row.order_id
      where order_row.customer_id = profile_row.id
        and notification_row.member_welcome
    )
  );

do $$
begin
  if exists (
    select 1
    from public.payments
    where provider = 'offline'
      and status = 'confirmed_offline'
    group by order_id
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce offline payment idempotency while duplicate confirmed payments exist.';
  end if;
end;
$$;

create unique index if not exists idx_payments_offline_order_unique
  on public.payments(order_id)
  where provider = 'offline'
    and status = 'confirmed_offline';

create index if not exists idx_email_notifications_automatic_delivery
  on public.email_notifications(
    automatic_delivery_eligible,
    event,
    automatic_quarantined_at,
    attempts,
    next_attempt_at,
    created_at,
    id
  );

create or replace function public.enforce_order_communication_snapshot()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.customer_name is distinct from old.customer_name
    or new.customer_email is distinct from old.customer_email
    or new.locale is distinct from old.locale
  then
    raise exception 'Order communication snapshot is immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_order_communication_snapshot on public.orders;
create trigger enforce_order_communication_snapshot
before update of customer_name, customer_email, locale on public.orders
for each row execute function public.enforce_order_communication_snapshot();

create or replace function public.enforce_membership_welcome_marker()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.membership_welcomed_at is not null
    and new.membership_welcomed_at is distinct from old.membership_welcomed_at
  then
    raise exception 'Membership welcome marker is immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_membership_welcome_marker on public.profiles;
create trigger enforce_membership_welcome_marker
before update of membership_welcomed_at on public.profiles
for each row execute function public.enforce_membership_welcome_marker();

revoke all on function public.enforce_order_communication_snapshot() from public, anon, authenticated;
revoke all on function public.enforce_membership_welcome_marker() from public, anon, authenticated;

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

  perform 1
  from public.profiles profile_row
  where profile_row.id = customer
  for update;

  if not found then
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
declare
  v_customer uuid;
begin
  for v_customer in
    select distinct candidate.customer_id
    from (
      select case when tg_op = 'INSERT' then null::uuid else old.customer_id end as customer_id
      union all
      select case when tg_op = 'DELETE' then null::uuid else new.customer_id end
    ) candidate
    where candidate.customer_id is not null
    order by candidate.customer_id
  loop
    perform public.refresh_customer_membership(v_customer);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.build_payment_confirmed_email(
  p_locale text,
  p_customer_name text,
  p_order_number text,
  p_member_welcome boolean
)
returns table(
  subject text,
  preview_text text,
  body_text text
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_locale text := case when p_locale in ('zh', 'en', 'es', 'fr', 'de') then p_locale else 'en' end;
  v_customer_name text := coalesce(p_customer_name, '');
  v_order_number text := coalesce(p_order_number, '');
begin
  case v_locale
    when 'zh' then
      subject := '感谢您的购买｜BoxSofa 订单 ' || v_order_number;
      preview_text := '感谢您在 boxsofa.eu 购买我们的产品。您的订单 ' || v_order_number || ' 已支付成功，我们会尽快为您安排发货。';
      body_text := '您好，' || v_customer_name || '：'
        || E'\n\n感谢您在 boxsofa.eu 购买我们的产品。您的订单 ' || v_order_number || ' 已支付成功，我们会尽快为您安排发货。'
        || case when p_member_welcome then E'\n\n感谢您成为 BoxSofa 会员！您今后符合条件的订单可享受 10% 会员折扣。' else '' end
        || E'\n\n此致\nBoxSofa 团队';
    when 'es' then
      subject := 'Gracias por tu compra | Pedido BoxSofa ' || v_order_number;
      preview_text := 'Gracias por comprar en boxsofa.eu. Hemos confirmado el pago de tu pedido ' || v_order_number || ' y prepararemos el envío lo antes posible.';
      body_text := 'Hola, ' || v_customer_name || ':'
        || E'\n\nGracias por comprar en boxsofa.eu. Hemos confirmado el pago de tu pedido ' || v_order_number || ' y prepararemos el envío lo antes posible.'
        || case when p_member_welcome then E'\n\n¡También queremos darte las gracias por hacerte miembro de BoxSofa! A partir de ahora podrás disfrutar de un 10 % de descuento para miembros en futuros pedidos que cumplan las condiciones.' else '' end
        || E'\n\nUn cordial saludo,\nEl equipo de BoxSofa';
    when 'fr' then
      subject := 'Merci pour votre achat | Commande BoxSofa ' || v_order_number;
      preview_text := 'Merci pour votre achat sur boxsofa.eu. Le paiement de votre commande ' || v_order_number || ' a bien été confirmé et nous organiserons son expédition dans les meilleurs délais.';
      body_text := 'Bonjour ' || v_customer_name || ','
        || E'\n\nMerci pour votre achat sur boxsofa.eu. Le paiement de votre commande ' || v_order_number || ' a bien été confirmé et nous organiserons son expédition dans les meilleurs délais.'
        || case when p_member_welcome then E'\n\nNous vous remercions également d’être devenu membre de BoxSofa ! Vous pouvez désormais bénéficier d’une remise membre de 10 % sur vos prochaines commandes éligibles.' else '' end
        || E'\n\nCordialement,\nL’équipe BoxSofa';
    when 'de' then
      subject := 'Vielen Dank für Ihren Einkauf | BoxSofa-Bestellung ' || v_order_number;
      preview_text := 'vielen Dank für Ihren Einkauf bei boxsofa.eu. Die Zahlung für Ihre Bestellung ' || v_order_number || ' wurde bestätigt. Wir werden den Versand so schnell wie möglich veranlassen.';
      body_text := 'Hallo ' || v_customer_name || ','
        || E'\n\nvielen Dank für Ihren Einkauf bei boxsofa.eu. Die Zahlung für Ihre Bestellung ' || v_order_number || ' wurde bestätigt. Wir werden den Versand so schnell wie möglich veranlassen.'
        || case when p_member_welcome then E'\n\nAußerdem bedanken wir uns herzlich dafür, dass Sie BoxSofa-Mitglied geworden sind! Bei zukünftigen berechtigten Bestellungen erhalten Sie nun 10 % Mitgliederrabatt.' else '' end
        || E'\n\nFreundliche Grüße\nIhr BoxSofa-Team';
    else
      subject := 'Thank you for your purchase | BoxSofa order ' || v_order_number;
      preview_text := 'Thank you for purchasing from boxsofa.eu. Payment for your order ' || v_order_number || ' has been confirmed, and we will arrange shipment as soon as possible.';
      body_text := 'Hello ' || v_customer_name || ','
        || E'\n\nThank you for purchasing from boxsofa.eu. Payment for your order ' || v_order_number || ' has been confirmed, and we will arrange shipment as soon as possible.'
        || case when p_member_welcome then E'\n\nWe would also like to thank you for becoming a BoxSofa member! You can now receive a 10% member discount on eligible future orders.' else '' end
        || E'\n\nKind regards,\nThe BoxSofa Team';
  end case;

  return next;
end;
$$;

revoke all on function public.build_payment_confirmed_email(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.build_payment_confirmed_email(text, text, text, boolean) to service_role, postgres;

create or replace function public.sanitize_email_delivery_error(p_error text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when length(coalesce(p_error, '')) <= 64
      and coalesce(p_error, '') ~ '^email_provider_(not_configured|unsupported|request_failed|failed|ambiguity_window_expired|http_error:[1-5][0-9]{2})$'
    then p_error
    else 'email_provider_failed'
  end
$$;

update public.email_notifications
set last_error = public.sanitize_email_delivery_error(last_error)
where status = 'failed'
  and last_error is not null;

create or replace function public.sanitize_email_notification_audit_payload(p_payload jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'notificationId', coalesce(p_payload->'notificationId', p_payload->'id'),
    'orderNumber', coalesce(p_payload->'orderNumber', p_payload->'order_number'),
    'event', p_payload->'event',
    'status', p_payload->'status',
    'attempts', p_payload->'attempts',
    'provider', to_jsonb(case
      when p_payload->>'provider' in ('pending', 'resend', 'not_configured')
        then p_payload->>'provider'
      else 'unknown'
    end),
    'lastError', case when coalesce(p_payload->>'lastError', p_payload->>'last_error') is null then null else
      to_jsonb(public.sanitize_email_delivery_error(coalesce(p_payload->>'lastError', p_payload->>'last_error')))
    end,
    'sentAt', coalesce(p_payload->'sentAt', p_payload->'sent_at'),
    'createdAt', coalesce(p_payload->'createdAt', p_payload->'created_at'),
    'updatedAt', coalesce(p_payload->'updatedAt', p_payload->'updated_at')
  ));
$$;

update public.admin_audit_log
set before_data = case when before_data is null then null else public.sanitize_email_notification_audit_payload(before_data) end,
    after_data = case when after_data is null then null else public.sanitize_email_notification_audit_payload(after_data) end
where entity_type = 'email_notification';

update public.admin_audit_log
set before_data = case when before_data is null then null else jsonb_strip_nulls(jsonb_build_object(
      'provider', to_jsonb(case
        when before_data->>'provider' in ('pending', 'resend', 'not_configured')
          then before_data->>'provider'
        else 'unknown'
      end),
      'status', to_jsonb(case when action = 'email_test_sent' then 'sent' else 'failed' end),
      'lastError', case when action = 'email_test_failed' then to_jsonb('email_provider_failed'::text) else null end,
      'sentAt', coalesce(before_data->'sentAt', before_data->'sent_at'),
      'createdAt', coalesce(before_data->'createdAt', before_data->'created_at'),
      'updatedAt', coalesce(before_data->'updatedAt', before_data->'updated_at')
    )) end,
    after_data = case when after_data is null then null else jsonb_strip_nulls(jsonb_build_object(
      'provider', to_jsonb(case
        when after_data->>'provider' in ('pending', 'resend', 'not_configured')
          then after_data->>'provider'
        else 'unknown'
      end),
      'status', to_jsonb(case when action = 'email_test_sent' then 'sent' else 'failed' end),
      'lastError', case when action = 'email_test_failed' then to_jsonb('email_provider_failed'::text) else null end,
      'sentAt', coalesce(after_data->'sentAt', after_data->'sent_at'),
      'createdAt', coalesce(after_data->'createdAt', after_data->'created_at'),
      'updatedAt', coalesce(after_data->'updatedAt', after_data->'updated_at')
    )) end
where entity_type = 'email_provider';

drop function public.sanitize_email_notification_audit_payload(jsonb);

drop function if exists public.claim_email_notification_delivery(uuid, integer);

create function public.claim_email_notification_delivery(
  p_notification_id uuid,
  p_lease_seconds integer default 300,
  p_automatic boolean default false
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

  if p_automatic then
    update public.email_notifications notification_row
    set status = 'failed',
        automatic_quarantined_at = coalesce(notification_row.automatic_quarantined_at, now()),
        next_attempt_at = null,
        delivery_lease_token = null,
        delivery_lease_expires_at = null,
        last_error = 'email_provider_ambiguity_window_expired'
    where notification_row.id = p_notification_id
      and notification_row.event = 'payment_confirmed'
      and notification_row.automatic_delivery_eligible
      and notification_row.automatic_quarantined_at is null
      and notification_row.first_provider_attempt_at <= now() - interval '24 hours'
      and notification_row.status in ('queued', 'failed', 'sending');
    if found then
      return query select false, null::uuid, null::jsonb;
      return;
    end if;
  end if;

  update public.email_notifications notification_row
  set status = 'sending',
      attempts = notification_row.attempts + 1,
      first_provider_attempt_at = coalesce(notification_row.first_provider_attempt_at, now()),
      delivery_lease_token = v_lease_token,
      delivery_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      next_attempt_at = null,
      automatic_quarantined_at = case
        when p_automatic and notification_row.attempts + 1 >= 5
          then coalesce(notification_row.automatic_quarantined_at, now())
        else notification_row.automatic_quarantined_at
      end,
      last_error = null
  where notification_row.id = p_notification_id
    and (
      notification_row.status in ('queued', 'failed')
      or (
        notification_row.status = 'sending'
        and (notification_row.delivery_lease_expires_at is null or notification_row.delivery_lease_expires_at <= now())
      )
    )
    and (
      not p_automatic
      or (
        notification_row.event = 'payment_confirmed'
        and notification_row.automatic_delivery_eligible
        and notification_row.automatic_quarantined_at is null
        and notification_row.attempts < 5
        and (
          notification_row.status = 'sending'
          or notification_row.next_attempt_at is null
          or notification_row.next_attempt_at <= now()
        )
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
      provider = left(trim(p_provider), 64),
      provider_message_id = case
        when p_succeeded then left(p_provider_message_id, 255)
        else notification_row.provider_message_id
      end,
      last_error = case
        when p_succeeded then null
        else public.sanitize_email_delivery_error(p_error)
      end,
      sent_at = case
        when p_succeeded then coalesce(notification_row.sent_at, now())
        else notification_row.sent_at
      end,
      next_attempt_at = case
        when p_succeeded or notification_row.attempts >= 5 then null
        else now() + make_interval(
          secs => least(
            3600,
            (300 * power(2::numeric, greatest(notification_row.attempts - 1, 0)))::integer
          )
        )
      end,
      automatic_quarantined_at = case
        when p_succeeded then null
        when notification_row.attempts >= 5
          then coalesce(notification_row.automatic_quarantined_at, now())
        else null
      end,
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

create or replace function public.enforce_email_notification_state_machine()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status in ('sent', 'skipped') then
    raise exception 'Email notification terminal state cannot change' using errcode = 'P0001';
  end if;

  if old.status = 'sending'
    and new.status not in ('sending', 'sent', 'failed')
    and not (
      new.status in ('queued', 'skipped')
      and (
        old.delivery_lease_expires_at is null
        or old.delivery_lease_expires_at <= now()
      )
    )
  then
    raise exception 'An email delivery lease must be finalized or recovered' using errcode = 'P0001';
  end if;

  if old.status in ('queued', 'failed') and new.status = 'sent' then
    raise exception 'An email notification must be claimed before it can be sent' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

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

  if v_notification.status = 'sending'
    and v_notification.delivery_lease_expires_at > now()
  then
    return query select false, 'delivery_in_progress'::text, to_jsonb(v_notification);
    return;
  end if;

  if p_action = 'requeue'
    and (
      v_notification.status = 'failed'
      or (
        v_notification.status = 'sending'
        and (
          v_notification.delivery_lease_expires_at is null
          or v_notification.delivery_lease_expires_at <= now()
        )
      )
    )
  then
    update public.email_notifications
    set status = 'queued',
        provider = 'pending',
        attempts = 0,
        last_error = null,
        delivery_lease_token = null,
        delivery_lease_expires_at = null,
        next_attempt_at = now(),
        first_provider_attempt_at = null,
        automatic_quarantined_at = null,
        automatic_delivery_eligible = event = 'payment_confirmed'
    where id = p_notification_id
    returning * into v_notification;
  elsif p_action = 'skip'
    and (
      v_notification.status in ('queued', 'failed')
      or (
        v_notification.status = 'sending'
        and (
          v_notification.delivery_lease_expires_at is null
          or v_notification.delivery_lease_expires_at <= now()
        )
      )
    )
  then
    update public.email_notifications
    set status = 'skipped',
        last_error = null,
        delivery_lease_token = null,
        delivery_lease_expires_at = null,
        next_attempt_at = null,
        automatic_quarantined_at = null
    where id = p_notification_id
    returning * into v_notification;
  else
    return query select false, 'invalid_transition'::text, to_jsonb(v_notification);
    return;
  end if;

  return query select true, null::text, to_jsonb(v_notification);
end;
$$;

revoke all on function public.sanitize_email_delivery_error(text) from public, anon, authenticated;
revoke all on function public.claim_email_notification_delivery(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.finalize_email_notification_delivery(uuid, uuid, boolean, text, text, text) from public, anon, authenticated;
revoke all on function public.transition_email_notification(uuid, text) from public, anon, authenticated;
grant execute on function public.sanitize_email_delivery_error(text) to service_role, postgres;
grant execute on function public.claim_email_notification_delivery(uuid, integer, boolean) to service_role;
grant execute on function public.finalize_email_notification_delivery(uuid, uuid, boolean, text, text, text) to service_role;
grant execute on function public.transition_email_notification(uuid, text) to service_role;

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
  v_result record;
  v_email record;
  v_customer_id uuid;
  v_order_locale text;
  v_customer_name text;
  v_order_number text;
  v_member_welcome boolean := false;
  v_notification_updated integer := 0;
begin
  -- Preserve the payment -> order -> source-health acquisition order used by refunds.
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

  select
    order_row.customer_id,
    order_row.locale,
    order_row.customer_name,
    order_row.order_number
  into
    v_customer_id,
    v_order_locale,
    v_customer_name,
    v_order_number
  from public.orders order_row
  where order_row.id = p_order_id
  for update;

  if v_customer_id is not null then
    perform 1
    from public.profiles profile_row
    where profile_row.id = v_customer_id
    for update;
  end if;

  select * into v_result
  from public.record_stripe_checkout_payment_v012(
    p_event_id, p_event_type, p_order_id, p_order_number, p_provider_payment_id,
    p_session_id, p_amount_cents, p_currency, p_raw_payload
  );

  if v_result.payment_confirmed is true then
    if v_customer_id is not null then
      update public.profiles profile_row
      set membership_welcomed_at = coalesce(profile_row.member_since, now())
      where profile_row.id = v_customer_id
        and profile_row.is_member
        and profile_row.membership_welcomed_at is null
      returning true into v_member_welcome;
      if not found then
        v_member_welcome := false;
      end if;
    end if;

    select * into v_email
    from public.build_payment_confirmed_email(
      v_order_locale,
      v_customer_name,
      v_order_number,
      v_member_welcome
    );

    update public.email_notifications
    set subject = v_email.subject,
        preview_text = v_email.preview_text,
        body_text = v_email.body_text,
        member_welcome = v_member_welcome,
        automatic_delivery_eligible = true,
        automatic_quarantined_at = null,
        next_attempt_at = now()
    where order_id = p_order_id
      and event = 'payment_confirmed';

    get diagnostics v_notification_updated = row_count;
    if v_notification_updated <> 1 then
      raise exception 'Paid-order notification snapshot is missing' using errcode = 'P0001';
    end if;
  end if;

  return query select
    v_result.ok,
    v_result.error_code,
    v_result.event_processed,
    v_result.payment_confirmed,
    v_result.email_queued,
    v_result.source_record_count;
end;
$$;

revoke all on function public.record_stripe_checkout_payment(text, text, uuid, text, text, text, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_stripe_checkout_payment(text, text, uuid, text, text, text, bigint, text, jsonb) to service_role;

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
  v_customer_id uuid;
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
  perform pg_advisory_xact_lock(hashtextextended('stripe:source-health', 0));

  select order_row.customer_id
  into v_customer_id
  from public.orders order_row
  where order_row.id = v_order_id
  for update;

  if v_customer_id is not null then
    perform 1
    from public.profiles profile_row
    where profile_row.id = v_customer_id
    for update;
  end if;

  return query select * from public.record_stripe_refund_v012(
    p_event_id, p_event_type, p_provider_refund_id, p_provider_payment_id,
    p_amount_cents, p_currency, p_status, p_reason, p_raw_payload
  );
end;
$$;

create or replace function public.record_offline_order_payment(
  p_order_id uuid,
  p_order_number text,
  p_confirmed_by uuid,
  p_payment_method_note text,
  p_target_status text,
  p_carrier text,
  p_tracking_number text,
  p_shipped_subject text default null,
  p_shipped_preview_text text default null,
  p_shipped_body_text text default null
)
returns table(
  ok boolean,
  error_code text,
  payment_confirmed boolean,
  email_queued boolean,
  member_welcome boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_email record;
  v_stock_after integer;
  v_member_welcome boolean := false;
  v_email_inserted integer := 0;
  v_shipment_id uuid;
  v_offline_payment_reference text;
begin
  if p_order_id is null
    or p_order_number is null
    or length(p_order_number) not between 3 and 120
    or p_confirmed_by is null
    or p_target_status not in ('paid_confirmed', 'shipped')
    or length(coalesce(p_payment_method_note, '')) > 1000
    or (
      p_target_status = 'shipped'
      and (
        coalesce(nullif(trim(p_carrier), ''), '') = ''
        or coalesce(nullif(trim(p_tracking_number), ''), '') = ''
        or coalesce(nullif(trim(p_shipped_subject), ''), '') = ''
        or coalesce(nullif(trim(p_shipped_preview_text), ''), '') = ''
        or coalesce(nullif(trim(p_shipped_body_text), ''), '') = ''
        or length(p_shipped_subject) > 500
        or length(p_shipped_preview_text) > 1000
        or length(p_shipped_body_text) > 20000
      )
    )
  then
    raise exception 'Invalid offline payment input' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('paid-order:' || p_order_id::text, 0));

  select * into v_order
  from public.orders order_row
  where order_row.id = p_order_id
  for update;

  if not found or v_order.order_number <> p_order_number then
    return query select false, 'order_not_found', false, false, false;
    return;
  end if;

  if v_order.payment_status = 'confirmed_offline' then
    if not exists (
      select 1
      from public.payments payment_row
      where payment_row.order_id = v_order.id
        and payment_row.provider = 'offline'
        and payment_row.status = 'confirmed_offline'
    ) then
      return query select false, 'offline_payment_state_incomplete', false, false, false;
      return;
    end if;

    if v_order.status in ('cancelled', 'refunded') then
      return query select false, 'order_payment_conflict', false, false, false;
      return;
    end if;

    if p_target_status = 'shipped' then
      update public.orders
      set status = case
            when status = 'completed' then status
            else 'shipped'::public.order_status
          end,
          payment_method_note = coalesce(
            nullif(trim(p_payment_method_note), ''),
            payment_method_note
          )
      where id = v_order.id;

      select shipment_row.id
      into v_shipment_id
      from public.shipments shipment_row
      where shipment_row.order_id = v_order.id
      order by shipment_row.created_at, shipment_row.id
      limit 1
      for update;

      if found then
        update public.shipments
        set status = 'shipped',
            carrier = trim(p_carrier),
            tracking_number = trim(p_tracking_number),
            shipped_at = coalesce(shipped_at, now()),
            created_by = p_confirmed_by
        where id = v_shipment_id;
      else
        insert into public.shipments (
          order_id, status, carrier, tracking_number, shipped_at, created_by
        ) values (
          v_order.id, 'shipped', trim(p_carrier), trim(p_tracking_number), now(), p_confirmed_by
        );
      end if;

      insert into public.email_notifications (
        order_id, order_number, customer_email, event, subject, preview_text,
        body_text, member_welcome, automatic_delivery_eligible, next_attempt_at,
        provider, status, attempts
      ) values (
        v_order.id, v_order.order_number, v_order.customer_email, 'order_shipped',
        p_shipped_subject, p_shipped_preview_text, p_shipped_body_text, false,
        false, null, 'pending', 'queued', 0
      )
      on conflict (order_id, event) where order_id is not null do nothing;
    end if;

    select notification_row.member_welcome
    into v_member_welcome
    from public.email_notifications notification_row
    where notification_row.order_id = v_order.id
      and notification_row.event = 'payment_confirmed';

    return query select true, null::text, false, false, coalesce(v_member_welcome, false);
    return;
  end if;

  if v_order.payment_status in ('paid', 'refunded')
    or v_order.status in ('cancelled', 'refunded')
  then
    return query select false, 'order_payment_conflict', false, false, false;
    return;
  end if;

  if v_order.customer_id is not null then
    perform 1
    from public.profiles profile_row
    where profile_row.id = v_order.customer_id
    for update;
  end if;

  if p_target_status = 'shipped' then
    insert into public.email_notifications (
      order_id, order_number, customer_email, event, subject, preview_text,
      body_text, member_welcome, automatic_delivery_eligible, next_attempt_at,
      provider, status, attempts
    ) values (
      v_order.id, v_order.order_number, v_order.customer_email, 'order_shipped',
      p_shipped_subject, p_shipped_preview_text, p_shipped_body_text, false,
      false, null, 'pending', 'queued', 0
    )
    on conflict (order_id, event) where order_id is not null do nothing;
  end if;

  for v_item in
    select order_item.product_id, sum(order_item.quantity)::integer as quantity
    from public.order_items order_item
    where order_item.order_id = v_order.id
      and order_item.product_id is not null
    group by order_item.product_id
    order by order_item.product_id
  loop
    update public.products
    set stock = stock - v_item.quantity,
        reserved_stock = reserved_stock - v_item.quantity
    where id = v_item.product_id
      and stock >= v_item.quantity
      and reserved_stock >= v_item.quantity
    returning stock into v_stock_after;

    if not found then
      raise exception 'Offline payment inventory is unavailable' using errcode = 'P0001';
    end if;

    insert into public.inventory_movements (
      product_id, movement_type, quantity_delta, stock_after, reason, order_id, created_by
    ) values (
      v_item.product_id,
      'payment_confirmed',
      -v_item.quantity,
      v_stock_after,
      'Offline payment confirmed',
      v_order.id,
      p_confirmed_by
    );
  end loop;

  v_offline_payment_reference := 'offline:' || v_order.id::text;
  insert into public.payments (
    order_id,
    provider,
    provider_payment_id,
    status,
    amount_eur,
    currency,
    confirmed_by,
    confirmed_at,
    raw_payload
  ) values (
    v_order.id,
    'offline',
    v_offline_payment_reference,
    'confirmed_offline',
    v_order.total_eur,
    'EUR',
    p_confirmed_by,
    now(),
    jsonb_build_object('source', 'admin_confirmation')
  );

  update public.orders
  set status = p_target_status::public.order_status,
      payment_status = 'confirmed_offline',
      payment_provider = 'offline',
      payment_reference = v_offline_payment_reference,
      payment_method_note = coalesce(nullif(trim(p_payment_method_note), ''), 'Offline payment'),
      paid_at = coalesce(paid_at, now()),
      paid_confirmed_by = p_confirmed_by
  where id = v_order.id;

  if p_target_status = 'shipped' then
    select shipment_row.id
    into v_shipment_id
    from public.shipments shipment_row
    where shipment_row.order_id = v_order.id
    order by shipment_row.created_at, shipment_row.id
    limit 1
    for update;

    if found then
      update public.shipments
      set status = 'shipped',
          carrier = trim(p_carrier),
          tracking_number = trim(p_tracking_number),
          shipped_at = coalesce(shipped_at, now()),
          created_by = p_confirmed_by
      where id = v_shipment_id;
    else
      insert into public.shipments (
        order_id, status, carrier, tracking_number, shipped_at, created_by
      ) values (
        v_order.id, 'shipped', trim(p_carrier), trim(p_tracking_number), now(), p_confirmed_by
      );
    end if;
  end if;

  if v_order.customer_id is not null then
    update public.profiles profile_row
    set membership_welcomed_at = coalesce(profile_row.member_since, now())
    where profile_row.id = v_order.customer_id
      and profile_row.is_member
      and profile_row.membership_welcomed_at is null
    returning true into v_member_welcome;
    if not found then
      v_member_welcome := false;
    end if;
  end if;

  select * into v_email
  from public.build_payment_confirmed_email(
    v_order.locale,
    v_order.customer_name,
    v_order.order_number,
    v_member_welcome
  );

  insert into public.email_notifications (
    order_id,
    order_number,
    customer_email,
    event,
    subject,
    preview_text,
    body_text,
    member_welcome,
    automatic_delivery_eligible,
    next_attempt_at,
    provider,
    status,
    attempts
  ) values (
    v_order.id,
    v_order.order_number,
    v_order.customer_email,
    'payment_confirmed',
    v_email.subject,
    v_email.preview_text,
    v_email.body_text,
    v_member_welcome,
    true,
    now(),
    'pending',
    'queued',
    0
  )
  on conflict (order_id, event) where order_id is not null do nothing;

  get diagnostics v_email_inserted = row_count;
  if v_email_inserted <> 1 then
    raise exception 'Paid-order notification snapshot already exists' using errcode = 'P0001';
  end if;

  return query select true, null::text, true, true, v_member_welcome;
end;
$$;

revoke all on function public.record_stripe_refund(text, text, text, text, bigint, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_offline_order_payment(uuid, text, uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_stripe_refund(text, text, text, text, bigint, text, text, text, jsonb) to service_role;
grant execute on function public.record_offline_order_payment(uuid, text, uuid, text, text, text, text, text, text, text) to service_role;

commit;
