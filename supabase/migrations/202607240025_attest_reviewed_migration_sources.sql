-- Bind historically corrected production migrations to their reviewed repository
-- sources without exposing SQL text through the restricted deployment RPC.
begin;

drop function if exists public.get_applied_migration_checkpoints();

create function public.get_applied_migration_checkpoints()
returns table(
  version text,
  name text,
  statement_count integer,
  normalized_md5 text,
  reviewed_source_sha256 text
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
    end as normalized_md5,
    case migration.version
      when '20260723160809' then '79b4edf43881189a4d4a67bf9fc7a0c6317374be73c02cc02a999abadc5b50b0'
      when '20260723165914' then '35259fd0fb8696e51f2911decd42437f162034a80f697b0d02bcda5fc30fd79d'
      when '20260723213355' then '32812965c0ea45cec97741d5ff9fa89455f689dd59bde205c90c9c4c3a0fe010'
      when '20260724005006' then 'b0f6ef066b654cfd0dad723017d4dcbaa28d6ad236fe322151a8027b32bf1b3b'
      when '20260724005024' then 'a5025f4b0ce11d56d691ff6b25f3eb1465529a83407e1aaec9d5bc81208ffb48'
      when '20260724010834' then 'bb780d2211bbc12ca8107209da38d6deb2e70b31e737b036e1de878def815eec'
      when '20260724015714' then '9d2c4ee2460999faa027823a00448a6b7e421620268d806d62f7b11a763012e6'
      when '20260724063323' then '6865603ad6a92e843a2a6e78371b713397ea90e3f963e9d862de56f099185bfb'
      when '20260724083502' then '093e4b476d13242c9922a1dbf84b54cf254433a1b66ffd110eab25a71d4c5d20'
      when '20260724085141' then '0f6379bec1bafbfecc12ea185a113e695f2a19cb727f34d7504499bdc7b6d314'
      else null
    end as reviewed_source_sha256
  from supabase_migrations.schema_migrations as migration
  where migration.version >= '20260723160055'
  order by migration.version;
$$;

revoke all on function public.get_applied_migration_checkpoints() from public, anon, authenticated;
grant execute on function public.get_applied_migration_checkpoints() to service_role, postgres;

commit;
