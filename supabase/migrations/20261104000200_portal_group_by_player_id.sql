-- Match a player's published start on the snapshot's stable player id.
--
-- The previous lookup used JSON containment on the group's `players` array with the caller's full
-- name. Two players with the same full name could therefore see the same group and tee time. The
-- published snapshot stores `playerIds` beside `players`, so the player id is the reliable key.
-- Snapshots written before the ids were stored keep the name match, but only when `playerIds` is
-- absent; a new snapshot with an empty id list must not silently fall back to a name match.

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
        select jsonb_build_object(
          'hole', g ->> 'startHole',
          'wave', g -> 'wave',
          'time', g ->> 'time'
        )
        from jsonb_array_elements(coalesce(t.published_snapshot -> 'groups', '[]'::jsonb)) g
        -- The id is the stable key. The name is only for snapshots written before playerIds.
        where case
          when jsonb_exists(g, 'playerIds')
            then (g -> 'playerIds') @> to_jsonb(m.id::text)
          else (g -> 'players') @> to_jsonb(m.full_name)
        end
        limit 1
      ) as start
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
          'start', start,
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

revoke all on function public.player_portal_entries() from public;
grant execute on function public.player_portal_entries() to authenticated;
