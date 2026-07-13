# BoxSofa Platform

This is the next-stage BoxSofa project for a custom storefront and merchant admin.

The current public site can stay online while this project is developed in parallel.

## Stack

- Next.js frontend and backend routes
- Supabase PostgreSQL
- Supabase Storage first, Cloudflare R2 later if needed
- Stripe reserved for the next phase
- Domain: `boxsofa.eu`

## What is included now

- Mobile-first storefront skeleton
- Category pages
- Product pages
- Merchant admin skeleton
- Supabase database schema
- Deployment checklist
- Payment-ready order fields without enabling real payment yet

## Local setup

Install Node.js LTS first, then run:

```powershell
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Supabase setup

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.
4. Create storage buckets:
   - `product-images`
   - `product-videos`
   - `detail-images`
5. Copy keys into `.env.local` based on `.env.example`.
6. Follow `docs/SUPABASE-MIGRATION-PLAN.md` to replace local browser orders with real database orders step by step.

## Payment phase

Stripe is intentionally not active yet. When the European bank account is ready, add Stripe keys and implement:

- Checkout session creation
- Stripe webhook
- Order status update to `paid_confirmed` or `processing`
- Member spend calculation after confirmed payment
