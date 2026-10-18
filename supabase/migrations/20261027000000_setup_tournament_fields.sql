-- Tournament-level settings from the Settings screen, written by the same guarded function.
--
-- Before this, `save_event_setup` wrote the course, holes, tees, categories and flights, and every
-- tournament-level field (name, days, state, cut-off, index rules, start rules, registration
-- wording) only changed the screen: the desk adapter never called `saveTournamentRow`, so those
-- edits reverted on reload (gap 14, decision 17).
--
-- They are added here rather than through a second write path, so all of it keeps the three rules
-- the setup write already has:
--   1. Owner/organizer only (the same rule as publishing).
--   2. One transaction: a half-saved setup can never land.
--   3. The revision guard: a stale screen is refused instead of overwriting the other organizer.
--
-- Every parameter is optional and null means "leave it alone", so the screen can save one section
-- (Basics, Cut-off & handicap, Start & groups, Registration fields) or everything at once.
--
-- Postgres treats added parameters as a new overload, so the old six-argument signature is dropped
-- before the new one is created. The grants are re-applied at the bottom for the new signature.

drop function if exists public.save_event_setup(uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb);

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
           play_date = coalesce(v_dates[1], play_date)
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

revoke all on function public.save_event_setup(
  uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public;

grant execute on function public.save_event_setup(
  uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;
