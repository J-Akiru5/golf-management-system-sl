-- New functions in `public` are not executable by an anonymous caller unless a migration says so.
--
-- 20261030000000 closed the anon grants on the functions that existed then. This fixes the cause.
--
-- Two defaults have to be beaten, and they need different tools.
--
-- 1. Supabase's project default grants EXECUTE on new functions in `public` to anon, authenticated
--    and service_role. That IS a stored default privilege, so `alter default privileges ... revoke`
--    removes it, and this migration does that. Verified: a function created afterwards no longer
--    lists anon in its ACL.
--
-- 2. Postgres grants EXECUTE on every new function to PUBLIC, hard-coded, and `alter default
--    privileges` cannot remove it. That was measured here, not assumed: after the revoke above, a
--    probe function's ACL still read `{=X/postgres, postgres=X/postgres, authenticated=X/postgres,
--    service_role=X/postgres}`, where the leading `=` entry is PUBLIC. PUBLIC is still a door,
--    because every role is implicitly a member of it, so anon inherits EXECUTE straight through it.
--    There is no setting for this. The only way to close it automatically is to revoke it the moment
--    the function exists, which is what the event trigger below does.
--
-- With both in place a new function is closed to PUBLIC and anon and open to authenticated, so the
-- desk keeps working and an anonymous caller cannot reach anything it was not explicitly given.
--
-- A function that is meant to be public still says so, in the migration that creates it:
--
--   grant execute on function public.public_pairings(uuid) to anon, authenticated;
--
-- The grant runs after CREATE, so it survives the trigger. That is the point: the exception is
-- written down where a reader looks for it, instead of being the default for everything.
--
-- Safe to re-run. The self-check at the end creates a function, reads the ACL the trigger produced,
-- and raises unless the posture is right; a raise rolls the whole migration back, so a silent no-op
-- cannot be recorded as applied.

-- 1. The Supabase default. Keeps the intent readable, and does half the job.
alter default privileges in schema public revoke execute on functions from anon;

-- 2. The Postgres default, which the line above cannot reach.
create or replace function public.lock_new_functions()
returns event_trigger
language plpgsql
set search_path = ''
as $$
declare
  cmd record;
begin
  for cmd in select * from pg_catalog.pg_event_trigger_ddl_commands() loop
    -- Only functions. A procedure would need `on procedure`, and this repo has none; when the first
    -- one appears, extend the tag list and the statement together.
    if cmd.command_tag = 'CREATE FUNCTION' then
      execute format('revoke all on function %s from public, anon', cmd.object_identity);
    end if;
  end loop;
end $$;

comment on function public.lock_new_functions() is
  'Event trigger: a newly created function is not executable by PUBLIC or anon. A migration that wants it public grants it afterwards.';

-- The trigger function is not for calling.
revoke all on function public.lock_new_functions() from public, anon;

drop event trigger if exists lock_new_functions;
create event trigger lock_new_functions
  on ddl_command_end
  when tag in ('CREATE FUNCTION')
  execute function public.lock_new_functions();

-- 3. Prove both halves, in this transaction.
do $$
declare
  acl text[];
  open_to_public boolean;
  open_to_anon boolean;
  open_to_authenticated boolean;
begin
  -- Creating this fires the trigger above, so what is read back is what the trigger really did.
  create function public.zz_verify_private_by_default() returns int language sql as 'select 1';

  select p.proacl into acl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'zz_verify_private_by_default' and n.nspname = 'public';

  select exists (select 1 from unnest(coalesce(acl, array[]::text[])) e where e like '=%')
    into open_to_public;
  select exists (
    select 1 from unnest(coalesce(acl, array[]::text[])) e
    where split_part(e, '=', 1) = 'anon'
  ) into open_to_anon;
  select exists (
    select 1 from unnest(coalesce(acl, array[]::text[])) e
    where split_part(e, '=', 1) = 'authenticated'
  ) into open_to_authenticated;

  drop function public.zz_verify_private_by_default();

  if open_to_public then
    raise exception 'A new function is still executable by PUBLIC (acl: %)', acl;
  end if;
  if open_to_anon then
    raise exception 'A new function is still executable by anon (acl: %)', acl;
  end if;
  if not open_to_authenticated then
    raise exception 'A new function is not executable by authenticated, which the desk needs (acl: %)', acl;
  end if;

  raise notice 'Verified: a new function is closed to PUBLIC and anon, open to authenticated (acl: %)', acl;
end $$;
