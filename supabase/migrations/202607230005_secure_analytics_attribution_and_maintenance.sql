-- Preserve migration history while closing attribution, consent ordering, and limiter maintenance gaps.
begin;

-- The earlier backfill used sequence order without a stable row order. Reassign every
-- historical visitor timeline deterministically before allowing another consent write.
lock table public.analytics_consents in access exclusive mode;

do $$
declare
  v_offset bigint;
  v_max_revision bigint;
  v_has_rows boolean;
begin
  select coalesce(max(revision), 0) + count(*) + 1
  into v_offset
  from public.analytics_consents;

  update public.analytics_consents
  set revision = revision + v_offset;

  with ordered as (
    select id, row_number() over (order by visitor_id, created_at, id)::bigint as revision
    from public.analytics_consents
  )
  update public.analytics_consents consent_row
  set revision = ordered.revision
  from ordered
  where consent_row.id = ordered.id;

  select max(revision), count(*) > 0
  into v_max_revision, v_has_rows
  from public.analytics_consents;

  perform setval(
    'public.analytics_consents_revision_seq'::regclass,
    coalesce(v_max_revision, 1),
    v_has_rows
  );
end;
$$;

drop policy if exists "admins read analytics consents" on public.analytics_consents;
drop policy if exists "owners read analytics consents" on public.analytics_consents;
create policy "owners read analytics consents"
on public.analytics_consents for select
using ((select public.is_owner()));

drop policy if exists "admins read analytics events" on public.analytics_events;
drop policy if exists "owners read analytics events" on public.analytics_events;
create policy "owners read analytics events"
on public.analytics_events for select
using ((select public.is_owner()));

alter table public.analytics_rate_limit_buckets
  add column if not exists expires_at timestamptz;

update public.analytics_rate_limit_buckets
set expires_at = greatest(window_started_at, updated_at) + interval '2 days'
where expires_at is null;

alter table public.analytics_rate_limit_buckets
  alter column expires_at set not null;

create index if not exists idx_analytics_rate_limit_buckets_expires_at
  on public.analytics_rate_limit_buckets(expires_at);

create or replace function public.cleanup_analytics_rate_limit_buckets(
  p_max_rows integer default 200
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  if p_max_rows < 1 or p_max_rows > 2000 then
    raise exception 'Invalid analytics rate limit cleanup limit' using errcode = '22023';
  end if;

  with candidates as (
    select ctid
    from public.analytics_rate_limit_buckets
    where expires_at <= now()
    order by expires_at
    for update skip locked
    limit p_max_rows
  ), deleted as (
    delete from public.analytics_rate_limit_buckets bucket
    using candidates
    where bucket.ctid = candidates.ctid
    returning 1
  )
  select count(*) into v_deleted from deleted;

  return v_deleted;
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

  -- Bounded cleanup is opportunistic. Its failure is intentionally non-fatal so
  -- a request already within its rate limit can never become a client-visible 5xx.
  if random() < 0.02 then
    begin
      perform public.cleanup_analytics_rate_limit_buckets(200);
    exception when others then
      null;
    end;
  end if;

  v_window := make_interval(secs => p_window_seconds);
  insert into public.analytics_rate_limit_buckets (bucket_key, window_started_at, request_count, expires_at)
  values (p_bucket_key, now(), 1, now() + interval '2 days')
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
    set window_started_at = now(), request_count = 1, expires_at = now() + interval '2 days', updated_at = now()
    where bucket_key = p_bucket_key;
    return query select true, 0;
    return;
  end if;

  if v_bucket.request_count >= p_limit then
    return query select false, greatest(1, ceil(extract(epoch from (v_bucket.window_started_at + v_window - now())))::integer);
    return;
  end if;

  update public.analytics_rate_limit_buckets
  set request_count = request_count + 1, expires_at = now() + interval '2 days', updated_at = now()
  where bucket_key = p_bucket_key;
  return query select true, 0;
end;
$$;

revoke all on function public.cleanup_analytics_rate_limit_buckets(integer) from public, anon, authenticated;
revoke all on function public.consume_analytics_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.cleanup_analytics_rate_limit_buckets(integer) to service_role;
grant execute on function public.consume_analytics_rate_limit(text, integer, integer) to service_role;

commit;
