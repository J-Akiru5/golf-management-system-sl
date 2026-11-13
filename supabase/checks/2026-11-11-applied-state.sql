-- Read-only. Paste the whole file into the Supabase SQL editor and read the four result sets.
--
-- It answers three questions the repository cannot answer by itself:
--   1. Which of the 8-11 November versions does the live ledger record?
--   2. Does the live schema actually contain the function each migration creates, and does the
--      function body carry the marker for that migration?
--   3. Are the public release guards still present on every guarded surface?
--
-- A ledger row is not proof on its own: several migrations were applied by hand in this editor.
-- A function body is proof for 20261108001100 because no later migration replaces
-- save_handicap_snapshot. It is proof for 20261108000100 because no migration replaces open_round.

-- 1. The ledger rows for the whole November stack ------------------------------------------------
-- 20261108003000 was applied by hand in the SQL editor. If it has no row here, a future db push
-- would re-run it after 20261110000100 and replace three guarded public functions. In that case
-- record the truth instead of pushing it again:
--     supabase migration repair --status applied 20261108003000
-- Do not run that command until section 4 shows the three functions present and guarded.
with expected(version) as (
  values
    ('20261108000100'), ('20261108000200'), ('20261108000300'),
    ('20261108000500'), ('20261108000600'), ('20261108000700'),
    ('20261108000800'), ('20261108000900'), ('20261108001000'),
    ('20261108001100'), ('20261108002000'), ('20261108002100'),
    ('20261108003000'), ('20261108004000'),
    ('20261110000000'), ('20261110000100'),
    ('20261110000200'), ('20261110000300')
)
select e.version, (m.version is not null) as ledger_row
from expected e
left join supabase_migrations.schema_migrations m on m.version = e.version
order by e.version;

-- 2. Verdict for the two migrations in question ---------------------------------------------------
select
  '20261108000100 open_round' as migration,
  exists (
    select 1 from supabase_migrations.schema_migrations where version = '20261108000100'
  ) as ledger_row,
  to_regprocedure(
    'public.open_round(uuid, integer, smallint, text, uuid, text, smallint)'
  ) is not null as function_present,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'open_round'
      and p.prosrc like '%open_round_missing_settings%'
  ) as body_matches_migration
union all
select
  '20261108001100 cap handicap snapshot',
  exists (
    select 1 from supabase_migrations.schema_migrations where version = '20261108001100'
  ),
  to_regprocedure(
    'public.save_handicap_snapshot(uuid, numeric, text, date, numeric, text, text)'
  ) is not null,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'save_handicap_snapshot'
      and p.prosrc like '%least(v_on_file%'
      and p.prosrc like '%indexOnFile%'
  );

-- 3. The live bodies, for reading -----------------------------------------------------------------
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('open_round', 'save_handicap_snapshot')
order by p.proname;

-- 4. The release guards on every guarded surface --------------------------------------------------
-- A false here means a public surface is live without its publish_allows guard.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments,
  (position('publish_allows' in p.prosrc) > 0) as calls_publish_allows
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'public_pairings',
    'public_pairings_by_day',
    'public_programme',
    'public_team_leaderboard',
    'public_published_rounds',
    'public_round_results',
    'public_player_scorecard',
    'public_player_photos'
  )
order by p.proname, arguments;
