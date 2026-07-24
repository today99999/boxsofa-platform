# Data Center Migration History

Applied migrations are immutable records. Do not edit a migration after it has been applied to a shared database. Add a new migration for every correction, then update `supabase/migrations/MANIFEST.json` in the same commit.

On 2026-07-24, the after-sales history was restored from the exact `statements` arrays stored in Supabase project `osmjevtynywbkokzejcp`. Supabase stores each of these migrations as one statement. The local files use UTF-8 LF line endings, while remote comparison first converts CRLF to LF and collapses all final blank lines to one LF. This normalization is implemented and unit-tested in `scripts/verify-migration-manifest.mjs`; SHA-256 still protects every byte of the local file.

| Local file | Stored version | Stored migration name | Normalized stored MD5 | Local SHA-256 |
| --- | --- | --- | --- | --- |
| `202607240018_after_sales_foundation.sql` | `20260724012408` | `after_sales_foundation` | `36aad2e245834e50ed6f117068b71ca0` | `d6f2189f0026fc2de33f056c396fc7b7634b63d01d8a62431a5f14be6c1f5d69` |
| `202607240019_after_sales_refund_amount_nullability.sql` | `20260724012625` | `after_sales_refund_amount_nullability` | `17b52c61a1a27277660291de1fde15b3` | `47298c9a2f2d7d545baa671b42facc326c43a821d8395dd3d5e3509815098c06` |
| `202607240020_after_sales_cumulative_refund_truth.sql` | `20260724013052` | `after_sales_cumulative_refund_truth` | `247684b0ae398baecdb9af5457236841` | `71e26f55eacef700f58efc268f86de3748889ea5db23605c961a47ece5e783d1` |

Migration 018 rejects a null requested refund amount; 019 is the distinct nullability correction; 020 adds the cumulative refund allocation lock. Migration 021 is the first corrective migration after that restored history. `npm run db:migrations:verify` validates every local SHA-256 plus the three production normalized MD5 checkpoints, so changing either content or its canonical remote SQL fails locally.

Run `npm run db:migrations:verify` to catch a changed, missing, or unlisted local migration. Every release must also run `SUPABASE_PROJECT_REF=<project-ref> SUPABASE_ACCESS_TOKEN=<management-token> npm run db:migrations:verify-remote`. Remote mode uses Supabase's read-only Management API to query `supabase_migrations.schema_migrations` at run time and compares the version, name, statement count, normalized statement MD5, and canonical statement text. It never uses the service-role REST API, and it intentionally fails when local SQL and its manifest are changed together but the remote history is different.

Run `npm run db:bootstrap:validate` for the fast lexical precheck, then `npm run db:bootstrap:execute` for a disposable, in-memory PGlite PostgreSQL execution of the full `supabase/schema.sql` plus catalog assertions. The execution command loads real `pgcrypto`; it stubs only the Supabase `auth.users`, `auth.uid()`, `auth.role()`, `anon`/`authenticated`/`service_role` roles, and empty `supabase_realtime` publication that the bootstrap references. It does not validate Supabase Auth or Realtime service behavior, and it never contacts production or creates a cloud branch.
