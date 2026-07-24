-- Keep after-sales case numbers recognizable without truncating the sequence after 99,999,999.
begin;

create or replace function public.create_after_sales_case(
  p_order_number text,
  p_case_type text,
  p_reason text,
  p_requested_remedy text,
  p_due_at timestamptz,
  p_created_by uuid
)
returns table(
  id uuid,
  case_number text,
  order_number text,
  customer_name text,
  case_type text,
  status text,
  reason text,
  responsibility text,
  requested_remedy text,
  due_at timestamptz,
  refund_amount_eur numeric,
  internal_note text,
  version bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_case public.after_sales_cases%rowtype;
  v_case_number text;
  v_case_sequence bigint;
begin
  if p_order_number is null or length(btrim(p_order_number)) not between 3 and 80
    or p_case_type not in ('return', 'refund', 'replacement', 'damage', 'delivery', 'quality', 'other')
    or p_reason is null or length(btrim(p_reason)) not between 5 and 4000
    or (p_requested_remedy is not null and length(btrim(p_requested_remedy)) > 1000)
    or (p_due_at is not null and p_due_at <= now())
  then
    raise exception 'Invalid after-sales case input' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where profiles.id = p_created_by and profiles.role = 'owner') then
    raise exception 'Owner actor required' using errcode = '42501';
  end if;

  select * into v_order
  from public.orders order_row
  where order_row.order_number = btrim(p_order_number)
  for key share;
  if not found then
    return;
  end if;

  v_case_sequence := nextval('public.after_sales_case_number_seq');
  v_case_number := format(
    'AS-%s-%s',
    to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSMS'),
    lpad(v_case_sequence::text, greatest(8, length(v_case_sequence::text)), '0')
  );

  insert into public.after_sales_cases (
    case_number, order_id, customer_id, case_type, reason, requested_remedy, due_at, created_by
  ) values (
    v_case_number, v_order.id, v_order.customer_id, p_case_type, btrim(p_reason),
    nullif(btrim(coalesce(p_requested_remedy, '')), ''), p_due_at, p_created_by
  ) returning * into v_case;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    p_created_by, 'after_sales_case_create', 'after_sales_case', v_case.id, null,
    jsonb_build_object(
      'caseNumber', v_case.case_number,
      'orderNumber', v_order.order_number,
      'type', v_case.case_type,
      'status', v_case.status,
      'dueAt', v_case.due_at
    )
  );

  return query select v_case.id, v_case.case_number, v_order.order_number, v_order.customer_name,
    v_case.case_type, v_case.status, v_case.reason, v_case.responsibility, v_case.requested_remedy,
    v_case.due_at, v_case.refund_amount_eur, v_case.internal_note, v_case.version, v_case.created_at, v_case.updated_at;
end;
$$;

revoke all on function public.create_after_sales_case(text, text, text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.create_after_sales_case(text, text, text, text, timestamptz, uuid) to service_role;

commit;
