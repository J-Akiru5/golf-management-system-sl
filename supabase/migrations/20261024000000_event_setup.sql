-- Event setup, written atomically.
--
-- Tees, holes, categories and flights could not be edited at all before this: the desk adapter only
-- ever wrote the tournaments row, so those edits lived in the browser session and vanished on
-- refresh. This adds one SECURITY DEFINER function that writes the whole setup in a single
-- transaction, so a half-saved setup can never land.
--
-- Two rules it enforces:
--   1. Owner/organizer only. Tournament settings are manager-only (same rule as publishing).
--   2. A revision guard. If the setup changed since the screen loaded, the save is refused rather
--      than silently overwriting the other organizer's work.
--
-- Changing the setup changes routing: a different Slope, or a different flight range, makes every
-- already-drawn group wrong. So the save also bumps draw_revision, which is what the desk reads to
-- know the draw is stale and must be run again. A correct setup pointing at an incorrect draw would
-- be worse than a failed save.

create or replace function public.save_event_setup(
  p_tournament uuid,
  p_expected_revision integer,
  p_course jsonb default null,
  p_holes jsonb default null,
  p_tees jsonb default null,
  p_categories jsonb default null,
  p_flights jsonb default null
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
  v_cat_id uuid;
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

revoke all on function public.save_event_setup(uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb)
  from public;
grant execute on function public.save_event_setup(uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb)
  to authenticated;
