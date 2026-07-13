# BoxSofa Production Setup Notes

These steps must be completed before the non-payment launch can be treated as production-ready.

## Vercel project

- Team: leaf99999's projects
- Project: boxsofa-platform
- Project ID: prj_1dnykjIBgeJokqFI46W56ZSPF5qG
- Current verified Vercel URL: https://boxsofa-platform.vercel.app
- Target production domain: https://boxsofa.eu

## Production environment variables

Add these in Vercel Project Settings -> Environment Variables for Production. Do not paste these values into documentation or chat.

Required before real production use:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_SITE_URL=https://boxsofa.eu

Recommended before customer launch:

- EMAIL_PROVIDER=resend
- EMAIL_FROM
- EMAIL_API_KEY

Keep payment disabled until the final Stripe step.

## Domain binding

Add both domains to the same Vercel project:

- boxsofa.eu
- www.boxsofa.eu

Then update DNS as Vercel instructs. After DNS is active, both domains should serve this app and /api/health should return JSON instead of HTML.

Current Vercel DNS recommendation from verification:

- Cloudflare record for apex domain: CNAME @ -> 3f7e34346aeddb7f.vercel-dns-017.com. with proxy disabled
- Cloudflare record for www: CNAME www -> 3f7e34346aeddb7f.vercel-dns-017.com. with proxy disabled

Cloudflare Domain Connect apply URLs:

- https://vercel.com/api/v9/projects/prj_1dnykjIBgeJokqFI46W56ZSPF5qG/domains/boxsofa.eu/domain-connect/apply?teamId=team_XE0YAB39PuagknoUGAaaWtbg
- https://vercel.com/api/v9/projects/prj_1dnykjIBgeJokqFI46W56ZSPF5qG/domains/www.boxsofa.eu/domain-connect/apply?teamId=team_XE0YAB39PuagknoUGAaaWtbg

Current status on 2026-07-14:

- Vercel production env has Supabase and NEXT_PUBLIC_SITE_URL configured.
- Vercel production smoke passes on https://boxsofa-platform.vercel.app.
- boxsofa.eu and www.boxsofa.eu are attached to the Vercel project and verified by Vercel.
- Production smoke passes on https://boxsofa.eu.
- Supabase performance advisor has no WARN-level duplicate RLS policy findings; remaining performance findings are INFO-level unused indexes to review after real traffic.
- Supabase security advisor still reports leaked password protection disabled in Auth settings.
- Email provider production env vars are still missing.

## Verification commands

After Vercel env vars and domains are configured, redeploy production and run:

```powershell
$env:SMOKE_BASE_URL='https://boxsofa.eu'; npm.cmd run smoke
$env:PRODUCTION_BASE_URL='https://boxsofa.eu'; $env:EXPECTED_SITE_URL='https://boxsofa.eu'; npm.cmd run production:ready
```

Expected result before payment:

- smoke passes
- production:ready passes
- /api/health returns supabaseConfigured true
- /api/health returns emailProviderConfigured true
- /api/health returns paymentEnabled false
