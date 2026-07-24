# Data Center Migration History

Applied migrations are immutable records. Do not edit a migration after it has been applied to a shared database. Add a new migration for every correction, then update `supabase/migrations/MANIFEST.json` in the same commit.

On 2026-07-24, the after-sales history was reconciled against the stored statements in Supabase project `osmjevtynywbkokzejcp`. The following local files now preserve the statement semantics that actually ran:

| Local file | Stored version | Stored migration name | Normalized stored MD5 |
| --- | --- | --- | --- |
| `202607240018_after_sales_foundation.sql` | `20260724012408` | `after_sales_foundation` | `3f82980f39276ee477d710dce4882367` |
| `202607240019_after_sales_refund_amount_nullability.sql` | `20260724012625` | `after_sales_refund_amount_nullability` | `f46aad27bcf8749e4eb4905430711392` |
| `202607240020_after_sales_cumulative_refund_truth.sql` | `20260724013052` | `after_sales_cumulative_refund_truth` | `fc38c5d86e662b95a72d9172bff7af03` |

The local files use the repository's normalized line endings. Their SQL statement behavior, including the distinct refund-nullability and cumulative-refund stages, is preserved. Migration 021 is the first corrective migration after that restored history.

Run `npm run db:migrations:verify` to catch a changed, missing, or unlisted migration. Run `npm run db:bootstrap:validate` to perform lexical and statement-boundary validation of `supabase/schema.sql`. No local PostgreSQL server or parser dependency was available on this workstation when this document was written, so bootstrap validation is lexical rather than a full PostgreSQL execution. It must be upgraded to an empty local PostgreSQL execution when that runtime becomes available; production must never be used for bootstrap validation.
