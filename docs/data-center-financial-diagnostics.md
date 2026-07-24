# Stripe Financial Diagnostics

Migration `202607240013_harden_task5_production_safety.sql` refuses to continue if a
Stripe-paid or refunded order has no matching Stripe payment row. That is deliberate:
creating a synthetic payment row would make GMV, refunds, inventory, and audit history
less trustworthy.

Use this read-only diagnostic before retrying the migration:

```sql
select
  order_row.id,
  order_row.order_number,
  order_row.payment_status,
  order_row.payment_reference,
  order_row.paid_at
from public.orders order_row
where order_row.payment_provider = 'stripe'
  and order_row.payment_status in ('paid', 'refunded')
  and not exists (
    select 1
    from public.payments payment_row
    where payment_row.order_id = order_row.id
      and payment_row.provider = 'stripe'
      and payment_row.status in ('paid', 'refunded')
  );
```

For every returned order, reconcile the payment intent or Checkout Session in Stripe,
verify the order amount and currency, then create the missing payment record through the
approved recovery workflow with an owner present. Do not invent payment identifiers,
refunds, paid timestamps, or inventory movements. Rerun the diagnostic until it returns
zero rows, then reapply the migration.
