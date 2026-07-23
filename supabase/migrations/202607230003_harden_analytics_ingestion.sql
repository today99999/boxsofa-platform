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
begin
  if p_bucket_key !~ '^[a-f0-9]{64}$' or p_limit < 1 or p_limit > 10000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid analytics rate limit input' using errcode = '22023';
  end if;

  v_window := make_interval(secs => p_window_seconds);
  select * into v_bucket
  from public.analytics_rate_limit_buckets
  where bucket_key = p_bucket_key
  for update;

  if not found then
    insert into public.analytics_rate_limit_buckets (bucket_key, window_started_at, request_count)
    values (p_bucket_key, now(), 1);
    return query select true, 0;
    return;
  end if;

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

revoke all on function public.consume_analytics_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.ingest_analytics_event(text, text, timestamptz, text, text, text, text, text, text, text, text, uuid, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.consume_analytics_rate_limit(text, integer, integer) to service_role;
grant execute on function public.ingest_analytics_event(text, text, timestamptz, text, text, text, text, text, text, text, text, uuid, text, numeric, jsonb) to service_role;
