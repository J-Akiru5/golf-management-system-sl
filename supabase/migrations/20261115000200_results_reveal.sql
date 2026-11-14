-- The public reveal state of the awarding, per lane. NOT APPLIED. --------------------------------
--
-- Numbered 000200 on the same day as 20261115000100_card_handicap_signed_handicap.sql (issue 301)
-- so two branches never ship one migration number. Apply it after that file.
--
-- This file is written and reviewed but has NOT been applied to any project, live or otherwise.
-- The feature works without it: the desk hides the results and the player list through the
-- existing `set_public_release()` (enforced by 20261110000100), and the reveal from the desk page
-- still releases them. What is missing without this file is only the public countdown, because a
-- signed-out page has no way to read a timestamp from `tournaments` (anon has no policy on that
-- table).
--
-- Where the state lives, and why nothing else is added:
--
--   `tournaments.publish_views` is one JSON object. The awarding stores its six lanes in it, one
--   entry per lane, with the organizer's own row update, which the existing
--   `tournaments_manager_write` policy already allows:
--
--     {"resultsLanes": {"classA":     {"state": "held", "releaseAt": "...",
--                                       "board": [{"position":1,"name":"...","score":38,"tie":false}]},
--                       "classB":     {"state": "released", "board": [...]},
--                       "classC":     {"state": "held", "releaseAt": "..."},
--                       "classD":     {"state": "released"},
--                       "netOverall": {"state": "released"},
--                       "grossOverall": {"state": "released"}},
--      "resultsRevealAt": "..."}
--
--   The board is the top three the desk confirmed for that lane. It is written with the lane and is
--   returned to the public only while the lane is released, which is what makes a held lane answer
--   nothing to a deep link or a direct call.
--
--   `publish_allows()` only reads the key it is asked about, so the extra keys are inert to every
--   enforced surface, and `public_release_state()` builds its own booleans, so neither key is
--   exposed there. That is deliberate: the release switch stays booleans only.
--
--   `resultsRevealAt` is the whole-page countdown the current holding screen reads. It stays while
--   the lane boards are built and goes away when the last page reads lanes instead.
--
--   This migration therefore adds one read-only function that returns the event id, the whole-page
--   reveal time and the six lanes, and nothing else. It adds no column, changes no existing
--   function, and writes no event row.
--
-- What this migration deliberately does NOT do: it does not gate any score read by lane. The hard
-- gate stays the `leaderboard` and `roster` keys already enforced in the database, so a deep link or
-- an anon RPC for held results returns nothing today. A lane-level score gate belongs with the
-- top-three boards themselves, because that is the function that has to consult it; inventing one
-- here without those boards would create a gate nothing calls.
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
  ),
  -- The lanes this build knows. A lane stored by a newer build and not listed here is not exposed,
  -- so a public read cannot be widened by writing an extra key into the event row.
  lanes(id) as (
    values ('classA'), ('classB'), ('classC'), ('classD'), ('netOverall'), ('grossOverall')
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
      end,
      -- One entry per lane, built from the fields this read is allowed to name. A lane with no
      -- stored entry is held: the awarding shows nothing until the club releases that lane, which is
      -- the whole point of the screen. (The application's own default for a *missing* function is
      -- the opposite, released, so a failed read never freezes a page.)
      --
      -- The confirmed board is returned only for a released lane. That is the gate the issue asks
      -- for: a held lane answers with no name and no score even to a direct RPC call, so nothing
      -- arrives at a browser that could be read out of the response.
      'lanes', (
        select jsonb_object_agg(
          l.id,
          jsonb_build_object(
            'state', case
              -- Held unless the desk has released this lane. A lane with no stored entry, and a
              -- lane with a value this build does not understand, both answer held: the awarding
              -- shows nothing until the club releases it.
              when coalesce(s.publish_views -> 'resultsLanes' -> l.id ->> 'state', '')
                = 'released' then 'released'
              else 'held'
            end,
            'releaseAt', case
              when coalesce(s.publish_views -> 'resultsLanes' -> l.id ->> 'state', '')
                <> 'released'
                and coalesce(s.publish_views -> 'resultsLanes' -> l.id ->> 'releaseAt', '')
                ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
              then (s.publish_views -> 'resultsLanes' -> l.id ->> 'releaseAt')::timestamptz
              else null
            end,
            'board', case
              when coalesce(s.publish_views -> 'resultsLanes' -> l.id ->> 'state', '')
                <> 'released' then '[]'::jsonb
              when jsonb_typeof(s.publish_views -> 'resultsLanes' -> l.id -> 'board') = 'array'
                then s.publish_views -> 'resultsLanes' -> l.id -> 'board'
              else '[]'::jsonb
            end
          )
        )
        from lanes l
      )
    )
  end
  from selected s;
$$;

comment on function public.public_reveal_state(uuid) is
  'The reveal state of the awarding: the event id, the whole-page reveal time and the six lane states with the confirmed top three of every released lane. No player, score, tee, photo, release switch or stored publish_views object beyond a released lane board. A lane with no stored entry answers held with an empty board, and a released lane answers the board the desk confirmed.';

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
  -- Every lane the application sends must be answered, or a held lane would arrive released.
  if v_body not like '%''classA''%'
     or v_body not like '%''classB''%'
     or v_body not like '%''classC''%'
     or v_body not like '%''classD''%'
     or v_body not like '%''netOverall''%'
     or v_body not like '%''grossOverall''%' then
    raise exception 'public_reveal_state does not answer all six awarding lanes';
  end if;
  -- The board must be gated by the lane's own state, never returned regardless of it.
  if v_body not like '%''board''%' or v_body not like '%''[]''::jsonb%' then
    raise exception 'public_reveal_state does not hold the board of a held lane';
  end if;
end $$;
