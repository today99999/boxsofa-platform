-- Return every Data Center migration fingerprint so deployment cannot pass with
-- a partially applied schema. Future migrations must be added to the manifest.
begin;

create or replace function public.get_applied_migration_checkpoints()
returns table(
  version text,
  name text,
  statement_count integer,
  normalized_md5 text
)
language sql
security definer
set search_path = public, supabase_migrations, pg_temp
as $$
  select
    migration.version,
    migration.name,
    cardinality(migration.statements)::integer as statement_count,
    case
      when cardinality(migration.statements) = 1 then md5(
        regexp_replace(replace(migration.statements[1], E'\r\n', E'\n'), E'\n+$', E'\n')
      )
      else null
    end as normalized_md5
  from supabase_migrations.schema_migrations as migration
  where migration.version >= '20260723160055'
  order by migration.version;
$$;

revoke all on function public.get_applied_migration_checkpoints() from public, anon, authenticated;
grant execute on function public.get_applied_migration_checkpoints() to service_role, postgres;

commit;
