-- The public programme: the day's tee times, the public player cards and the organizers' rules of play.
--
-- Status: applied to the live project on 26 Oct 2026. The code is merged into `develop`.
-- Additive only; no row is deleted or rewritten.
--
-- Why this migration exists
-- -------------------------
-- The pairings page already shows the published groups, but players also need the day schedule, a
-- short player list and the organizers' rules. Those need two things the schema did not have:
--
--   1. A place for the organizers to write the rules of play per event. The text is free form and
--      belongs to the event, not to the registration wording.
--   2. One anonymous, allow-listed read for the programme. It is deliberately separate from
--      public_pairings(): the pairings stay in the frozen published snapshot, while the day times,
--      player cards and rules are reference data that only answer while the event is published.
--
-- The player card carries name, home course, frozen index, category and flight. It never carries a
-- contact detail, birthdate, gender, note or photo. The day card carries only a confirmed tee time
-- and start hole; an unconfirmed row keeps the player but withholds the time.

-- 1. The organizers' rules ----------------------------------------------------------------------

alter table public.tournaments
  add column if not exists rules_of_play text;

-- 2. Write them through the existing guarded setup function --------------------------------------
-- Same signature as 20261027000000, so the grants carry over. The rules travel inside p_basics,
-- which is already the event-level block, and an empty value clears the stored text. A caller that
-- does not send the key leaves the stored rules alone.

create or replace function public.save_event_setup(
  p_tournament uuid,
  p_expected_revision integer,
  p_course jsonb default null,
  p_holes jsonb default null,
  p_tees jsonb default null,
  p_categories jsonb default null,
  p_flights jsonb default null,
  p_basics jsonb default null,
  p_rules jsonb default null,
  p_start jsonb default null,
  p_registration jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_course uuid;
  v_revision integer;
  v_item jsonb;
  v_tee uuid;
  v_category uuid;
  v_dates date[];
begin
  select t.club_id, t.course_id, t.draw_revision
    into v_club, v_course, v_revision
    from public.tournaments t
   where t.id = p_tournament;

  if v_club is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;

  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only the owner or an organizer can change the event setup'
      using errcode = '42501';
  end if;

  if p_expected_revision is not null and p_expected_revision <> v_revision then
    raise exception 'The setup changed since this screen loaded. Reload and try again.'
      using errcode = '40001';
  end if;

  -- Basics: name, days of play, registered state, name confirmation -------------------------------
  if p_basics is not null then
    if jsonb_typeof(p_basics -> 'dates') = 'array' then
      select array_agg(d::date order by ord)
        into v_dates
        from jsonb_array_elements_text(p_basics -> 'dates') with ordinality as x(d, ord);
    end if;

    if v_dates is not null and array_length(v_dates, 1) = 0 then
      raise exception 'An event needs at least one day of play' using errcode = '23514';
    end if;

    update public.tournaments
       set name = coalesce(nullif(btrim(p_basics ->> 'name'), ''), name),
           state = coalesce(nullif(btrim(p_basics ->> 'state'), ''), state),
           name_needs_confirmation =
             coalesce((p_basics ->> 'nameNeedsConfirmation')::boolean, name_needs_confirmation),
           dates = coalesce(v_dates, dates),
           play_date = coalesce(v_dates[1], play_date),
           rules_of_play = case
             when jsonb_typeof(p_basics) = 'object' and p_basics ? 'rulesOfPlay'
               then nullif(btrim(p_basics ->> 'rulesOfPlay'), '')
             else rules_of_play
           end
     where id = p_tournament and club_id = v_club;
  end if;

  -- Cut-off and handicap rules ---------------------------------------------------------------------
  if p_rules is not null then
    update public.tournaments
       set cutoff_date = coalesce(nullif(p_rules ->> 'cutoffDate', '')::date, cutoff_date),
           max_index = coalesce((p_rules ->> 'maxIndex')::numeric, max_index),
           allowance = coalesce((p_rules ->> 'allowance')::numeric, allowance),
           stale_index_days =
             coalesce((p_rules ->> 'staleIndexDays')::smallint, stale_index_days),
           flight_basis = coalesce(nullif(p_rules ->> 'flightBasis', ''), flight_basis),
           schedule_needs_confirmation =
             coalesce((p_rules ->> 'scheduleNeedsConfirmation')::boolean, schedule_needs_confirmation)
     where id = p_tournament and club_id = v_club;
  end if;

  -- Start and groups ------------------------------------------------------------------------------
  if p_start is not null then
    update public.tournaments
       set start_format = coalesce(nullif(p_start ->> 'startFormat', ''), start_format),
           first_tee_time = coalesce(nullif(p_start ->> 'firstTeeTime', '')::time, first_tee_time),
           interval_minutes =
             coalesce((p_start ->> 'intervalMinutes')::smallint, interval_minutes),
           wave_gap_minutes =
             coalesce((p_start ->> 'waveGapMinutes')::smallint, wave_gap_minutes),
           group_size = coalesce((p_start ->> 'groupSize')::smallint, group_size),
           min_group_size = coalesce((p_start ->> 'minGroupSize')::smallint, min_group_size)
     where id = p_tournament and club_id = v_club;
  end if;

  -- Registration wording and questions, replaced as one document ----------------------------------
  if p_registration is not null then
    if jsonb_typeof(p_registration) <> 'object' then
      raise exception 'The registration settings must be an object' using errcode = '22023';
    end if;

    update public.tournaments
       set registration = p_registration
     where id = p_tournament and club_id = v_club;
  end if;

  -- Course ---------------------------------------------------------------------------------------
  if p_course is not null then
    update public.courses
       set name = coalesce(nullif(btrim(p_course ->> 'name'), ''), name),
           holes = coalesce((p_course ->> 'holes')::smallint, holes)
     where id = v_course and club_id = v_club;
  end if;

  -- Holes: a fixed set per course, so they are replaced wholesale ---------------------------------
  if p_holes is not null then
    delete from public.holes where club_id = v_club and course_id = v_course;

    insert into public.holes (club_id, course_id, number, par, stroke_index)
    select v_club,
           v_course,
           (h ->> 'number')::smallint,
           (h ->> 'par')::smallint,
           (h ->> 'strokeIndex')::smallint
      from jsonb_array_elements(p_holes) as h;
  end if;

  -- Tees: course-level, unique by name, so upsert by name ------------------------------------------
  if p_tees is not null then
    for v_item in select * from jsonb_array_elements(p_tees) loop
      insert into public.tees (club_id, course_id, name, course_rating, slope, par)
      values (
        v_club,
        v_course,
        btrim(v_item ->> 'name'),
        (v_item ->> 'courseRating')::numeric,
        (v_item ->> 'slope')::smallint,
        (v_item ->> 'par')::smallint
      )
      on conflict (course_id, name) do update
        set course_rating = excluded.course_rating,
            slope = excluded.slope,
            par = excluded.par;
    end loop;

    -- Drop tees removed from the payload, but never one a category still points at.
    delete from public.tees t
     where t.club_id = v_club
       and t.course_id = v_course
       and not exists (
         select 1 from jsonb_array_elements(p_tees) as p
          where btrim(p ->> 'name') = t.name
       )
       and not exists (
         select 1 from public.categories c where c.tee_id = t.id
       );
  end if;

  -- Categories: update the ones with an id, insert the rest ----------------------------------------
  if p_categories is not null then
    for v_item in select * from jsonb_array_elements(p_categories) loop
      select id into v_tee
        from public.tees
       where club_id = v_club and course_id = v_course and name = btrim(v_item ->> 'teeName');

      if v_tee is null then
        raise exception 'Category "%" names a tee that does not exist: %',
          btrim(v_item ->> 'name'), btrim(v_item ->> 'teeName') using errcode = '23503';
      end if;

      if coalesce(v_item ->> 'id', '') <> '' then
        update public.categories
           set name = btrim(v_item ->> 'name'),
               gender = coalesce(nullif(v_item ->> 'gender', ''), 'any'),
               min_age = coalesce((v_item ->> 'minAge')::smallint, 0),
               max_age = nullif(v_item ->> 'maxAge', '')::smallint,
               tee_id = v_tee
         where id = (v_item ->> 'id')::uuid
           and tournament_id = p_tournament
           and club_id = v_club;
      else
        insert into public.categories
          (club_id, tournament_id, tee_id, name, gender, min_age, max_age)
        values (
          v_club,
          p_tournament,
          v_tee,
          btrim(v_item ->> 'name'),
          coalesce(nullif(v_item ->> 'gender', ''), 'any'),
          coalesce((v_item ->> 'minAge')::smallint, 0),
          nullif(v_item ->> 'maxAge', '')::smallint
        );
      end if;
    end loop;

    -- Drop categories removed from the payload, unless a registration still points at one.
    delete from public.categories c
     where c.club_id = v_club
       and c.tournament_id = p_tournament
       and not exists (
         select 1 from jsonb_array_elements(p_categories) as p
          where coalesce(p ->> 'id', '') <> '' and (p ->> 'id')::uuid = c.id
       )
       and not exists (
         select 1 from public.registrations r where r.category_id = c.id
       );
  end if;

  -- Flights: keyed by category name plus flight name ------------------------------------------------
  if p_flights is not null then
    for v_item in select * from jsonb_array_elements(p_flights) loop
      select id into v_category
        from public.categories
       where club_id = v_club
         and tournament_id = p_tournament
         and name = btrim(v_item ->> 'categoryName');

      if v_category is null then
        raise exception 'Flight "%" names a category that does not exist: %',
          btrim(v_item ->> 'name'), btrim(v_item ->> 'categoryName') using errcode = '23503';
      end if;

      if coalesce(v_item ->> 'id', '') <> '' then
        update public.flights
           set name = btrim(v_item ->> 'name'),
               min_value = (v_item ->> 'min')::numeric,
               max_value = (v_item ->> 'max')::numeric,
               category_id = v_category
         where id = (v_item ->> 'id')::uuid
           and club_id = v_club;
      else
        insert into public.flights (club_id, category_id, name, min_value, max_value)
        values (
          v_club,
          v_category,
          btrim(v_item ->> 'name'),
          (v_item ->> 'min')::numeric,
          (v_item ->> 'max')::numeric
        );
      end if;
    end loop;

    -- Drop flights removed from the payload, unless a group still points at one.
    delete from public.flights f
     where f.club_id = v_club
       and f.category_id in (
         select id from public.categories
          where club_id = v_club and tournament_id = p_tournament
       )
       and not exists (
         select 1 from jsonb_array_elements(p_flights) as p
          where coalesce(p ->> 'id', '') <> '' and (p ->> 'id')::uuid = f.id
       )
       and not exists (
         select 1 from public.groups g where g.flight_id = f.id
       );
  end if;

  -- The setup changed, so any drawn groups were routed against different numbers. Mark it stale.
  update public.tournaments
     set draw_revision = draw_revision + 1
   where id = p_tournament and club_id = v_club
  returning draw_revision into v_revision;

  return jsonb_build_object('ok', true, 'revision', v_revision);
end;
$$;

-- 3. The anonymous programme read ----------------------------------------------------------------
-- One JSON document, built only from allow-listed columns. It returns null until the event is
-- published, so taking the pairings down also takes the extra sections down. A confirmed time is
-- the only time that leaves the database.

create or replace function public.public_programme(p_tournament uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected as (
    select
      t.id,
      t.club_id,
      t.published,
      t.rules_of_play,
      case
        when t.published and t.published_snapshot is not null then t.published_snapshot ->> 'eventName'
        else t.name
      end as name,
      case
        when t.published and t.published_snapshot is not null then (t.published_snapshot ->> 'date')::date
        else t.play_date
      end as play_date
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
    when s.published then jsonb_build_object(
      'tournamentId', s.id,
      'name', s.name,
      'date', s.play_date,
      'rulesOfPlay', s.rules_of_play,
      'days', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'dayNumber', d.day_number,
              'label', d.label,
              'playDate', d.play_date,
              'startTime', case
                when d.start_time is null then null
                else to_char(d.start_time, 'HH24:MI')
              end,
              'players', coalesce(
                (
                  select jsonb_agg(
                    jsonb_build_object(
                      'name', p.full_name,
                      'teeTime', case
                        when rd.tee_confirmed then to_char(rd.tee_time, 'HH24:MI')
                        else null
                      end,
                      'startHole', case
                        when rd.tee_confirmed then rd.start_hole
                        else null
                      end,
                      'confirmed', coalesce(rd.tee_confirmed, false)
                    )
                    order by case when rd.tee_confirmed then rd.tee_time end nulls last,
                             p.full_name
                  )
                  from public.registration_days rd
                  join public.registrations r
                    on r.id = rd.registration_id and r.club_id = rd.club_id
                  join public.players p
                    on p.id = r.player_id and p.club_id = r.club_id
                  where rd.tournament_day_id = d.id
                    and rd.selected
                    and r.status <> 'ineligible'
                ),
                '[]'::jsonb
              )
            )
            order by d.day_number
          )
          from public.tournament_days d
          where d.tournament_id = s.id
            and d.club_id = s.club_id
            and d.is_playing_day
        ),
        '[]'::jsonb
      ),
      'players', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'name', p.full_name,
              'homeCourse', nullif(btrim(p.home_course), ''),
              'index', r.frozen_index,
              'category', c.name,
              'flight', f.name
            )
            order by p.full_name
          )
          from public.registrations r
          join public.players p
            on p.id = r.player_id and p.club_id = r.club_id
          left join public.categories c
            on c.id = r.category_id and c.club_id = r.club_id
          left join public.flights f
            on f.id = r.flight_id and f.club_id = r.club_id
          where r.tournament_id = s.id
            and r.club_id = s.club_id
            and r.status <> 'ineligible'
        ),
        '[]'::jsonb
      )
    )
    else null
  end
  from selected s;
$$;

revoke all on function public.public_programme(uuid) from public;
grant execute on function public.public_programme(uuid) to anon, authenticated;

-- 4. Self-check ----------------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'tournaments'
       and column_name = 'rules_of_play'
  ) then
    raise exception 'tournaments.rules_of_play was not added';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'public_programme'
  ) then
    raise exception 'public_programme was not created';
  end if;

  if exists (
    select 1 from pg_proc p
     where p.proname = 'public_programme'
       and p.proacl is not null
       and not exists (select 1 from unnest(p.proacl) a where a::text like 'anon=%')
  ) then
    raise exception 'public_programme is not executable by anon';
  end if;

  if not exists (
    select 1 from pg_proc p
     where p.proname = 'save_event_setup'
       and p.prosrc like '%rules_of_play%'
  ) then
    raise exception 'save_event_setup does not write rules_of_play';
  end if;
end $$;
