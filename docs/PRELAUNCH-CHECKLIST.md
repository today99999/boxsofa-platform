# BoxSofa Prelaunch Checklist

This checklist tracks the work that must be stable before Stripe or any real online payment is enabled.

## Already wired

- Next.js production build and typecheck pass with `npm run prelaunch`.
- Required local environment variables can be checked without printing secrets by running `npm run env:check`.
- Full local verification can be run with `npm run prelaunch:local` while the local server is running.
- Local/production smoke checks are available with `npm run smoke` after a server is running. Use `SMOKE_BASE_URL=https://boxsofa.eu npm run smoke` for production.
- Smoke checks verify public routes, sampled product SEO structured data, sampled admin section pages, mojibake prevention, private noindex pages, no-store private caching, health status, and protected admin/customer API routes reject anonymous requests.
- API permission checks are available with `npm run api:auth-audit`. Use `API_AUDIT_BASE_URL=https://boxsofa.eu npm run api:auth-audit` for production.
- API permission checks verify anonymous visitors cannot access admin, customer profile, customer order, order-management, review-management, or notification-management endpoints.
- Public write endpoints for orders, support chat, and reviews have lightweight hashed-source rate limiting.
- Supabase is connected for orders, products, reviews, support chat, audit logs, notifications, and launch readiness.
- Customer order APIs require customer login.
- Admin APIs require merchant roles.
- Shipping, returns, privacy, terms, and FAQ pages exist and are included in `sitemap.xml`.
- `robots.txt` allows storefront pages and blocks admin/API/private checkout pages.
- Supabase security advisor no longer reports public SECURITY DEFINER RPC access.
- Supabase function `search_path` warnings have been fixed in the live database and reflected in `supabase/schema.sql`.
- Missing foreign-key indexes have been added in the live database and reflected in `supabase/schema.sql`.

## Before production launch

- Follow `docs/PRODUCTION-SETUP.md` for Vercel project, production env vars, and domain binding.
- Link this local folder to the Vercel project, because `.vercel/project.json` is not present yet.
  - Expected live preview domain: `boxsofa-platform.vercel.app`
  - Expected production domain: `boxsofa.eu`
- Enable Supabase Auth leaked password protection in the Supabase dashboard.
- Add production environment variables in Vercel:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_SITE_URL=https://boxsofa.eu`
  - `EMAIL_PROVIDER`
  - `EMAIL_FROM`
  - `EMAIL_API_KEY`
  - Current supported email provider value: `resend`
- Add local variables before final local verification:
  - `NEXT_PUBLIC_SITE_URL`
  - `EMAIL_PROVIDER`
  - `EMAIL_FROM`
  - `EMAIL_API_KEY`
- Confirm Vercel production domain points to `boxsofa.eu`.
- Configure Cloudflare DNS for `boxsofa.eu` and `www.boxsofa.eu` as documented in `docs/PRODUCTION-SETUP.md`.
- Run `SMOKE_BASE_URL=https://boxsofa.eu npm run smoke` after deployment.
- Run `API_AUDIT_BASE_URL=https://boxsofa.eu npm run api:auth-audit` after deployment.
- Run `PRODUCTION_BASE_URL=https://boxsofa.eu EXPECTED_SITE_URL=https://boxsofa.eu npm run production:ready` after production environment variables and domain are configured.
- Open and verify these public pages in production:
  - `/`
  - `/category/all`
  - at least 5 product pages
  - `/shipping`
  - `/returns`
  - `/privacy`
  - `/terms`
  - `/faq`
  - `/robots.txt`
  - `/sitemap.xml`
- Verify customer login:
  - Customer can see only their own orders and membership status.
  - Customer cannot enter `/admin`.
- Verify merchant login:
  - Merchant can filter orders.
  - Merchant can confirm payment manually.
  - Merchant can enter tracking numbers.
  - Merchant can edit product price/stock.
  - Merchant can pin/delete reviews.
  - Merchant can reply to support chat.
- Verify analytics consent:
  - No analytics event is stored before consent.
  - Accepted consent records traffic source and conversion events.
- Verify email queue:
  - Order confirmation event creates a queued notification.
  - Payment/shipping changes create queued notifications.
  - Production email provider can send a test message.
- Verify production health endpoint:
  - `/api/health` returns `ok: true`.
  - `siteUrl` is `https://boxsofa.eu`.
  - `supabaseConfigured` is `true`.
  - `emailProviderConfigured` is `true` before final launch.
  - `paymentEnabled` remains `false` until the final Stripe step.
- Clean final visible copy:
  - No mojibake/garbled text in storefront.
  - No mojibake/garbled text in admin pages.
  - Default storefront language is English.
  - Chinese remains available for buyer/customer use.

## Payment is the final step

Do not enable Stripe until every item above is checked in production. Once ready, connect Stripe, run payment test mode, then switch payment on only after final manual approval.
