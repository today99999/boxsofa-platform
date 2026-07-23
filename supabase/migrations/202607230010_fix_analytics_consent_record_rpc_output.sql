-- Qualify table columns that conflict with record_analytics_consent return fields.
begin;

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

  select consent_row.id, consent_row.consent, consent_row.revision, consent_row.intent_revision
  into v_current_id, v_current_consent, v_current_revision, v_current_intent_revision
  from public.analytics_consents consent_row
  where consent_row.visitor_id = p_visitor_id
  order by consent_row.intent_revision desc
  limit 1
  for update;

  select head.latest_intent_revision
  into v_latest_intent_revision
  from public.analytics_consent_intent_heads head
  where head.visitor_id = p_visitor_id
  for update;

  select * into v_intent
  from public.analytics_consent_intents intent_row
  where intent_row.id = p_intent_id
    and intent_row.visitor_id = p_visitor_id
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
      update public.analytics_consent_intents intent_row
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
            else intent_row.superseded_at
          end
      where intent_row.id = v_intent.id;
    end if;
    return query select false, true, v_current_id, v_current_consent, v_current_revision, v_current_intent_revision;
    return;
  end if;

  insert into public.analytics_consents (visitor_id, consent, locale, consent_version, intent_revision)
  values (p_visitor_id, p_consent, p_locale, p_consent_version, v_intent.intent_revision)
  returning * into v_inserted;

  update public.analytics_consent_intents intent_row
  set consumed_at = now(), consumed_result = 'accepted'
  where intent_row.id = v_intent.id;

  return query select true, false, v_inserted.id, v_inserted.consent, v_inserted.revision, v_inserted.intent_revision;
end;
$$;

revoke all on function public.record_analytics_consent(text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_analytics_consent(text, text, text, text, uuid) to service_role;

commit;
