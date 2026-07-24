alter table public.orders add column if not exists locale text;

update public.orders order_row
set locale = coalesce(
  (
    select case
      when profile.preferred_locale in ('zh', 'en', 'es', 'fr', 'de')
        then profile.preferred_locale
      else 'en'
    end
    from public.profiles profile
    where profile.id = order_row.customer_id
  ),
  'en'
)
where order_row.locale is null;

alter table public.orders alter column locale set not null;
alter table public.orders drop constraint if exists orders_locale_check;
alter table public.orders
  add constraint orders_locale_check check (locale in ('zh', 'en', 'es', 'fr', 'de'));
