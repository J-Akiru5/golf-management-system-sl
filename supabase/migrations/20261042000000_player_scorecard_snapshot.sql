-- Player scorecard breakdown ---------------------------------------------------------------------
--
-- ADDITIVE. The published round snapshot gains a `cards` array with the frozen hole-by-hole
-- breakdown for every published player. The public results function strips that array, so the
-- anonymous leaderboard payload does not change. The signed-in player portal reads the same frozen
-- snapshot and returns only the caller's own card.
--
-- No table is created or altered. The existing publication snapshot is the freeze: a player never
-- reads the live scoring tables.

-- One card per published player, built from the same canonical rows the result totals came from ---

create or replace function public.build_round_scorecards(
  p_round uuid,
  p_holes integer
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with course as (
    select r.club_id, t.course_id
    from public.competition_rounds r
    join public.tournaments t on t.id = r.tournament_id and t.club_id = r.club_id
    where r.id = p_round
  )
  select coalesce(jsonb_agg(card order by player_name), '[]'::jsonb)
  from (
    select
      p.full_name as player_name,
      jsonb_build_object(
        'playerId', p.id,
        'playerName', p.full_name,
        'flightName', f.name,
        'playingHandicap', hs.playing_handicap,
        'courseHandicap', hs.course_handicap,
        'grossStrokes', rr.gross_strokes,
        'netStrokes', rr.net_strokes,
        'grossPoints', rr.gross_points,
        'netPoints', rr.net_points,
        'holesCounted', rr.holes_counted,
        'holesTotal', p_holes,
        'holes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'hole', s.hole_number,
            'par', h.par,
            'strokeIndex', h.stroke_index,
            'grossStrokes', s.strokes,
            'handicapStrokes', st.strokes,
            'netStrokes', case
              when st.strokes is null then null
              else s.strokes - st.strokes
            end,
            'grossPoints', greatest(0, 2 + h.par - s.strokes),
            'netPoints', case
              when st.strokes is null then null
              else greatest(0, 2 + h.par - (s.strokes - st.strokes))
            end
          ) order by s.hole_number)
          from public.approved_hole_scores s
          join public.holes h
            on h.club_id = s.club_id
           and h.course_id = c.course_id
           and h.number = s.hole_number
          cross join lateral (
            select public.handicap_strokes(
              hs.playing_handicap, h.stroke_index, p_holes::smallint
            ) as strokes
          ) st
          where s.round_id = rr.round_id
            and s.player_id = rr.player_id
            and s.club_id = rr.club_id
            and s.superseded_at is null
            and s.verification in ('verified', 'provisional')
        ), '[]'::jsonb)
      ) as card
    from public.round_results rr
    join public.players p on p.id = rr.player_id and p.club_id = rr.club_id
    left join public.flights f on f.id = rr.flight_id and f.club_id = rr.club_id
    cross join course c
    left join lateral (
      select snapshot.*
      from public.handicap_snapshots snapshot
      join public.round_entries entry
        on entry.id = snapshot.round_entry_id and entry.club_id = snapshot.club_id
      join public.registrations registration
        on registration.id = entry.registration_id and registration.club_id = entry.club_id
      where snapshot.round_id = rr.round_id
        and snapshot.club_id = rr.club_id
        and entry.round_id = rr.round_id
        and registration.player_id = rr.player_id
      order by snapshot.created_at desc
      limit 1
    ) hs on true
    where rr.round_id = p_round
      and rr.club_id = c.club_id
      and rr.superseded_at is null
      and rr.holes_counted > 0
      and exists (
        select 1
        from public.round_entries re
        join public.registrations reg
          on reg.id = re.registration_id and reg.club_id = re.club_id
        where re.round_id = rr.round_id and re.club_id = rr.club_id
          and re.status = 'active' and reg.player_id = rr.player_id
      )
  ) cards;
$$;

revoke all on function public.build_round_scorecards(uuid, integer)
  from public, anon, authenticated;

-- The publication snapshot now carries the cards ------------------------------------------------

create or replace function public.build_round_snapshot(
  p_round uuid,
  p_state text,
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_event_name text;
  v_play_date date;
  v_holes integer;
  v_snapshot jsonb;
begin
  select r.club_id, r.play_date, t.name
  into v_club, v_play_date, v_event_name
  from public.competition_rounds r
  join public.tournaments t on t.id = r.tournament_id and t.club_id = r.club_id
  where r.id = p_round;

  if v_club is null then
    raise exception 'Round not found' using errcode = 'P0002';
  end if;

  select count(*) into v_holes
  from public.holes h
  join public.tournaments t on t.course_id = h.course_id and t.club_id = h.club_id
  join public.competition_rounds r on r.tournament_id = t.id and r.club_id = t.club_id
  where r.id = p_round and h.club_id = v_club;

  if v_holes = 0 then
    raise exception 'The course has no holes' using errcode = '23514';
  end if;

  select jsonb_build_object(
    'eventName', v_event_name,
    'playDate', v_play_date,
    'version', p_version,
    'state', p_state,
    'publishedAt', now(),
    'gross', coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', p.id,
        'playerName', p.full_name,
        'flightName', f.name,
        'points', rr.gross_points,
        'strokes', rr.gross_strokes,
        'holesCounted', rr.holes_counted,
        'holesTotal', v_holes
      ) order by rr.gross_points desc, p.full_name)
      from public.round_results rr
      join public.players p on p.id = rr.player_id and p.club_id = rr.club_id
      left join public.flights f on f.id = rr.flight_id and f.club_id = rr.club_id
      where rr.round_id = p_round and rr.superseded_at is null
        and rr.holes_counted > 0
        and exists (
          select 1
          from public.round_entries re
          join public.registrations reg
            on reg.id = re.registration_id and reg.club_id = re.club_id
          where re.round_id = rr.round_id and re.club_id = rr.club_id
            and re.status = 'active' and reg.player_id = rr.player_id
        )
    ), '[]'::jsonb),
    'net', coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', p.id,
        'playerName', p.full_name,
        'flightName', f.name,
        'points', rr.net_points,
        'strokes', rr.net_strokes,
        'holesCounted', rr.holes_counted,
        'holesTotal', v_holes
      ) order by rr.net_points desc, p.full_name)
      from public.round_results rr
      join public.players p on p.id = rr.player_id and p.club_id = rr.club_id
      left join public.flights f on f.id = rr.flight_id and f.club_id = rr.club_id
      where rr.round_id = p_round and rr.superseded_at is null
        and rr.holes_counted > 0 and rr.net_points is not null
        and exists (
          select 1
          from public.round_entries re
          join public.registrations reg
            on reg.id = re.registration_id and reg.club_id = re.club_id
          where re.round_id = rr.round_id and re.club_id = rr.club_id
            and re.status = 'active' and reg.player_id = rr.player_id
        )
    ), '[]'::jsonb),
    'cards', public.build_round_scorecards(p_round, v_holes)
  ) into v_snapshot;

  return v_snapshot;
end;
$$;

revoke all on function public.build_round_snapshot(uuid, text, integer)
  from public, anon, authenticated;

-- The anonymous results path stays summary-only ------------------------------------------------

create or replace function public.public_round_results(p_round uuid)
returns table (
  version integer,
  state text,
  published_at timestamptz,
  snapshot jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select rp.version, rp.state, rp.published_at, rp.snapshot - 'cards'
  from public.round_publications rp
  where rp.round_id = p_round
  order by rp.version desc
  limit 1;
$$;

revoke all on function public.public_round_results(uuid) from public, anon;
grant execute on function public.public_round_results(uuid) to anon, authenticated;

-- The player portal returns the caller's own frozen card ---------------------------------------

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
        where (g -> 'players') @> to_jsonb(m.full_name)
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

-- Self-check ------------------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.build_round_scorecards(uuid, integer)') is null then
    raise exception 'build_round_scorecards was not created';
  end if;
  if to_regprocedure('public.public_round_results(uuid)') is null then
    raise exception 'public_round_results was not replaced';
  end if;
  if to_regprocedure('public.player_portal_entries()') is null then
    raise exception 'player_portal_entries was not replaced';
  end if;
end;
$$;
