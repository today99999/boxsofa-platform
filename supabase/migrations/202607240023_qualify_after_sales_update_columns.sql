-- PL/pgSQL exposes RETURNS TABLE fields as variables. Qualify overlapping
-- after-sales columns so production keeps the default ambiguity checks enabled.
begin;

create or replace function public.update_after_sales_case(
  p_case_id uuid,
  p_actor_id uuid,
  p_expected_version bigint,
  p_status text,
  p_responsibility text,
  p_responsibility_set boolean,
  p_refund_amount_cents bigint,
  p_refund_amount_set boolean,
  p_internal_note text,
  p_internal_note_set boolean,
  p_due_at timestamptz,
  p_due_at_set boolean
)
returns table(
  ok boolean,
  error_code text,
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
  v_case public.after_sales_cases%rowtype;
  v_order public.orders%rowtype;
  v_next_status text;
  v_next_responsibility text;
  v_next_refund_cents bigint;
  v_successful_refund_cents bigint;
  v_other_case_refund_cents bigint;
  v_before jsonb;
begin
  if p_case_id is null or p_expected_version is null or p_expected_version < 1 then
    return query select false, 'invalid_input', null::uuid, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::timestamptz, null::numeric, null::text,
      null::bigint, null::timestamptz, null::timestamptz;
    return;
  end if;

  if not exists (select 1 from public.profiles where profiles.id = p_actor_id and profiles.role = 'owner') then
    raise exception 'Owner actor required' using errcode = '42501';
  end if;

  select * into v_case from public.after_sales_cases case_row where case_row.id = p_case_id for update;
  if not found then
    return query select false, 'not_found', null::uuid, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::timestamptz, null::numeric, null::text,
      null::bigint, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_case.version <> p_expected_version then
    return query select false, 'conflict', null::uuid, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::timestamptz, null::numeric, null::text,
      null::bigint, null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into v_order from public.orders order_row where order_row.id = v_case.order_id for key share;
  v_next_status := coalesce(p_status, v_case.status);
  v_next_responsibility := case when p_responsibility_set then p_responsibility else v_case.responsibility end;
  v_next_refund_cents := case when p_refund_amount_set then p_refund_amount_cents else round(coalesce(v_case.refund_amount_eur, 0) * 100)::bigint end;

  if p_status is not null and (
    v_case.status in ('refunded', 'resolved', 'rejected')
    or p_status not in ('requested', 'reviewing', 'approved', 'return_in_transit', 'received', 'replacement_sent', 'refunded', 'resolved', 'rejected')
    or (p_status <> v_case.status and not (
      (v_case.status = 'requested' and p_status in ('reviewing', 'approved', 'rejected')) or
      (v_case.status = 'reviewing' and p_status in ('approved', 'rejected')) or
      (v_case.status = 'approved' and p_status in ('return_in_transit', 'replacement_sent', 'refunded', 'resolved')) or
      (v_case.status = 'return_in_transit' and p_status in ('received', 'rejected')) or
      (v_case.status = 'received' and p_status in ('replacement_sent', 'refunded', 'resolved')) or
      (v_case.status = 'replacement_sent' and p_status = 'resolved')
    ))
  ) then
    return query select false, 'invalid_transition', null::uuid, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::timestamptz, null::numeric, null::text,
      null::bigint, null::timestamptz, null::timestamptz;
    return;
  end if;

  if p_responsibility_set and p_responsibility is not null
    and p_responsibility not in ('customer', 'boxsofa', 'carrier', 'supplier', 'unknown') then
    return query select false, 'invalid_input', null::uuid, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::timestamptz, null::numeric, null::text,
      null::bigint, null::timestamptz, null::timestamptz;
    return;
  end if;
  if p_refund_amount_set and p_refund_amount_cents is not null and p_refund_amount_cents < 0 then
    return query select false, 'invalid_refund_amount', null::uuid, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::timestamptz, null::numeric, null::text,
      null::bigint, null::timestamptz, null::timestamptz;
    return;
  end if;
  if p_due_at_set and p_due_at is not null and p_due_at <= now() then
    return query select false, 'invalid_due_at', null::uuid, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::timestamptz, null::numeric, null::text,
      null::bigint, null::timestamptz, null::timestamptz;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('after-sales-refund:' || v_order.id::text, 0));
  select coalesce(sum(round(refund_row.amount_eur * 100)::bigint), 0) into v_successful_refund_cents
  from public.payment_refunds refund_row
  where refund_row.order_id = v_order.id and refund_row.status = 'succeeded' and refund_row.currency = 'EUR';
  select coalesce(sum(round(case_row.refund_amount_eur * 100)::bigint), 0) into v_other_case_refund_cents
  from public.after_sales_cases case_row
  where case_row.order_id = v_order.id and case_row.id <> v_case.id;
  if coalesce(v_next_refund_cents, 0) > round(v_order.total_eur * 100)::bigint
    or v_other_case_refund_cents + coalesce(v_next_refund_cents, 0) > v_successful_refund_cents then
    return query select false, 'refund_not_verified', null::uuid, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::timestamptz, null::numeric, null::text,
      null::bigint, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_next_status = 'refunded' and (v_successful_refund_cents = 0 or coalesce(v_next_refund_cents, 0) = 0) then
    return query select false, 'refund_not_verified', null::uuid, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::timestamptz, null::numeric, null::text,
      null::bigint, null::timestamptz, null::timestamptz;
    return;
  end if;

  v_before := jsonb_build_object('caseNumber', v_case.case_number, 'status', v_case.status,
    'responsibility', v_case.responsibility, 'refundAmountEur', v_case.refund_amount_eur,
    'dueAt', v_case.due_at, 'version', v_case.version);

  update public.after_sales_cases
  set status = v_next_status,
      responsibility = v_next_responsibility,
      refund_amount_eur = case when p_refund_amount_set then p_refund_amount_cents::numeric / 100 else after_sales_cases.refund_amount_eur end,
      internal_note = case when p_internal_note_set then p_internal_note else after_sales_cases.internal_note end,
      due_at = case when p_due_at_set then p_due_at else after_sales_cases.due_at end,
      version = after_sales_cases.version + 1
  where after_sales_cases.id = v_case.id
  returning * into v_case;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_id, 'after_sales_case_update', 'after_sales_case', v_case.id, v_before,
    jsonb_build_object('caseNumber', v_case.case_number, 'status', v_case.status,
      'responsibility', v_case.responsibility, 'refundAmountEur', v_case.refund_amount_eur,
      'dueAt', v_case.due_at, 'version', v_case.version));

  return query select true, null::text, v_case.id, v_case.case_number, v_order.order_number, v_order.customer_name,
    v_case.case_type, v_case.status, v_case.reason, v_case.responsibility, v_case.requested_remedy,
    v_case.due_at, v_case.refund_amount_eur, v_case.internal_note, v_case.version, v_case.created_at, v_case.updated_at;
end;
$$;

revoke all on function public.update_after_sales_case(uuid, uuid, bigint, text, text, boolean, bigint, boolean, text, boolean, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.update_after_sales_case(uuid, uuid, bigint, text, text, boolean, bigint, boolean, text, boolean, timestamptz, boolean) to service_role;

commit;
