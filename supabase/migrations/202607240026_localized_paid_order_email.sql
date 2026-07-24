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
  alter column locale set default 'en';

alter table public.orders
  alter column locale set not null;

alter table public.orders
  drop constraint if exists orders_locale_check;

alter table public.orders
  add constraint orders_locale_check
  check (locale in ('zh', 'en', 'es', 'fr', 'de'));

commit;

begin;

alter table public.email_notifications
  add column if not exists member_welcome boolean not null default false;

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
  v_was_member boolean := false;
  v_is_member boolean := false;
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
  where order_row.id = p_order_id;

  if v_customer_id is not null then
    select profile_row.is_member
    into v_was_member
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
      select profile_row.is_member
      into v_is_member
      from public.profiles profile_row
      where profile_row.id = v_customer_id;
    end if;

    v_member_welcome := v_customer_id is not null
      and v_was_member is not true
      and v_is_member is true;

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
        member_welcome = v_member_welcome
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

commit;
