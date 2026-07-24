# BoxSofa Data Center Phase 1 Audit

Verification window: 2026-07-23 to 2026-07-24, Europe/Madrid.

## Release Identity

- Audited implementation commit: `459f79b`.
- Implementation baseline before release verification: `86003d7`.
- Production Supabase project: `osmjevtynywbkokzejcp`.
- Data Center route: `/data-center`.

## Database And Financial Truth

- All Data Center migrations `001` through `023` are applied. The immutable manifest contains 23 SQL files and four exact remote checkpoints.
- Migration `023` fixes a production-only PL/pgSQL ambiguity in `update_after_sales_case` by qualifying columns that overlap `RETURNS TABLE` variables.
- Reconciliation range: `2026-07-01T00:00:00Z` inclusive to `2026-08-01T00:00:00Z` exclusive.
- Paid orders: `1`; GMV: `37500` cents; succeeded Stripe refunds: `0` cents; net sales: `37500` cents.
- GMV is the merchandise total of Stripe-paid orders before refunds. Net sales is GMV minus succeeded Stripe refunds. Calculations remain integer-cent based.

## Automated Verification

- `npm test`: PASS, 181/181.
- `npm run db:migrations:verify`: PASS, 23 migrations and four remote checkpoints.
- `npm run db:bootstrap:execute`: PASS, 26 core tables, 44 owner policies, 26 RLS tables and 23 critical RPCs.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npm run production:verify:local`: PASS, including smoke and anonymous API authorization audits.
- Smoke covers the PWA manifest, service worker, private `/data-center` route and the overview, search and after-sales APIs.

## Browser And PWA

- Windows: Windows 11 Home China, version `10.0.22000`, build `22000`.
- Installed browsers recorded on the machine: Chrome `150.0.7871.186`; Edge `150.0.4078.96`.
- Desktop viewport: `1440 x 900`; anonymous `/data-center` returned a private 404 with `noindex, nofollow`.
- Mobile viewport: `390 x 844`; no horizontal overflow; privacy controls remained visible.
- Manifest contract: `BoxSofa Data Center`, start URL and scope `/data-center`, `display: standalone`.
- Standard and maskable PNG icons are both verified at `512 x 512`.
- The in-app verification browser does not expose the native PWA install prompt and the Chrome control extension was unavailable. Native Windows install/uninstall was therefore not asserted in this pass. The manifest, service-worker scope and standalone launch contract are verified; native installation remains a browser UI operation after production deployment.

## Privacy And Access

- Anonymous owner APIs are denied. Private pages use `no-store` and `noindex`.
- The owner gate executes server-side before private Data Center HTML is rendered.
- Production currently has zero analytics consent rows and zero analytics events. Visitor count is therefore zero and conversion is represented as unavailable, not invented as `0%`.
- `orders`, `stripe` and `website_analytics` each have an explicit source key, state and timestamp. Website analytics is currently `disconnected`; no social source is represented with a fabricated number.
- An owner-attributed, non-refund `delivery` case was created and updated to `reviewing` through the production RPC. The test case and its two audit rows were then deleted in a controlled cleanup; residual case and audit counts are both zero.

## Phase Boundaries

- Phase 1 does not send customer messages from the Data Center.
- Recording a refund amount is bookkeeping only and does not call Stripe.
- Social analytics, social publishing, procurement and the extended Data Cube remain disconnected future integrations and show no numeric values.
- No real refund, customer message, email, social publish or payment action occurred during this audit.
