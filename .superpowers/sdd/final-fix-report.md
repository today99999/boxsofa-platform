# Final review fix report — paid-order thank-you email

## Result

All Critical and Important findings in the final fix brief, plus the recorded
per-row transport-isolation Minor, are fixed in one coherent change set.
Migration 026 and `supabase/schema.sql` are aligned, migrations 001-025 were
not changed, and the five approved localized templates were preserved.

## Implemented fixes

1. Release verification now fails closed before any remote request when a
   manifest migration lacks a remote checkpoint. Local verification still
   reports 26 SQL files and 25 recorded remote checkpoints.
2. `profiles.membership_welcomed_at` is a durable, immutable lifetime marker.
   Stripe, refund, and offline writers lock the profile before membership
   aggregation, and only the first qualifying payment claims the welcome.
3. Admin offline confirmation uses one service-role PostgreSQL RPC for order,
   payment, inventory, membership, shipment, and paid-email outbox work. It is
   localized, atomic, idempotent, and converges correctly when stale concurrent
   paid/shipped requests race. Runtime paid-email copy was removed.
4. Automatic delivery has a five-attempt bound, exponential backoff,
   `next_attempt_at`, quarantine, and an owner recovery path. The fifth claim
   pre-quarantines ambiguous provider/finalization outcomes; an active lease
   remains fenced while an expired lease can be manually requeued or skipped.
5. A PostgreSQL trigger rejects changes to order customer name, email, or
   locale while allowing status and payment transitions.
6. Cron selects only explicitly eligible migration-026
   `payment_confirmed` rows. Historical paid snapshots and every other event
   remain excluded unless an owner deliberately requeues/sends them.
7. Provider errors are reduced to bounded internal categories and optional
   HTTP status. Migration 026 also scrubs unsafe historical failed-row errors.
8. Vercel deployment preflight now enforces release environment and readiness
   prerequisites before the remote migration gate, including cron, provider,
   sender, service-role, and payment configuration without printing values.
9. Claim/finalize transport failures are isolated per row and do not abort
   later notifications in the batch.

## RED / GREEN evidence

Initial focused RED command:

```text
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test lib/data-center/migration-integrity.test.ts lib/server/email-provider.test.ts lib/server/email-notification-dispatcher.test.ts lib/server/paid-order-final-fixes.test.ts
```

Result: 31 tests ran; 15 failed as expected. The failures exposed incomplete
release checkpoint coverage, missing deployment prerequisites, unbounded and
unscoped dispatch, provider-controlled error persistence, missing offline RPC,
mutable snapshots, and missing lifetime/retry state.

Additional review-driven RED cases:

- Exhausted fifth-attempt `sending` row with an expired lease could not be
  manually recovered.
- Migration 026 did not initially prove the upgrade path from the older
  outbox state machine.
- A mixed concurrent offline `paid_confirmed`/`shipped` race could lose the
  shipment transition.
- A pre-migration failed row retained an email/body fragment in `last_error`.

Each case failed before its implementation change and passed afterward in
disposable PGlite. The final focused and full suites are green.

## Final verification

| Command | Result |
| --- | --- |
| `npm run production:verify:local` | Pass — runs the complete verification chain below, isolated smoke checks, and API authorization audit. |
| `npm test` | Pass — 219 tests, 0 failures. |
| `npm run typecheck` | Pass. |
| `npm run db:migrations:verify` | Pass — 26 SQL files; 25 recorded remote checkpoints. |
| `npm run db:bootstrap:validate` | Pass — 504 statements. |
| `npm run db:bootstrap:execute` | Pass — 26 core tables, 9 core functions, 44 owner policies, 26 RLS tables, and 24 critical RPCs. |
| `npm run build` | Pass — optimized Next.js production build, 48 static-generation pages. |
| Isolated `npm run api:auth-audit` | Pass — all protected/public route expectations passed, including cron 401 behavior. |
| Isolated local smoke audit | Pass. |
| `node --check scripts/stripe-financial-integration.mjs` | Pass. |
| `git diff --check` | Pass. |

Executable database coverage includes localized offline payment, payment and
outbox replay, mixed paid/shipped convergence, atomic inventory rollback,
immutable communication fields, lifetime welcome across refund and
requalification, retry/backoff/quarantine/manual recovery, historical error
scrubbing, migration-026 upgrade behavior, and concurrent Stripe/offline
membership refresh. The guarded two-client Supabase integration script also
contains the real concurrent Stripe/offline scenario.

## Guarded live integration

The live Supabase/Stripe fixture was not run because every explicit
non-production prerequisite was absent:

- `RUN_SUPABASE_STRIPE_INTEGRATION`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_TEST_PROJECT_REF`
- `SUPABASE_INTEGRATION_TARGET`

No production credentials were used. No migration, deployment, order, Stripe
event, cron invocation, or email send was performed.

During the first RED release-gate test, the obsolete test ordering made one
read-only Supabase RPC attempt with a deliberately fake credential; it received
401 and had no data access or mutation. The test was immediately changed so
manifest coverage fails locally before any remote verifier is selected, and no
further remote request was made.

## Self-review

- `git diff --check` and a credential-pattern scan are clean.
- Only migration 026 and its manifest hash changed; migrations 001-025 remain
  untouched.
- Provider response bodies, recipient addresses, subjects, and bodies cannot
  flow into delivery errors or loggable provider results.
- Active delivery leases remain fenced, while owner recovery works after lease
  expiry.
- Concurrent offline replay produces one payment, one outbox snapshot, and one
  shipment without downgrading an already completed order.
- Independent read-only final diff review reported no remaining blocking
  findings after the two last upgrade/race fixes.

## Blockers and release concerns

There is no implementation blocker. Release is intentionally blocked until an
operator applies migration 026 to the intended non-production/production
database through the approved process and records its verified remote
checkpoint. Provider, sender, cron, service-role, and payment release settings
must also be supplied by the operator. This work did not apply or invent any
remote checkpoint.

The live two-client Supabase integration remains a pre-release verification
step once explicit, guarded non-production credentials are available.

## Second final-review wave

- Migration 026 now backfills `orders.locale`, removes its insert default, and
  keeps the column required so old-app writes fail closed during rollout.
- A pending unpaid order confirmed directly as shipped records one offline
  payment, one shipment, and both immutable `payment_confirmed` and
  `order_shipped` notification snapshots in the same transaction.
- Delivery claims persist the first provider-attempt timestamp. Automatic
  retries retain the stable key inside Resend's 24-hour window and quarantine
  ambiguous work at the boundary without calling the provider again.
- Notification audit writes and historical notification audit rows retain only
  allowlisted operational metadata; recipient, subject, preview, body,
  provider message identifiers, and provider-controlled text are removed.
- Release preflight requires Stripe secret, webhook, and publishable keys when
  payment is expected. Post-deploy readiness relies only on the redacted health
  response and no longer requires local service-role or email credentials.
- Migration trigger-function ACLs now match bootstrap, and the production,
  prelaunch, and email runbooks describe the migration maintenance window,
  remote checkpoint gate, retry quarantine, and complete release prerequisites.

Verification evidence:

- focused final-review tests: 44 passed
- full test suite: 226 passed
- TypeScript typecheck: passed
- migration manifest: 26 files verified; 25 remote checkpoints
- bootstrap lexical validation: 504 statements
- disposable PGlite bootstrap: 26 tables, 9 functions, 44 owner policies,
  26 RLS tables, and 24 critical RPCs
- production build: passed
- local production verification: build, smoke audit, and API authorization
  audit passed
- `git diff --check`: passed

No live provider call, remote database mutation, deployment, or production
credential use was performed. The remote checkpoint and guarded live
integration remain operator-controlled release gates.
