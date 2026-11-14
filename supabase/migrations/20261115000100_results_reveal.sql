-- The public reveal time of the results blackout. NOT APPLIED. --------------------------------
--
-- This file is written and reviewed but has NOT been applied to any project, live or otherwise.
-- The feature works without it: the desk hides the results and the player list through the
-- existing `set_public_release()` (enforced by 20261110000100), and the reveal from the desk page
-- still releases them. What is missing without this file is only the public countdown, because a
-- signed-out page has no way to read a timestamp from `tournaments` (anon has no policy on that
-- table).
--
-- Where the time lives, and why nothing else is added:
--
--   `tournaments.publish_views` is one JSON object. The blackout stores `resultsRevealAt` in it with
--   the organizer's own row update, which the existing `tournaments_manager_write` policy already
--   allows. `publish_allows()` only reads the key it is asked about, so the extra key is inert to
--   every enforced surface, and `public_release_state()` builds its own booleans, so the key is not
--   exposed there either. That is deliberate: the switch surface stays booleans only.
--
--   This migration therefore adds one read-only function that returns the reveal time and the event
--   id and nothing else. It adds no column, changes no existing function, and writes no event row.
--
-- Apply order: after 20261110000100_public_release_enforcement.sql. Nothing needs to be applied
-- before the application code ships; the code treats a missing function as "no countdown".

create or replace function public.public_reveal_state(p_tournament uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected as (
    select t.id, t.publish_views
    from public.tournaments t
    where p_tournament is null or t.id = p_tournament
    order by
      case when t.play_date >= current_date then 0 else 1 end,
      case when t.play_date >= current_date then t.play_date end asc nulls last,
      case when t.play_date < current_date then t.play_date end desc nulls last,
      t.created_at desc
    limit 1
  )
  select case
    when s.id is null then null
    else jsonb_build_object(
      'tournamentId', s.id,
      -- A stored value that is not an ISO timestamp is no reveal time, never a cast error that
      -- would break the holding screen.
      'revealAt', case
        when (s.publish_views ->> 'resultsRevealAt')
          ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
        then (s.publish_views ->> 'resultsRevealAt')::timestamptz
        else null
      end
    )
  end
  from selected s;
$$;

comment on function public.public_reveal_state(uuid) is
  'The reveal time of a results blackout, and the event id. Two values only: no player, score, tee, photo, release key or stored publish_views object. An event with no reveal time answers a null revealAt.';

revoke all on function public.public_reveal_state(uuid) from public;
grant execute on function public.public_reveal_state(uuid) to anon, authenticated;

-- Catalog checks only. No event, registration or player row is read or written here.
do $$
declare
  v_body text;
begin
  if to_regprocedure('public.public_reveal_state(uuid)') is null then
    raise exception 'public_reveal_state was not created';
  end if;

  if not exists (
    select 1 from pg_proc p
     where p.proname = 'public_reveal_state'
       and p.pronamespace = 'public'::regnamespace
       and p.prosecdef
       and p.proacl is not null
       and exists (select 1 from unnest(p.proacl) a where a::text like 'anon=%')
  ) then
    raise exception 'public_reveal_state is not a security definer function anon may execute';
  end if;

  select p.prosrc into v_body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'public_reveal_state';
  if v_body is null then
    raise exception 'public_reveal_state has no body';
  end if;
  -- This read must never grow into a player or score read. It may name the event table only.
  if v_body like '%public.registrations%'
     or v_body like '%public.players%'
     or v_body like '%public.round_publications%'
     or v_body like '%public.competition_rounds%'
     or v_body like '%public.scorecards%' then
    raise exception 'public_reveal_state reads player or score data';
  end if;
end $$;
