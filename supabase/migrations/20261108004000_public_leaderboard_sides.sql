-- RETIRED: recorded no-op. Do not put the leaderboard body back in this file.
--
-- This file was written on 8 November 2026 and never applied. Its version prefix sorts before
-- 20261110000000_publish_views.sql and 20261110000100_public_release_enforcement.sql, so a future
-- `supabase db push` would apply it AFTER the public release policy is live. That would replace
-- public.public_team_leaderboard with a body that has no `published` check and no
-- `publish_allows(..., 'leaderboard')` guard, silently reopening a surface the desk has held.
--
-- Everything this file added is already in 20261110000100_public_release_enforcement.sql: the
-- nullable `side` field, the member-before-guest ordering, the same signature and the same grants.
-- That migration is applied and it supersedes this one.
--
-- Keeping the version as a no-op, rather than deleting or renumbering it, is safe in every history
-- state:
--   * a database that never recorded this version records it without changing a function;
--   * a database that did record it (the changelog says it did not) is left exactly as it is;
--   * applying pending migrations in filename order can never regress the leaderboard guard.
--
-- If the pair side needs to change, change 20261110000100 or add a migration that sorts after the
-- release-policy migrations and keeps the guard.

do $$
begin
  -- Intentionally empty: this version is recorded, and no schema change is made.
  null;
end;
$$;
