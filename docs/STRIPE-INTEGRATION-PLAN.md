# BoxSofa Stripe Integration Plan

Updated: 2026-07-17

## Current decision

BoxSofa should start with Stripe Checkout for one-time sofa payments.

The current order system already creates an order, reserves stock, sends admin/customer email previews, and lets the merchant manage shipping. Stripe should not replace that workflow. Stripe should only handle secure online payment, then notify BoxSofa through a signed webhook.

## Implemented flow

1. Customer submits the cart and delivery form.
2. BoxSofa creates the order in Supabase and reserves stock.
3. If Stripe keys are configured, BoxSofa creates a Stripe Checkout Session.
4. Customer is redirected to Stripe-hosted Checkout.
5. Stripe sends `checkout.session.completed` to `/api/stripe/webhook`.
6. The webhook verifies the Stripe signature, checks the paid amount, then:
   - marks the order as `paid_confirmed`
   - sets `payment_status` to `paid`
   - records the Stripe payment in `payments`
   - commits reserved stock into sold stock
   - queues the payment confirmation email preview

If Stripe keys are not configured, the site keeps the previous manual confirmation workflow.

## Environment variables

Local and Vercel production need:

```text
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

Use test mode keys first. Prefer a restricted API key when the integration has been tested and the required Stripe permissions are known.

## Stripe Dashboard setup

Create a webhook endpoint:

```text
https://boxsofa.eu/api/stripe/webhook
```

Subscribe at least to:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
```

Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.

## Product choices

- Payments: Stripe Checkout Sessions, one-time payment mode.
- Invoicing: second phase, for manual B2B or special orders after the basic payment flow is stable.
- Connect: second phase only if BoxSofa becomes a marketplace or lets other sellers receive payouts. For the current single-store model, Connect is not needed for checkout.
- Tax: do not enable `automatic_tax` until active tax registrations are confirmed in Stripe. For Spain/EU, confirm domestic VAT and OSS obligations with the accountant first.

## Go-live checklist

1. Add Stripe test keys to `.env.local`.
2. Test local checkout with Stripe test cards.
3. Test local webhook with Stripe CLI or Dashboard forwarding.
4. Add Stripe test keys to Vercel preview/production if doing a preview run.
5. Place one test order and confirm it becomes paid only after the webhook.
6. Switch to live keys only after the live Stripe account is fully approved.
7. Add live webhook secret for `https://boxsofa.eu/api/stripe/webhook`.
8. Run `EXPECT_PAYMENT_ENABLED=true npm.cmd run production:verify`.
