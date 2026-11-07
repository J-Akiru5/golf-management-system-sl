-- Player portal: every published start, one per playing day.
--
-- This migration replaces the body of public.player_portal_entries() only. It creates or changes no
-- table, column, policy or grant: `create or replace function` keeps the function's existing
-- signature and ACL, and no revoke or grant is repeated here. The change is additive in behaviour
-- because old clients still read `start`; new clients read `starts`. NOT APPLIED. It is written for
-- review and has not been pushed to any project.
--
-- Why: the portal read the player's start with `limit 1`. A two-day event has one group per day, so
-- the player only ever saw the first day's tee time. `starts` now lists every published group that
-- names the player, ordered by day and then by start hole. `start` stays as the first element so an
-- older client keeps working unchanged.
--
-- The player id stays the reliable match (see 20261104000200). The name is only read for snapshots
-- written before `playerIds` existed.

create or replace function public.player_portal_entries()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select id, club_id, full_name, ngap_id
      from public.players
     where user_id = (select auth.uid())
     limit 1
  ),
  entries as (
    select
      t.id as tournament_id,
      t.name as event_name,
      t.play_date as event_date,
      coalesce(t.dates, array[t.play_date]) as dates,
      t.start_format,
      to_char(t.first_tee_time, 'HH24:MI') as first_tee_time,
      t.state,
      r.club_id,
      r.status,
      r.reasons,
      r.frozen_index,
      r.playing_handicap,
      c.name as category_name,
      tee.name as tee_name,
      f.name as flight_name,
      r.payment_status,
      (t.published_snapshot is not null) as published,
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'dayNumber', coalesce((g.g ->> 'dayNumber')::int, 1),
                   'hole', g.g ->> 'startHole',
                   'wave', g.g -> 'wave',
                   'time', g.g ->> 'time',
                   'dayLabel', nullif(g.g ->> 'dayLabel', '')
                 )
                 order by coalesce((g.g ->> 'dayNumber')::int, 1), (g.g ->> 'startHole')::int
               )
        from jsonb_array_elements(coalesce(t.published_snapshot -> 'groups', '[]'::jsonb)) g(g)
        -- The id is the stable key. The name is only for snapshots written before playerIds.
        where case
          when jsonb_exists(g.g, 'playerIds')
            then (g.g -> 'playerIds') @> to_jsonb(m.id::text)
          else (g.g -> 'players') @> to_jsonb(m.full_name)
        end
      ) as starts
    from public.registrations r
    join public.tournaments t on t.id = r.tournament_id and t.club_id = r.club_id
    left join public.categories c on c.id = r.category_id and c.club_id = r.club_id
    left join public.tees tee on tee.id = r.tee_id and tee.club_id = r.club_id
    left join public.flights f on f.id = r.flight_id and f.club_id = r.club_id
    cross join me m
    where r.player_id = m.id
  )
  select jsonb_build_object(
    'linked', (select count(*) from me) = 1,
    'player', (
      select jsonb_build_object('id', id, 'name', full_name, 'ngapId', ngap_id)
        from me
    ),
    'entries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'tournamentId', tournament_id,
          'eventName', event_name,
          'eventDate', event_date,
          'dates', to_jsonb(dates),
          'startFormat', start_format,
          'firstTeeTime', first_tee_time,
          'state', state,
          'status', status,
          'reasons', to_jsonb(reasons),
          'frozenIndex', frozen_index,
          'playingHandicap', playing_handicap,
          'category', category_name,
          'tee', tee_name,
          'flight', flight_name,
          'paymentStatus', payment_status,
          'published', published,
          -- The first start is kept for older clients that only read `start`.
          'start', starts -> 0,
          'starts', coalesce(starts, '[]'::jsonb),
          'scorecards', coalesce((
            select jsonb_agg(round_card order by day_number)
            from (
              select
                cr.day_number,
                c.value || jsonb_build_object(
                  'roundId', cr.id,
                  'dayNumber', cr.day_number,
                  'playDate', cr.play_date,
                  'state', publication.state,
                  'version', publication.version,
                  'publishedAt', publication.published_at
                ) as round_card
              from public.competition_rounds cr
              join lateral (
                select rp.*
                from public.round_publications rp
                where rp.round_id = cr.id and rp.club_id = cr.club_id
                order by rp.version desc
                limit 1
              ) publication on true
              cross join lateral (
                select value
                from jsonb_array_elements(coalesce(publication.snapshot -> 'cards', '[]'::jsonb))
                where value ->> 'playerId' = (select id::text from me)
                limit 1
              ) c
              where cr.tournament_id = entries.tournament_id
                and cr.club_id = entries.club_id
                and cr.status in ('provisional', 'final')
            ) rounds
          ), '[]'::jsonb)
        )
        order by event_date desc, event_name
      )
      from entries
    ), '[]'::jsonb)
  );
$$;
