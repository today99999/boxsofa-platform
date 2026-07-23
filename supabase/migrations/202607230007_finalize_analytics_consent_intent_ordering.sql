-- Latest-issued intent heads make late browser requests harmless after cleanup.
begin;

alter table public.analytics_consent_intents
  add column if not exists superseded_at timestamptz;

alter table public.analytics_consent_intents
  drop constraint if exists analytics_consent_intents_consumed_result_check;
alter table public.analytics_consent_intents
  add constraint analytics_consent_intents_consumed_result_check
  check (consumed_result in ('accepted', 'stale', 'superseded'));
alter table public.analytics_consent_intents
  add constraint analytics_consent_intents_superseded_state_check
  check (
    superseded_at is null
    or (consumed_at is not null and consumed_result = 'superseded')
  );

create table if not exists public.analytics_consent_intent_heads (
  visitor_id text primary key check (length(visitor_id) between 8 and 120),
  latest_intent_revision bigint not null check (latest_intent_revision > 0),
  issued_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.analytics_consent_intent_heads enable row level security;
revoke all on table public.analytics_consent_intent_heads from public, anon, authenticated;

insert into public.analytics_consent_intent_heads (visitor_id, latest_intent_revision, issued_at, updated_at)
select visitor_id, max(intent_revision), max(issued_at), now()
from public.analytics_consent_intents
group by visitor_id
on conflict (visitor_id) do update
set latest_intent_revision = greatest(
      public.analytics_consent_intent_heads.latest_intent_revision,
      excluded.latest_intent_revision
    ),
    issued_at = case
      when excluded.latest_intent_revision >= public.analytics_consent_intent_heads.latest_intent_revision
        then excluded.issued_at
      else public.analytics_consent_intent_heads.issued_at
    end,
    updated_at = now();

update public.analytics_consent_intents intent
set consumed_at = now(),
    consumed_result = 'superseded',
    superseded_at = now()
from public.analytics_consent_intent_heads head
where intent.visitor_id = head.visitor_id
  and intent.consumed_at is null
  and intent.intent_revision < head.latest_intent_revision;

create index if not exists idx_analytics_consent_intents_expiry_cleanup
  on public.analytics_consent_intents(expires_at, id)
  where consumed_at is null;
create index if not exists idx_analytics_consent_intents_consumed_cleanup
  on public.analytics_consent_intents(consumed_at, id)
  where consumed_at is not null;
create index if not exists idx_analytics_consent_intents_superseded_cleanup
  on public.analytics_consent_intents(superseded_at, id)
  where superseded_at is not null;

create or replace function public.cleanup_analytics_consent_intents(
  p_limit integer default 25
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer;
  v_deleted integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 250 then
    raise exception 'Invalid analytics consent intent cleanup limit' using errcode = '22023';
  end if;

  v_limit := p_limit;

  with candidates as (
    select id
    from public.analytics_consent_intents
    where expires_at <= now() - interval '1 hour'
      or consumed_at <= now() - interval '1 hour'
      or superseded_at <= now() - interval '1 hour'
    order by coalesce(superseded_at, consumed_at, expires_at), id
    for update skip locked
    limit v_limit
  ), deleted as (
    delete from public.analytics_consent_intents intent
    using candidates
    where intent.id = candidates.id
    returning 1
  )
  select count(*) into v_deleted from deleted;

  return v_deleted;
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
declare
  v_intent_id uuid;
  v_intent_revision bigint;
  v_expires_at timestamptz;
begin
  if p_visitor_id is null or length(p_visitor_id) not between 8 and 120 then
    raise exception 'Invalid analytics consent intent input' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_visitor_id, 0));

  insert into public.analytics_consent_intents (visitor_id)
  values (p_visitor_id)
  returning id, intent_revision, expires_at
  into v_intent_id, v_intent_revision, v_expires_at;

  update public.analytics_consent_intents
  set consumed_at = now(),
      consumed_result = 'superseded',
      superseded_at = now()
  where visitor_id = p_visitor_id
    and consumed_at is null
    and id <> v_intent_id;

  insert into public.analytics_consent_intent_heads (
    visitor_id,
    latest_intent_revision,
    issued_at,
    updated_at
  ) values (
    p_visitor_id,
    v_intent_revision,
    now(),
    now()
  )
  on conflict (visitor_id) do update
  set latest_intent_revision = excluded.latest_intent_revision,
      issued_at = excluded.issued_at,
      updated_at = excluded.updated_at;

  begin
    perform public.cleanup_analytics_consent_intents(25);
  exception when others then
    null;
  end;

  return query select v_intent_id, v_intent_revision, v_expires_at;
end;
$$;

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
  v_latest_intent_revision bigint;
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

  select latest_intent_revision
  into v_latest_intent_revision
  from public.analytics_consent_intent_heads
  where visitor_id = p_visitor_id
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
    or v_latest_intent_revision is null
    or v_intent.intent_revision <> v_latest_intent_revision
    or v_intent.intent_revision <= coalesce(v_current_intent_revision, 0)
  then
    if v_intent.consumed_at is null then
      update public.analytics_consent_intents
      set consumed_at = now(),
          consumed_result = case
            when v_latest_intent_revision is not null
              and v_intent.intent_revision <> v_latest_intent_revision
              then 'superseded'
            else 'stale'
          end,
          superseded_at = case
            when v_latest_intent_revision is not null
              and v_intent.intent_revision <> v_latest_intent_revision
              then now()
            else superseded_at
          end
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
  set consumed_at = now(),
      consumed_result = 'accepted'
  where id = v_intent.id;

  return query select true, false, v_inserted.id, v_inserted.consent, v_inserted.revision, v_inserted.intent_revision;
end;
$$;

revoke all on function public.cleanup_analytics_consent_intents(integer) from public, anon, authenticated;
revoke all on function public.issue_analytics_consent_intent(text) from public, anon, authenticated;
revoke all on function public.record_analytics_consent(text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.cleanup_analytics_consent_intents(integer) to service_role;
grant execute on function public.issue_analytics_consent_intent(text) to service_role;
grant execute on function public.record_analytics_consent(text, text, text, text, uuid) to service_role;

commit;
