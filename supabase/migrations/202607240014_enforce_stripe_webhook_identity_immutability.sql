-- Keep the Stripe event identity immutable even if future server-side code updates the table directly.
begin;

create or replace function public.enforce_stripe_webhook_identity_immutability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.event_type is distinct from old.event_type then
    raise exception 'Stripe webhook event type is immutable';
  end if;

  if old.object_type is not null and (
    new.object_type is distinct from old.object_type
    or new.object_id is distinct from old.object_id
  ) then
    raise exception 'Stripe webhook object identity is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_stripe_webhook_identity_immutability on public.stripe_webhook_events;
create trigger enforce_stripe_webhook_identity_immutability
before update on public.stripe_webhook_events
for each row execute function public.enforce_stripe_webhook_identity_immutability();

commit;
