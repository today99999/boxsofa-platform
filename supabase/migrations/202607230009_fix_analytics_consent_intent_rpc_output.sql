-- The deployed 007 function used an output name that conflicted with RETURNING.
-- Recreate it with qualified columns; all intent-ordering semantics stay unchanged.
begin;

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
  returning analytics_consent_intents.id,
    analytics_consent_intents.intent_revision,
    analytics_consent_intents.expires_at
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

revoke all on function public.issue_analytics_consent_intent(text) from public, anon, authenticated;
grant execute on function public.issue_analytics_consent_intent(text) to service_role;

commit;
