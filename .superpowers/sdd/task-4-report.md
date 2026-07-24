# Task 4 — Bounded Automatic Email Dispatcher

## Result

- Added a service-role dispatcher that selects one deterministic batch of at most 20 eligible notification snapshots and delegates every delivery to the established claim/provider/finalize helper.
- Added exact bearer-token authorization and a dynamic cron route that authenticates before reading configuration or opening a database client.
- Route output is limited to aggregate counts or generic error messages; it contains no snapshot data, recipient details, body content, or credentials.

## TDD evidence

1. RED: added dispatcher, cron-auth, and route-contract tests before implementation. The first focused run failed because the dispatcher, auth module, and route did not exist.
2. GREEN: implemented the smallest dispatcher, auth helper, and route needed by those tests. The focused suite then passed.
3. A typecheck exposed that the Supabase query/RPC builders are `PromiseLike` rather than native `Promise`; the repository boundary was corrected and the focused suite was rerun.

## Verification

Commands run successfully:

- `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test lib/server/email-notification-dispatcher.test.ts lib/server/email-cron-auth.test.ts lib/server/email-cron-route.test.ts lib/server/email-notification-delivery.test.ts` — 12 passed.
- `npm run typecheck` — passed.
- `npm test` — 201 passed, 0 failed.
- `git diff --check` — passed.

## Files

- `lib/server/email-notification-dispatcher.ts`
- `lib/server/email-notification-dispatcher.test.ts`
- `lib/server/email-cron-auth.ts`
- `lib/server/email-cron-auth.test.ts`
- `lib/server/email-cron-route.test.ts`
- `app/api/cron/email-notifications/route.ts`

## Self-review

- The selection filter includes only queued/failed rows and expired sending leases, with `created_at ASC, id ASC` ordering and a 20-row cap. A local retryability guard prevents accidental delivery if a repository returns an ineligible row.
- Claim/finalize semantics, the five-minute lease, and provider idempotency key remain owned by `deliverEmailNotification`; the dispatcher does not replicate the delivery state machine.
- Provider failures, conflicts, and non-finalized results are aggregated while later snapshots still run. No dispatcher or route logging emits customer data.
- No schedule, environment documentation, or operations documentation was added.

## Concerns

None. Commit: `feat: dispatch queued email notifications`.
