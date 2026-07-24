-- Promote the temporary partial unique index to the durable payment identity constraint.
begin;

do $$
begin
  if exists (
    select 1
    from public.payments
    where provider_payment_id is not null
    group by provider, provider_payment_id
    having count(*) > 1
  ) then
    raise exception 'Cannot add payments provider uniqueness: duplicate provider/payment identifiers exist. Resolve the duplicate business records manually before applying this migration.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_provider_payment_id_unique'
  ) then
    alter table public.payments
      add constraint payments_provider_payment_id_unique
      unique (provider, provider_payment_id);
  end if;
end;
$$;

drop index if exists public.idx_payments_provider_payment_id_unique;

commit;
