-- Preserve applied migration history while closing consent and limiter race windows.
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

revoke all on function public.record_analytics_consent(text, text, text, text) from public, anon, authenticated;
revoke all on function public.consume_analytics_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.record_analytics_consent(text, text, text, text) to service_role;
grant execute on function public.consume_analytics_rate_limit(text, integer, integer) to service_role;
