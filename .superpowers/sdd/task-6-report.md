# Task 6: After-Sales Foundation

## Completed

- Added owner-only list, create, and optimistic-concurrency PATCH endpoints for after-sales cases.
- Added collision-resistant `AS-<UTC timestamp>-<sequence>` database case numbers and a deterministic client helper for unit coverage.
- Added database transaction functions for case creation and updates. Each mutation writes its admin audit record in the same transaction.
- Added immutable order/case/type/reason boundaries, legal one-way status transitions, terminal status protection, future due-date validation, and version preconditions.
- Refund workflow values use integer cents at the API/RPC boundary. A `refunded` case requires a succeeded EUR payment refund, and all requested amounts are bounded by both the order total and actual succeeded refunds.
- Added safe stable pagination (`created_at`, `id`), a maximum page size of 200, status filtering, and bounded case-number search.
- Added anonymous API audit coverage for all three after-sales endpoints.

## TDD

- RED: added deterministic case-number, terminal-transition, cent-precision, migration-contract, auth-before-body, UUID, and bounded-pagination tests.
- GREEN: implemented the helper, route handlers, and service-only transactional PostgreSQL RPCs.

## Database

- Applied and verified `after_sales_foundation`, `after_sales_refund_amount_nullability`, and `after_sales_cumulative_refund_truth` on Supabase project `osmjevtynywbkokzejcp`.
- Verified the `version` column and that the after-sales RPCs are executable only by `postgres` and `service_role`.
- No fixture records were created.

## Validation

- `npm.cmd test` - 127 passed.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run build` - passed.
- Local production `npm.cmd run api:auth-audit` - passed, including the three new protected endpoints.
- `git diff --check` - passed.

## Concerns

None. The current public deployment will need the feature branch deployed before the new endpoints are reachable on `boxsofa.eu`.

## Review Remediation (2026-07-24)

- Restored local migrations 018 and 019 from the statements recorded in `supabase_migrations.schema_migrations`; 020 remains the final cumulative-refund migration. The remote version mapping and normalized stored checksums are recorded in `docs/data-center-migration-history.md`.
- Added immutable migration manifest verification for every SQL migration, plus lexical bootstrap SQL validation. Local PostgreSQL and an installed parser were not available, so bootstrap execution remains an explicit non-production follow-up rather than a production operation.
- Removed the `+--` patch artifact from `supabase/schema.sql` and scanned the schema for patch and merge artifacts.
- Replaced offset pagination with a base64url opaque `(created_at, id)` cursor. It uses a descending tuple predicate, `limit + 1` (maximum 201), strict literal case-number search, and preserves PostgreSQL UTC microseconds.
- Added exact refund amount parsing: canonical decimal strings are converted to safe integer cents; legacy numeric values use a narrow floating-point tolerance; more than two decimal places are rejected.
- Added route-side future due-date checks, known RPC error-to-HTTP mapping, and an unbounded `AS-<UTC timestamp>-<sequence>` database case-number format.
- Added an opt-in, non-production-only two-client Supabase integration script for concurrent creates, optimistic updates, and cumulative refund allocation. It reuses the strict canonical non-production project guard and is not run against production.

## Remote Verification

- Applied `after_sales_cursor_and_case_number_safety` as remote migration version `20260724015714` on project `osmjevtynywbkokzejcp`.
- Read-only verification confirmed: no after-sales case fixtures (`count = 0`), the new sequence-padding contract is installed, the function remains `SECURITY DEFINER`, only `service_role` can execute it, authenticated users cannot, and the owner-only RLS policy remains present.

## Review Remediation Validation

- `npm.cmd test` - 135 passed.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run db:migrations:verify` - 21 SQL migrations verified.
- `npm.cmd run db:bootstrap:validate` - 475 lexical SQL statements validated.
- `npm.cmd run build` - passed.
- Local production `npm.cmd run api:auth-audit` - passed on port 3041; temporary server stopped.
- `git diff --check` - passed.

## Exact History And Bootstrap Execution Remediation (2026-07-24)

- Re-read the exact one-element `statements` arrays and metadata for remote migrations `20260724012408`, `20260724012625`, and `20260724013052` from project `osmjevtynywbkokzejcp`, without applying or changing any production migration.
- Restored 018's original non-null refund completion condition. 018, 019, and 020 now have the exact distinct normalized production fingerprints documented in `docs/data-center-migration-history.md` and `supabase/migrations/MANIFEST.json`.
- Raised the manifest to version 2. `npm.cmd run db:migrations:verify` now validates all local SHA-256 values and the remote normalized MD5 checkpoint, version, name, and one-statement shape for 018-020. The canonical comparison converts CRLF to LF and collapses only final blank lines; its behavior has direct unit coverage.
- Detected no Docker, Supabase CLI, or `psql` on this workstation. Added the deterministic `@electric-sql/pglite` dev dependency and `npm.cmd run db:bootstrap:execute`.
- Bootstrap execution starts a disposable in-memory PostgreSQL engine with the real PGlite `pgcrypto` extension, executes the full `supabase/schema.sql`, then asserts 13 core tables, 8 core functions, five owner-only policies, and RLS coverage. It stubs only the referenced Supabase Auth schema/functions/roles and empty Realtime publication. No database files, production writes, cloud branch, or fixture data remain after the process closes.

### Exact Commands And Results

- `npm.cmd run db:migrations:verify` - passed: 21 SQL files and 3 remote checkpoints verified.
- `npm.cmd run db:bootstrap:validate` - passed: 475 lexical SQL statements validated.
- `npm.cmd run db:bootstrap:execute` - passed: 13 core tables, 8 core functions, 5 owner policies, and 26 RLS tables in disposable PGlite.
- `npm.cmd test` - passed: 137 tests.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run build` - passed.
- `API_AUDIT_BASE_URL=http://localhost:3042 npm.cmd run api:auth-audit` - passed against a temporary local production server; the server was stopped immediately afterward.
- `git diff --check` - passed.

### Residual Scope

PGlite executes the full schema with a real PostgreSQL parser/executor and real `pgcrypto`, but the necessary local Auth and Realtime objects are stubs. This validates SQL syntax, dependencies, tables, functions, policies, and RLS catalog state, not Supabase Auth or Realtime service behavior. Docker, Supabase CLI, and `psql` were not installed; no production bootstrap or paid cloud branch was used.

## Final Verification-Mechanism Remediation (2026-07-24)

- Added explicit `--remote` / `SUPABASE_MIGRATION_VERIFY_REMOTE=1` mode to `scripts/verify-migration-manifest.mjs`. Release CI must provide `SUPABASE_PROJECT_REF` and `SUPABASE_ACCESS_TOKEN`; the script uses the official Supabase Management API read-only query endpoint, never service-role REST access.
- The remote gate queries `supabase_migrations.schema_migrations` at execution time and strictly compares each restored migration's version, name, statement count, normalized statement MD5, and normalized statement text. Tests prove that changing local SQL and its manifest hash together still fails against remote truth, and cover missing versions, changed names, counts, hashes, and exact matches with an injected fetch adapter.
- Documented `npm run db:migrations:verify-remote` as a required release gate in `docs/data-center-migration-history.md`.
- Replaced broad PGlite assertions with exact catalog assertions: 26 expected RLS tables each require `relrowsecurity`, seven critical owner policies require exact command/roles/USING/WITH CHECK expressions, and every current public-schema `SECURITY DEFINER` RPC is enumerated with exact identity arguments, `search_path`, and ACL assertions. This includes analytics intent/rate-limit, Stripe financial, after-sales, email delivery, and internal delegation RPCs. The disposable Auth stubs do not grant any application RPC privilege.

### Final Verification

- `npm.cmd test` - 140 passed.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run db:migrations:verify` - passed: 21 SQL migrations and 3 local checkpoints.
- `npm.cmd run db:bootstrap:validate` - passed: 475 lexical statements.
- `npm.cmd run db:bootstrap:execute` - passed: 26 core tables, 26 individual RLS checks, 7 exact owner policies, and 22 `SECURITY DEFINER` RPCs.
- `npm.cmd run build` - passed.
- `API_AUDIT_BASE_URL=http://localhost:3043 npm.cmd run api:auth-audit` - passed against a temporary local production server; server stopped.
- Production connector read-only confirmation - passed for migration versions `20260724012408`, `20260724012625`, and `20260724013052`; each matches its expected name, one-statement shape, and normalized MD5. No production writes or fixtures were made.

### Remote Mode Residual

`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, and `SUPABASE_DB_URL` are not available in this local shell, so `npm.cmd run db:migrations:verify-remote` was not executed here. Its injected-fetch unit tests passed, and the independent Supabase connector read-only query confirmed the current production truth. Release CI must execute the documented remote command with a Management API token that has `database_read` permission.

## Verification Gate Closure (2026-07-24)

- Replaced the PGlite subset checks with a closed public-base-table catalog. The full actual `public` base-table list must exactly match all 26 expected tables, and each table must have RLS enabled. An unlisted table or any missing table now fails before release.
- Made sensitive policy validation closed and exact for payments, refunds, email notifications, after-sales, analytics consents/events/intents/heads/rate limits, source health, dashboard alerts, and Stripe webhook events. The assertion compares table, policy name, command, roles, normalized `USING`, and normalized `WITH CHECK`; tables intentionally limited to service RPCs explicitly have no policy rows.
- Added executable negative coverage for an added public table with RLS disabled, disabled RLS on an expected table, an extra permissive `USING (true)` analytics policy, wrong policy roles/commands, and a changed SECURITY DEFINER RPC signature.
- Added `production:verify:local`, which performs local manifest, bootstrap, PGlite, tests, typecheck, production build, temporary-server smoke, and API authorization audits. It is explicitly offline-only.
- Made `production:verify` the authoritative release command. It runs `db:migrations:verify-remote` first and stops immediately when the required `SUPABASE_PROJECT_REF` or fine-grained Management API `SUPABASE_ACCESS_TOKEN` is missing or remote history differs. `deploy:preflight` delegates only to that release command.
- Updated migration-history documentation to distinguish offline repository checkpoints from live remote verification and require masked CI secrets with `database_read` permission.

### Closure Validation

- `npm.cmd test` - passed: 144 tests, including release-gate and catalog-negative cases.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run db:migrations:verify` - passed: 21 SQL migrations and 3 repository checkpoints.
- `npm.cmd run db:bootstrap:execute` - passed: 26 exact public base tables with RLS, 8 sensitive policy rows, and 22 critical SECURITY DEFINER RPCs.
- `LOCAL_VERIFY_PORT=3046 npm.cmd run production:verify:local` - passed: lexical validation, PGlite, tests, typecheck, production build, local smoke, and API authorization audit. The temporary Next.js server was stopped.
- `git diff --check` - passed.

### Release Gate Behavior

The authoritative remote command was deliberately not run from this local shell because management credentials are absent. A process-level test proves that `production:verify --release` exits nonzero and does not continue to live checks when those credentials are empty. CI must supply the masked project reference and a masked fine-grained token with `database_read`; only then can the release gate succeed.

## Automatic Deploy Gate Closure (2026-07-24)

- Added `vercel.json` with `npm run deploy:preflight && npx --no-install next build`. Every Vercel build now runs the remote truth check, local migration manifest, lexical bootstrap validation, disposable PGlite execution, tests, and typecheck before Vercel compiles the application. The preflight deliberately does not call `next build`, so it cannot recurse.
- Added `202607240022_verify_migration_checkpoints_rpc.sql` and mirrored it in `supabase/schema.sql`. `public.get_applied_migration_checkpoints()` is a no-argument, fixed-whitelist SECURITY DEFINER RPC that returns only `version`, `name`, `statement_count`, and `normalized_md5` for migrations 018-020. It never returns migration SQL or accepts arbitrary input.
- Applied migration 022 to production project `osmjevtynywbkokzejcp` as remote version `20260724063323`. Read-only production verification confirmed the three expected checkpoint rows and hashes, `SECURITY DEFINER`, `search_path=public, supabase_migrations, pg_temp`, and execute permissions: `public`, `anon`, and `authenticated` are false; `service_role` and `postgres` are true. No fixture or business data was written.
- The remote verifier now prefers `NEXT_PUBLIC_SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY` and invokes only the restricted RPC. It falls back to `SUPABASE_PROJECT_REF` plus fine-grained Management API `SUPABASE_ACCESS_TOKEN` with `database_read`. Both routes fail closed, compare exact checkpoint metadata/hashes, and redact credential-bearing HTTP details. The verifier child alone receives the selected secret; all other child processes scrub both remote credentials.
- Replaced the partial sensitive-policy check with a complete, explicit fixture for all 44 `pg_policies` rows across the expected 26 public base tables. The validator now deep-compares every row and rejects any extra, missing, or changed policy. Negative cases cover `USING (true)` policies on `orders`, `profiles`, `admin_audit_log`, `chat_threads`, and `newsletter_subscriptions`.
- Reworked local production verification to reserve an OS-assigned loopback port, require a random process nonce from `/api/health`, detect an unexpected listener, and await graceful exit before force-killing the process tree when necessary. It no longer accepts an old fixed-port Next process.

### Automatic Gate Validation

- `npm.cmd run db:migrations:verify` - passed: 22 SQL migrations and 3 repository checkpoints.
- `npm.cmd run db:bootstrap:validate` - passed: 480 lexical statements.
- `npm.cmd run db:bootstrap:execute` - passed: 26 exact public tables with RLS, 44 exact policy rows, and 23 critical SECURITY DEFINER RPCs.
- `npm.cmd test` - passed: 146 tests, including both remote credential modes, missing/mismatched checkpoints, Vercel build-command gating, full policy closure, and secret-redacted failures.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run build` - passed.
- `npm.cmd run production:verify:local` - passed using dynamic port `127.0.0.1:53249`; smoke and API authorization audit passed; the temporary Next process exited.

### Residual

- The application has not been deployed, by instruction. Before the first Vercel build from this commit, configure either `NEXT_PUBLIC_SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY` (preferred) or `SUPABASE_PROJECT_REF` plus a fine-grained `SUPABASE_ACCESS_TOKEN` with `database_read` in Vercel's build environment. Without one complete pair, the new automatic gate blocks the build by design.
- The Supabase security advisor reports pre-existing informational no-policy tables that are intentionally service-RPC-only, plus existing warnings for the authenticated owner-gated `get_data_center_overview` RPC and leaked-password protection. Migration 022 created no new advisor finding and is not callable by anonymous or authenticated roles.
