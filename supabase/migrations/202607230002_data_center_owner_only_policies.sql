-- Correct the initially applied data-center policies to the owner-only v1 boundary.
drop policy if exists "admins manage source health" on public.data_source_health;
drop policy if exists "owners manage source health" on public.data_source_health;
create policy "owners manage source health" on public.data_source_health
for all using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "admins manage dashboard alerts" on public.dashboard_alerts;
drop policy if exists "owners manage dashboard alerts" on public.dashboard_alerts;
create policy "owners manage dashboard alerts" on public.dashboard_alerts
for all using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "admins manage after sales" on public.after_sales_cases;
drop policy if exists "owners manage after sales" on public.after_sales_cases;
create policy "owners manage after sales" on public.after_sales_cases
for all using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "admins manage payment refunds" on public.payment_refunds;
drop policy if exists "owners manage payment refunds" on public.payment_refunds;
create policy "owners manage payment refunds" on public.payment_refunds
for all using ((select public.is_owner())) with check ((select public.is_owner()));
