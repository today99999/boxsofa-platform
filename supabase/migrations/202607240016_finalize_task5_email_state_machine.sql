-- Final Task 5 outbox transitions. Terminal notification states cannot be
-- reopened; delivery continues to use lease-bound service-role RPCs.
begin;

create or replace function public.enforce_email_notification_state_machine()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status in ('sent', 'skipped') then
    raise exception 'Email notification terminal state cannot change' using errcode = 'P0001';
  end if;

  if old.status = 'sending' and new.status not in ('sending', 'sent', 'failed') then
    raise exception 'An email delivery lease must be finalized or recovered' using errcode = 'P0001';
  end if;

  if old.status in ('queued', 'failed') and new.status = 'sent' then
    raise exception 'An email notification must be claimed before it can be sent' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_email_notification_state_machine on public.email_notifications;
create trigger enforce_email_notification_state_machine
before update on public.email_notifications
for each row execute function public.enforce_email_notification_state_machine();

create or replace function public.transition_email_notification(
  p_notification_id uuid,
  p_action text
)
returns table(
  transitioned boolean,
  error_code text,
  notification jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_notification public.email_notifications%rowtype;
begin
  if p_notification_id is null or p_action not in ('requeue', 'skip') then
    raise exception 'Invalid email notification transition input' using errcode = '22023';
  end if;

  select * into v_notification
  from public.email_notifications notification_row
  where notification_row.id = p_notification_id
  for update;

  if not found then
    return query select false, 'notification_not_found'::text, null::jsonb;
    return;
  end if;

  if v_notification.status in ('sent', 'skipped') then
    return query select false, 'terminal_state'::text, to_jsonb(v_notification);
    return;
  end if;

  if v_notification.status = 'sending' then
    return query select false, 'delivery_in_progress'::text, to_jsonb(v_notification);
    return;
  end if;

  if p_action = 'requeue' and v_notification.status = 'failed' then
    update public.email_notifications
    set status = 'queued',
        provider = 'pending',
        last_error = null,
        delivery_lease_token = null,
        delivery_lease_expires_at = null
    where id = p_notification_id
    returning * into v_notification;
  elsif p_action = 'skip' and v_notification.status in ('queued', 'failed') then
    update public.email_notifications
    set status = 'skipped',
        last_error = null,
        delivery_lease_token = null,
        delivery_lease_expires_at = null
    where id = p_notification_id
    returning * into v_notification;
  else
    return query select false, 'invalid_transition'::text, to_jsonb(v_notification);
    return;
  end if;

  return query select true, null::text, to_jsonb(v_notification);
end;
$$;

revoke all on function public.transition_email_notification(uuid, text) from public, anon, authenticated;
grant execute on function public.transition_email_notification(uuid, text) to service_role;

commit;
