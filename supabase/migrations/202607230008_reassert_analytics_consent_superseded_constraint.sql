-- Migration 007 shipped before its constraint recreation became rerunnable.
-- Recreate the same final constraint once in production without changing semantics.
begin;

alter table public.analytics_consent_intents
  drop constraint if exists analytics_consent_intents_superseded_state_check;
alter table public.analytics_consent_intents
  add constraint analytics_consent_intents_superseded_state_check
  check (
    superseded_at is null
    or (consumed_at is not null and consumed_result = 'superseded')
  );

commit;
