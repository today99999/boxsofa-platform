-- Server-issued, one-time consent intents close late-response ordering races.
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
create unique index if not exists idx_analytics_consent_intents_revision
  on public.analytics_consent_intents(intent_revision);
create index if not exists idx_analytics_consent_intents_visitor_expiry
  on public.analytics_consent_intents(visitor_id, expires_at desc);

lock table public.analytics_consents in access exclusive mode;
alter table public.analytics_consents add column if not exists intent_revision bigint;

with ordered as (
  select id, row_number() over (order by revision, created_at, id)::bigint as intent_revision
  from public.analytics_consents
)
update public.analytics_consents consent_row
set intent_revision = ordered.intent_revision
from ordered
where consent_row.id = ordered.id
  and consent_row.intent_revision is null;

alter table public.analytics_consents alter column intent_revision set not null;
create unique index if not exists idx_analytics_consents_intent_revision
  on public.analytics_consents(intent_revision);
create index if not exists idx_analytics_consents_visitor_intent_revision
  on public.analytics_consents(visitor_id, intent_revision desc);

do $$
declare
  v_max_revision bigint;
  v_has_rows boolean;
begin
  select greatest(
    coalesce((select max(intent_revision) from public.analytics_consents), 0),
    coalesce((select max(intent_revision) from public.analytics_consent_intents), 0)
  )
  into v_max_revision;
  v_has_rows := v_max_revision > 0;
  perform setval(
    'public.analytics_consent_intent_revision_seq'::regclass,
    greatest(v_max_revision, 1),
    v_has_rows
  );
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
begin
  if p_visitor_id is null or length(p_visitor_id) not between 8 and 120 then
    raise exception 'Invalid analytics consent intent input' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_visitor_id, 0));

  return query
  insert into public.analytics_consent_intents (visitor_id)
  values (p_visitor_id)
  returning analytics_consent_intents.id, analytics_consent_intents.intent_revision, analytics_consent_intents.expires_at;
end;
$$;

drop function if exists public.record_analytics_consent(text, text, text, text);
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

  select id, consent, revision, intent_revision
  into v_current_id, v_current_consent, v_current_revision, v_current_intent_revision
  from public.analytics_consents
  where visitor_id = p_visitor_id
  order by intent_revision desc
  limit 1
  for update;

  select * into v_intent
  from public.analytics_consent_intents
  where id = p_intent_id
    and visitor_id = p_visitor_id
  for update;

  if not found then
    return query select false, true, v_current_id, v_current_consent, v_current_revision, v_current_intent_revision;
    return;
  end if;

  if v_intent.consumed_at is not null
    or v_intent.expires_at <= now()
    or v_intent.intent_revision <= coalesce(v_current_intent_revision, 0)
  then
    if v_intent.consumed_at is null then
      update public.analytics_consent_intents
      set consumed_at = now(), consumed_result = 'stale'
      where id = v_intent.id;
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

  update public.analytics_consent_intents
  set consumed_at = now(), consumed_result = 'accepted'
  where id = v_intent.id;

  return query select true, false, v_inserted.id, v_inserted.consent, v_inserted.revision, v_inserted.intent_revision;
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
  order by intent_revision desc
  limit 1
  for update;

  if not found or v_consent <> 'analytics' then
    return query select false, false, null::uuid, 'analytics_consent_required'::text;
    return;
  end if;

  insert into public.analytics_events (
    event_key, event_type, created_at, visitor_id, session_id, path, source,
    medium, campaign, referrer_domain, device_type, product_id, product_name,
    value_eur, raw_utm, consent_id
  ) values (
    p_event_key, p_event_type, p_created_at, p_visitor_id, p_session_id, p_path, p_source,
    p_medium, p_campaign, p_referrer_domain, p_device_type, p_product_id, p_product_name,
    p_value_eur, p_raw_utm, v_consent_id
  )
  on conflict (event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return query select true, false, v_consent_id, 'accepted'::text;
    return;
  end if;

  insert into public.data_source_health (
    source_key, source_type, state, last_attempt_at, last_success_at, last_error, record_count
  ) values (
    'website_analytics', 'website', 'current', now(), now(), null, 1
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

revoke all on function public.issue_analytics_consent_intent(text) from public, anon, authenticated;
revoke all on function public.record_analytics_consent(text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.ingest_analytics_event(text, text, timestamptz, text, text, text, text, text, text, text, text, uuid, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.issue_analytics_consent_intent(text) to service_role;
grant execute on function public.record_analytics_consent(text, text, text, text, uuid) to service_role;
grant execute on function public.ingest_analytics_event(text, text, timestamptz, text, text, text, text, text, text, text, text, uuid, text, numeric, jsonb) to service_role;

commit;
