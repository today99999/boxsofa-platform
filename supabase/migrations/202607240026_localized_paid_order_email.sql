begin;

alter table public.orders
  add column if not exists locale text;

update public.orders
set locale = case when profiles.preferred_locale in ('zh', 'en', 'es', 'fr', 'de') then profiles.preferred_locale else 'en' end
from public.profiles as profiles
where orders.customer_id = profiles.id
  and orders.locale is null;

update public.orders
set locale = 'en'
where locale is null;

alter table public.orders
  alter column locale set default 'en';

alter table public.orders
  alter column locale set not null;

alter table public.orders
  drop constraint if exists orders_locale_check;

alter table public.orders
  add constraint orders_locale_check
  check (locale in ('zh', 'en', 'es', 'fr', 'de'));

commit;
