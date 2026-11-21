-- Tournament presets: a saved standard an event starts from.
-- ADDITIVE: one new table, its trigger and five functions. Nothing existing is altered or dropped.
--
-- The owner's rule (21 Nov 2026): the standard must be easy to calibrate for different tournaments.
-- A preset holds every rule an event runs on: tees with their colour and card numbers, categories
-- and their age bands, classes, allowance, the highest index allowed, the playing-handicap cap,
-- group sizes, start format, the playing days' session starts and the gaps between starts.
--
-- Two rules make a preset a copy and never a live link:
--   * `save_tournament_preset` stores the rules as one JSON document, validated by
--     `preset_settings_problem` before a row is written. The app builds the same shape
--     (`src/lib/data/presets.ts`), so a payload the desk accepts is one this function accepts.
--   * `apply_tournament_preset` copies the preset into the event: its tees, handicap rules and
--     start settings through `save_event_setup`, the same guarded path the Settings screen uses,
--     then its categories and classes. An event that already has entries or a draw is refused
--     before anything is written, because replacing the set under filed entries either fails or
--     leaves two sets behind. The event can be edited freely afterwards, and the preset does not
--     change with it.
--
-- `seed_preset_from_tournament` reads an existing event and saves it as a preset. It is how the
-- first preset comes from the 24th Bamboo Tee: no number is typed in by hand and no number is
-- guessed. A tee whose name does not say one of the four colours stops it with a message naming the
-- tee, because storing a colour nobody chose would be inventing data.
--
-- Only `main`/`develop` deploy, and this file is not applied by the build: the owner runs
-- `docs/presets/apply-on-live.sql` in the Supabase SQL editor. Until then the desk says the preset
-- controls are available after the next database update and nothing else on the screen changes.

-- 1. The table -----------------------------------------------------------------------------------

create table public.tournament_presets (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 400),
  -- The rules, in the shape `src/lib/data/presets.ts` defines.
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, club_id)
);

comment on table public.tournament_presets is
  'A saved set of tournament rules. An event copies a preset through apply_tournament_preset; the preset is never linked live.';
comment on column public.tournament_presets.settings is
  'Tees, categories, classes, handicap rules, groups, start format, day session starts and gaps. Shape: src/lib/data/presets.ts.';

-- One preset name per club, so the list the desk shows is unambiguous. Case-insensitive because
-- two rows called "Bamboo" and "bamboo" would read as the same standard.
create unique index tournament_presets_club_name
  on public.tournament_presets (club_id, lower(name));

create index tournament_presets_club
  on public.tournament_presets (club_id, name);

create or replace function public.touch_tournament_preset()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_tournament_preset() from public, anon;

drop trigger if exists tournament_presets_touch on public.tournament_presets;
create trigger tournament_presets_touch
  before update on public.tournament_presets
  for each row execute function public.touch_tournament_preset();

-- 2. Row level security --------------------------------------------------------------------------
-- Club members read the list; only the owner or an organizer writes it. Saving and applying also go
-- through the functions below, which check the same role, so a direct write cannot skip a rule check.

alter table public.tournament_presets enable row level security;

drop policy if exists tournament_presets_read on public.tournament_presets;
create policy tournament_presets_read on public.tournament_presets
  for select to authenticated using (public.is_club_member(club_id));

drop policy if exists tournament_presets_manager_write on public.tournament_presets;
create policy tournament_presets_manager_write on public.tournament_presets
  for all to authenticated
  using (public.has_club_role(club_id, array['owner', 'organizer']))
  with check (public.has_club_role(club_id, array['owner', 'organizer']));

revoke all on table public.tournament_presets from public, anon;
grant select, insert, update, delete on table public.tournament_presets to authenticated;

-- 3. The settings check --------------------------------------------------------------------------
-- Pure: it reads only its argument, so the desk, the save and the apply all judge a payload the
-- same way. It returns the first problem in plain words, or null when the payload is usable.

create or replace function public.preset_settings_problem(p_settings jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_tees jsonb;
  v_categories jsonb;
  v_flights jsonb;
  v_days jsonb;
  v_item jsonb;
  v_a jsonb;
  v_b jsonb;
  v_name text;
  v_names text[] := '{}';
  v_markers text[] := '{}';
  v_category_names text[] := '{}';
  v_flight_names text[] := '{}';
  v_marker text;
  v_min numeric;
  v_max numeric;
  v_value numeric;
  v_group integer;
  v_min_group integer;
  v_max_index integer;
  v_cap integer;
  v_index integer;
  v_count integer;
  v_day_numbers integer[] := '{}';
  v_i integer;
  v_j integer;
  v_clock constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
begin
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    return 'The preset settings must be an object.';
  end if;

  -- Tees ----------------------------------------------------------------------------------------
  if coalesce(jsonb_typeof(p_settings -> 'tees'), '') <> 'array' then
    return 'The preset has no list of tees.';
  end if;
  v_tees := p_settings -> 'tees';
  if jsonb_array_length(v_tees) = 0 then
    return 'A preset needs at least one tee.';
  end if;

  for v_item in select * from jsonb_array_elements(v_tees) loop
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    if v_name = '' then
      return 'A tee has no name.';
    end if;
    if char_length(v_name) > 60 then
      return format('The tee name "%s" is longer than 60 characters.', v_name);
    end if;
    if lower(v_name) = any (v_names) then
      return format('The tee name "%s" is used twice.', v_name);
    end if;
    v_names := v_names || lower(v_name);

    if coalesce(v_item ->> 'colour', '') not in ('blue', 'silver', 'white', 'red') then
      return format('Tee "%s" needs a colour: Blue, Silver, White or Red.', v_name);
    end if;
    if coalesce(v_item ->> 'gender', '') not in ('M', 'F', 'any') then
      return format('Tee "%s" needs who plays it: Men, Women or Everyone.', v_name);
    end if;

    v_marker := (v_item ->> 'colour') || '/' || (v_item ->> 'gender');
    if v_marker = any (v_markers) then
      return format('Two tees are listed in %s for %s. Keep one row per colour and gender.',
                    v_item ->> 'colour', v_item ->> 'gender');
    end if;
    v_markers := v_markers || v_marker;

    if coalesce(v_item ->> 'rating', '') !~ '^[0-9]+(\.[0-9]+)?$' then
      return format('Tee "%s" needs a Course Rating from 50 to 90.', v_name);
    end if;
    v_value := (v_item ->> 'rating')::numeric;
    if v_value < 50 or v_value > 90 then
      return format('Tee "%s" needs a Course Rating from 50 to 90.', v_name);
    end if;

    if coalesce(v_item ->> 'slope', '') !~ '^[0-9]+$' then
      return format('Tee "%s" needs a whole-number Slope from 55 to 155.', v_name);
    end if;
    v_index := (v_item ->> 'slope')::integer;
    if v_index < 55 or v_index > 155 then
      return format('Tee "%s" needs a whole-number Slope from 55 to 155.', v_name);
    end if;

    if coalesce(v_item ->> 'par', '') !~ '^[0-9]+$' then
      return format('Tee "%s" needs a whole-number Par from 27 to 80.', v_name);
    end if;
    v_index := (v_item ->> 'par')::integer;
    if v_index < 27 or v_index > 80 then
      return format('Tee "%s" needs a whole-number Par from 27 to 80.', v_name);
    end if;
  end loop;

  -- Categories ----------------------------------------------------------------------------------
  if coalesce(jsonb_typeof(p_settings -> 'categories'), '') <> 'array' then
    return 'The preset has no list of categories.';
  end if;
  v_categories := p_settings -> 'categories';
  if jsonb_array_length(v_categories) = 0 then
    return 'A preset needs at least one category.';
  end if;

  for v_item in select * from jsonb_array_elements(v_categories) loop
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    if v_name = '' then
      return 'A category has no name.';
    end if;
    if char_length(v_name) > 60 then
      return format('The category name "%s" is longer than 60 characters.', v_name);
    end if;
    if lower(v_name) = any (v_category_names) then
      return format('The category name "%s" is used twice.', v_name);
    end if;
    v_category_names := v_category_names || lower(v_name);
    if coalesce(v_item ->> 'gender', '') not in ('M', 'F', 'any') then
      return format('Category "%s" needs who it is for: Men, Women or Everyone.', v_name);
    end if;
    if coalesce(v_item ->> 'minAge', '') !~ '^[0-9]+$' then
      return format('Category "%s" needs a whole-number starting age from 0 to 120.', v_name);
    end if;
    v_index := (v_item ->> 'minAge')::integer;
    if v_index < 0 or v_index > 120 then
      return format('Category "%s" needs a whole-number starting age from 0 to 120.', v_name);
    end if;
    if not (lower(btrim(coalesce(v_item ->> 'teeName', ''))) = any (v_names)) then
      return format('Category "%s" names the tee "%s", which is not in the preset.',
                    v_name, coalesce(nullif(btrim(v_item ->> 'teeName'), ''), '(none)'));
    end if;
    if v_item ? 'maxAge' and jsonb_typeof(v_item -> 'maxAge') <> 'null' then
      if coalesce(v_item ->> 'maxAge', '') !~ '^[0-9]+$' then
        return format('Category "%s" needs a whole-number age limit from 0 to 120, or none.', v_name);
      end if;
      v_value := (v_item ->> 'maxAge')::numeric;
      if v_value < 0 or v_value > 120 then
        return format('Category "%s" needs a whole-number age limit from 0 to 120, or none.', v_name);
      end if;
      if v_value < (v_item ->> 'minAge')::numeric then
        return format('Category "%s" ends before it starts.', v_name);
      end if;
    end if;
  end loop;

  -- Two categories that can hold the same player at the same age leave the player for review, so a
  -- standard that contains one is refused rather than copied into an event.
  v_count := jsonb_array_length(v_categories);
  for v_i in 1 .. v_count - 1 loop
    v_a := v_categories -> (v_i - 1);
    for v_j in v_i + 1 .. v_count loop
      v_b := v_categories -> (v_j - 1);
      if (v_a ->> 'gender') <> (v_b ->> 'gender')
         and (v_a ->> 'gender') <> 'any'
         and (v_b ->> 'gender') <> 'any' then
        continue;
      end if;
      if (v_a ->> 'minAge')::integer <= coalesce((nullif(v_b ->> 'maxAge', ''))::integer, 120)
         and (v_b ->> 'minAge')::integer <= coalesce((nullif(v_a ->> 'maxAge', ''))::integer, 120)
      then
        return format('Categories "%s" and "%s" cover the same players.',
                      v_a ->> 'name', v_b ->> 'name');
      end if;
    end loop;
  end loop;

  -- Classes -------------------------------------------------------------------------------------
  if p_settings ? 'flights' and coalesce(jsonb_typeof(p_settings -> 'flights'), '') <> 'array' then
    return 'The preset class list must be a list.';
  end if;
  v_flights := coalesce(p_settings -> 'flights', '[]'::jsonb);
  for v_item in select * from jsonb_array_elements(v_flights) loop
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    if v_name = '' then
      return 'A class has no name.';
    end if;
    if lower(v_name) = any (v_flight_names) then
      return format('The class name "%s" is used twice.', v_name);
    end if;
    v_flight_names := v_flight_names || lower(v_name);
    if coalesce(v_item ->> 'min', '') !~ '^[0-9]+(\.[0-9]+)?$'
       or coalesce(v_item ->> 'max', '') !~ '^[0-9]+(\.[0-9]+)?$' then
      return format('Class "%s" needs a starting and an ending value from 0 to 54.', v_name);
    end if;
    v_min := (v_item ->> 'min')::numeric;
    v_max := (v_item ->> 'max')::numeric;
    if v_min < 0 or v_min > 54 or v_max < 0 or v_max > 54 then
      return format('Class "%s" needs a starting and an ending value from 0 to 54.', v_name);
    end if;
    if v_max < v_min then
      return format('Class "%s" ends before it starts.', v_name);
    end if;
  end loop;

  v_count := jsonb_array_length(v_flights);
  for v_i in 1 .. v_count - 1 loop
    v_a := v_flights -> (v_i - 1);
    for v_j in v_i + 1 .. v_count loop
      v_b := v_flights -> (v_j - 1);
      if (v_a ->> 'min')::numeric <= (v_b ->> 'max')::numeric
         and (v_b ->> 'min')::numeric <= (v_a ->> 'max')::numeric then
        return format('Classes "%s" and "%s" overlap.', v_a ->> 'name', v_b ->> 'name');
      end if;
    end loop;
  end loop;

  -- Handicap and groups -------------------------------------------------------------------------
  if coalesce(p_settings ->> 'allowance', '') !~ '^[0-9]+(\.[0-9]+)?$' then
    return 'The handicap allowance needs a value from 10% to 100%.';
  end if;
  v_value := (p_settings ->> 'allowance')::numeric;
  if v_value < 0.1 or v_value > 1 then
    return 'The handicap allowance needs a value from 10% to 100%.';
  end if;

  if coalesce(p_settings ->> 'maxIndex', '') !~ '^[0-9]+(\.[0-9]+)?$' then
    return 'The highest index allowed needs a value from 0 to 54.';
  end if;
  v_value := (p_settings ->> 'maxIndex')::numeric;
  if v_value < 0 or v_value > 54 then
    return 'The highest index allowed needs a value from 0 to 54.';
  end if;
  v_max_index := floor(v_value)::integer;

  if coalesce(p_settings ->> 'playingHandicapCap', '') !~ '^[0-9]+$' then
    return 'The playing-handicap cap needs a whole number of strokes from 0 to 54.';
  end if;
  v_cap := (p_settings ->> 'playingHandicapCap')::integer;
  if v_cap < 0 or v_cap > 54 then
    return 'The playing-handicap cap needs a whole number of strokes from 0 to 54.';
  end if;
  if v_cap > v_max_index then
    return 'The playing-handicap cap cannot be above the highest index allowed.';
  end if;

  if coalesce(p_settings ->> 'groupSize', '') !~ '^[0-9]+$' then
    return 'The group size needs a whole number from 2 to 5.';
  end if;
  v_group := (p_settings ->> 'groupSize')::integer;
  if v_group < 2 or v_group > 5 then
    return 'The group size needs a whole number from 2 to 5.';
  end if;

  if coalesce(p_settings ->> 'minGroupSize', '') !~ '^[0-9]+$' then
    return 'The smallest group needs a whole number from 1 to 5.';
  end if;
  v_min_group := (p_settings ->> 'minGroupSize')::integer;
  if v_min_group < 1 or v_min_group > 5 then
    return 'The smallest group needs a whole number from 1 to 5.';
  end if;
  if v_min_group > v_group then
    return 'The smallest group cannot be larger than the group size.';
  end if;

  -- Start ---------------------------------------------------------------------------------------
  if coalesce(p_settings ->> 'startFormat', '') not in ('shotgun', 'two_tee') then
    return 'Choose a start format: shotgun or two-tee.';
  end if;
  if coalesce(p_settings ->> 'firstTeeTime', '') !~ v_clock then
    return 'The first tee time needs a time such as 06:30.';
  end if;
  if p_settings ? 'afternoonStart'
     and jsonb_typeof(p_settings -> 'afternoonStart') = 'string'
     and (p_settings ->> 'afternoonStart') !~ v_clock then
    return 'The afternoon start needs a time such as 12:30, or none.';
  end if;
  if p_settings ? 'afternoonStart'
     and jsonb_typeof(p_settings -> 'afternoonStart') not in ('null', 'string') then
    return 'The afternoon start needs a time such as 12:30, or none.';
  end if;

  if coalesce(p_settings ->> 'batchGapMinutes', '') !~ '^[0-9]+$' then
    return 'The batch gap needs a whole number of minutes from 1 to 240.';
  end if;
  v_index := (p_settings ->> 'batchGapMinutes')::integer;
  if v_index < 1 or v_index > 240 then
    return 'The batch gap needs a whole number of minutes from 1 to 240.';
  end if;

  if coalesce(p_settings ->> 'waveGapMinutes', '') !~ '^[0-9]+$' then
    return 'The gap between start times needs a whole number of minutes from 1 to 600.';
  end if;
  v_index := (p_settings ->> 'waveGapMinutes')::integer;
  if v_index < 1 or v_index > 600 then
    return 'The gap between start times needs a whole number of minutes from 1 to 600.';
  end if;

  -- Days ----------------------------------------------------------------------------------------
  if coalesce(jsonb_typeof(p_settings -> 'days'), '') <> 'array' then
    return 'The preset has no list of playing days.';
  end if;
  v_days := p_settings -> 'days';
  if jsonb_array_length(v_days) = 0 then
    return 'A preset needs at least one playing day.';
  end if;

  for v_item in select * from jsonb_array_elements(v_days) loop
    if coalesce(v_item ->> 'dayNumber', '') !~ '^[0-9]+$' then
      return 'A playing day needs a whole-number day number from 1.';
    end if;
    v_index := (v_item ->> 'dayNumber')::integer;
    if v_index < 1 then
      return 'A playing day needs a whole-number day number from 1.';
    end if;
    if v_index = any (v_day_numbers) then
      return format('Day %s is listed twice.', v_index);
    end if;
    v_day_numbers := v_day_numbers || v_index;

    if v_item ? 'morning'
       and jsonb_typeof(v_item -> 'morning') not in ('null', 'string') then
      return format('Day %s needs a first start time such as 06:30, or none.', v_index);
    end if;
    if v_item ? 'morning'
       and jsonb_typeof(v_item -> 'morning') = 'string'
       and (v_item ->> 'morning') !~ v_clock then
      return format('Day %s needs a first start time such as 06:30, or none.', v_index);
    end if;
    if v_item ? 'afternoon'
       and jsonb_typeof(v_item -> 'afternoon') not in ('null', 'string') then
      return format('Day %s needs an afternoon start time such as 12:30, or none.', v_index);
    end if;
    if v_item ? 'afternoon'
       and jsonb_typeof(v_item -> 'afternoon') = 'string'
       and (v_item ->> 'afternoon') !~ v_clock then
      return format('Day %s needs an afternoon start time such as 12:30, or none.', v_index);
    end if;
  end loop;

  return null;
end;
$$;

comment on function public.preset_settings_problem(jsonb) is
  'The first problem in a preset settings document, in plain words, or null when it is usable. Pure.';

-- 4. Save a preset -------------------------------------------------------------------------------

create or replace function public.save_tournament_preset(
  p_club uuid,
  p_name text,
  p_description text,
  p_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_problem text;
  v_row public.tournament_presets;
begin
  if p_club is null then
    raise exception 'A club is required' using errcode = '22023';
  end if;

  if not public.has_club_role(p_club, array['owner', 'organizer']) then
    raise exception 'Only the owner or an organizer can save a preset' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'A preset needs a name' using errcode = '22023';
  end if;
  if char_length(v_name) > 80 then
    raise exception 'A preset name is at most 80 characters' using errcode = '22023';
  end if;
  if v_description is not null and char_length(v_description) > 400 then
    raise exception 'A preset description is at most 400 characters' using errcode = '22023';
  end if;

  -- The same check the desk runs before it sends anything, so a malformed preset cannot be stored
  -- silently and fail later when an event tries to copy it.
  v_problem := public.preset_settings_problem(p_settings);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = '22023';
  end if;

  insert into public.tournament_presets (club_id, name, description, settings)
  values (p_club, v_name, v_description, p_settings)
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'clubId', v_row.club_id,
    'name', v_row.name,
    'description', v_row.description,
    'settings', v_row.settings,
    'createdAt', v_row.created_at,
    'updatedAt', v_row.updated_at
  );
exception
  when unique_violation then
    raise exception 'A preset called "%" already exists. Rename this one, or delete the old one first.',
      v_name using errcode = '23505';
end;
$$;

comment on function public.save_tournament_preset(uuid, text, text, jsonb) is
  'Saves a validated set of tournament rules as a preset. Owner or organizer only.';

-- 5. Seed a preset from an event -----------------------------------------------------------------
-- Reads the event and stores what it finds. Nothing is typed in by hand: the tee numbers come from
-- the course tee rows, the categories from the event's categories, and the day starts from
-- tournament_days. A tee whose name does not say one of the four colours stops the call, because
-- the preset shape records the colour the player complains about.

create or replace function public.seed_preset_from_tournament(
  p_tournament uuid,
  p_name text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_course uuid;
  v_event text;
  v_tees jsonb;
  v_categories jsonb;
  v_flights jsonb;
  v_days jsonb;
  v_settings jsonb;
  v_unnamed text;
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  select t.club_id, t.course_id, t.name
    into v_club, v_course, v_event
    from public.tournaments t
   where t.id = p_tournament;

  if v_club is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;

  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only the owner or an organizer can save a preset' using errcode = '42501';
  end if;

  select string_agg(t.name, ', ' order by t.name)
    into v_unnamed
    from public.tees t
   where t.club_id = v_club
     and t.course_id = v_course
     and t.name !~* '(blue|silver|white|red)';

  if v_unnamed is not null then
    raise exception
      'These tees do not name one of the four colours (Blue, Silver, White, Red), so a preset cannot be saved from this event: %. Rename them in Course & tees, or save a preset by hand.',
      v_unnamed
      using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', t.name,
        'colour', lower(
          case
            when t.name ~* 'blue' then 'Blue'
            when t.name ~* 'silver' then 'Silver'
            when t.name ~* 'white' then 'White'
            else 'Red'
          end
        ),
        -- Who the marker is rated for. The name says it when it can; otherwise the categories that
        -- play this tee in this event decide, and a tee used by both genders or by nobody is
        -- recorded as everyone.
        'gender',
          case
            when t.name ~* 'ladies|women' then 'F'
            when exists (
              select 1 from public.categories c
               where c.tournament_id = p_tournament and c.tee_id = t.id and c.gender = 'F'
            ) and not exists (
              select 1 from public.categories c
               where c.tournament_id = p_tournament and c.tee_id = t.id and c.gender = 'M'
            ) then 'F'
            when exists (
              select 1 from public.categories c
               where c.tournament_id = p_tournament and c.tee_id = t.id and c.gender = 'M'
            ) and not exists (
              select 1 from public.categories c
               where c.tournament_id = p_tournament and c.tee_id = t.id and c.gender = 'F'
            ) then 'M'
            else 'any'
          end,
        'rating', t.course_rating,
        'slope', t.slope,
        'par', t.par
      )
      order by t.name
    ),
    '[]'::jsonb
  )
  into v_tees
  from public.tees t
  where t.club_id = v_club and t.course_id = v_course;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', c.name,
        'gender', c.gender,
        'minAge', c.min_age,
        'maxAge', c.max_age,
        'teeName', t.name
      )
      order by c.sort_order, c.name
    ),
    '[]'::jsonb
  )
  into v_categories
  from public.categories c
  join public.tees t on t.id = c.tee_id and t.club_id = c.club_id
  where c.tournament_id = p_tournament and c.club_id = v_club;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', f.name,
        'min', f.min_value,
        'max', f.max_value
      )
      order by f.min_value, f.name
    ),
    '[]'::jsonb
  )
  into v_flights
  from public.flights f
  where f.club_id = v_club
    and f.category_id in (
      select c.id from public.categories c
       where c.tournament_id = p_tournament and c.club_id = v_club
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'dayNumber', d.day_number,
        'label', d.label,
        'morning', case when d.start_time is null then null
                        else to_char(d.start_time, 'HH24:MI') end,
        'afternoon', case when d.pm_start_time is null then null
                          else to_char(d.pm_start_time, 'HH24:MI') end
      )
      order by d.day_number
    ),
    '[]'::jsonb
  )
  into v_days
  from public.tournament_days d
  where d.tournament_id = p_tournament and d.club_id = v_club and d.is_playing_day;

  -- An event that has no day rows yet still has dates, which is enough for the day list.
  if jsonb_array_length(v_days) = 0 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'dayNumber', x.ord,
          'label', 'Day ' || x.ord,
          'morning', case when x.ord = 1 then to_char(t.first_tee_time, 'HH24:MI') else null end,
          'afternoon', null
        )
        order by x.ord
      ),
      '[]'::jsonb
    )
    into v_days
    from public.tournaments t
    cross join lateral unnest(coalesce(t.dates, array[t.play_date]))
      with ordinality as x(play_date, ord)
    where t.id = p_tournament;
  end if;

  select jsonb_build_object(
    'tees', v_tees,
    'categories', v_categories,
    'flights', v_flights,
    'allowance', t.allowance,
    'maxIndex', t.max_index,
    -- The draw caps the playing handicap at the highest index allowed, so that is what the event
    -- runs on today. A lower cap is a rule change in issue #342, not something a seed can invent.
    'playingHandicapCap', floor(t.max_index)::integer,
    'groupSize', t.group_size,
    'minGroupSize', t.min_group_size,
    'startFormat', t.start_format,
    'firstTeeTime', to_char(t.first_tee_time, 'HH24:MI'),
    'afternoonStart', to_char(t.pm_first_tee_time, 'HH24:MI'),
    'batchGapMinutes', t.interval_minutes,
    'waveGapMinutes', t.wave_gap_minutes,
    'days', v_days
  )
  into v_settings
  from public.tournaments t
  where t.id = p_tournament and t.club_id = v_club;

  -- The same save the screen uses, so the name, the description and the settings are checked once.
  return public.save_tournament_preset(
    v_club,
    p_name,
    coalesce(v_description, format('Saved from %s on %s', v_event, to_char(current_date, 'YYYY-MM-DD'))),
    v_settings
  );
end;
$$;

comment on function public.seed_preset_from_tournament(uuid, text, text) is
  'Saves an existing event''s own rules as a preset. Reads the event; nothing is typed in by hand.';

-- 6. Apply a preset to an event ------------------------------------------------------------------
-- A preset is applied to an event before entries are filed. The event's tees, handicap rules and
-- start settings go through `save_event_setup`, the same guarded transaction the Settings screen
-- uses: owner or organizer only, revision-guarded, and a tee still in use refuses the save. Its
-- categories and classes are then replaced with the preset's under the same role check. An event
-- that already has entries or a draw is refused before anything is written, because replacing the
-- set under filed entries either fails on a foreign key or leaves two sets side by side. The preset
-- is only read: applying it never changes it.
--
-- Why the categories and classes are written here rather than through `save_event_setup`: that
-- function deletes every category or class whose id the payload does not carry, and a new row has
-- no id yet, so it deletes the row it has just inserted. Passing it a preset's fresh set would end
-- with no categories and no classes at all.

create or replace function public.apply_tournament_preset(
  p_tournament uuid,
  p_preset uuid
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
  v_settings jsonb;
  v_problem text;
  v_entries integer;
  v_tees jsonb;
  v_result jsonb;
  v_carrier uuid;
  v_category jsonb;
  v_flight jsonb;
  v_tee uuid;
  v_category_id uuid;
  v_categories integer := 0;
  v_flights integer := 0;
  v_days integer := 0;
  v_ignored jsonb := '[]'::jsonb;
  v_day jsonb;
  v_day_number integer;
  v_morning time;
  v_afternoon time;
  v_notes jsonb := '[]'::jsonb;
  v_cap integer;
  v_max_index numeric;
begin
  -- The event row is locked, so the revision this call carries is the one it writes against.
  select t.club_id, t.course_id, t.draw_revision
    into v_club, v_course, v_revision
    from public.tournaments t
   where t.id = p_tournament
     for update;

  if v_club is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;

  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only the owner or an organizer can apply a preset' using errcode = '42501';
  end if;

  select p.settings into v_settings
    from public.tournament_presets p
   where p.id = p_preset and p.club_id = v_club;

  if v_settings is null then
    raise exception 'That preset is not part of this club' using errcode = 'P0002';
  end if;

  -- A preset saved under an older rule is judged again before it reaches an event.
  v_problem := public.preset_settings_problem(v_settings);
  if v_problem is not null then
    raise exception 'This preset cannot be applied: %', v_problem using errcode = '22023';
  end if;

  -- An event that already has entries or a draw keeps them: replacing its categories and classes
  -- under filed entries either fails on a foreign key or leaves two sets side by side. Refuse before
  -- anything is written, and say what to do instead.
  select count(*) into v_entries
    from public.registrations r
   where r.tournament_id = p_tournament and r.club_id = v_club;

  if v_entries > 0
     or exists (
       select 1 from public.groups g
        where g.tournament_id = p_tournament and g.club_id = v_club
     ) then
    raise exception
      'This event already has entries or a draw on file, so its categories and classes cannot be replaced. A preset is applied to an event before entries are filed. Change the rules on this screen by hand for this event, or start the next event from the preset.'
      using errcode = '23514';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', e ->> 'name',
        'courseRating', (e ->> 'rating')::numeric,
        'slope', (e ->> 'slope')::smallint,
        'par', (e ->> 'par')::smallint
      )
      order by e ->> 'name'
    ),
    '[]'::jsonb
  )
  into v_tees
  from jsonb_array_elements(v_settings -> 'tees') as e;

  -- Tees, the handicap rules and the start settings: the guarded function the Settings screen uses.
  v_result := public.save_event_setup(
    p_tournament,
    v_revision,
    null,
    null,
    v_tees,
    null,
    null,
    null,
    jsonb_build_object(
      'maxIndex', v_settings -> 'maxIndex',
      'allowance', v_settings -> 'allowance'
    ),
    jsonb_build_object(
      'startFormat', v_settings ->> 'startFormat',
      'firstTeeTime', v_settings ->> 'firstTeeTime',
      'intervalMinutes', v_settings -> 'batchGapMinutes',
      'waveGapMinutes', v_settings -> 'waveGapMinutes',
      'groupSize', v_settings -> 'groupSize',
      'minGroupSize', v_settings -> 'minGroupSize'
    ),
    null
  );
  v_revision := coalesce((v_result ->> 'revision')::integer, v_revision);

  -- Categories and classes are replaced whole. Nothing filed points at them: that was checked above.
  delete from public.flights f
   where f.club_id = v_club
     and f.category_id in (
       select c.id from public.categories c
        where c.tournament_id = p_tournament and c.club_id = v_club
     );

  delete from public.categories c
   where c.tournament_id = p_tournament and c.club_id = v_club;

  -- The tees were written above, so each category's tee is found by the name the preset carries.
  for v_category in select * from jsonb_array_elements(v_settings -> 'categories') loop
    select t.id into v_tee
      from public.tees t
     where t.club_id = v_club
       and t.course_id = v_course
       and t.name = v_category ->> 'teeName';

    if v_tee is null then
      raise exception 'The preset names the tee "%", which is not on this event''s course.',
        v_category ->> 'teeName' using errcode = '23503';
    end if;

    insert into public.categories
      (club_id, tournament_id, tee_id, name, gender, min_age, max_age)
    values (
      v_club,
      p_tournament,
      v_tee,
      v_category ->> 'name',
      coalesce(nullif(v_category ->> 'gender', ''), 'any'),
      coalesce((v_category ->> 'minAge')::smallint, 0),
      nullif(v_category ->> 'maxAge', '')::smallint
    )
    returning id into v_category_id;

    v_categories := v_categories + 1;
    -- A class row hangs off one carrier category; the class itself is cut over the whole field.
    if v_carrier is null then
      v_carrier := v_category_id;
    end if;
  end loop;

  if v_carrier is not null then
    for v_flight in
      select * from jsonb_array_elements(coalesce(v_settings -> 'flights', '[]'::jsonb))
    loop
      insert into public.flights (club_id, category_id, name, min_value, max_value)
      values (
        v_club,
        v_carrier,
        v_flight ->> 'name',
        (v_flight ->> 'min')::numeric,
        (v_flight ->> 'max')::numeric
      );

      v_flights := v_flights + 1;
    end loop;
  end if;

  -- A tee the preset does not name is left on the course: tees belong to the course, not to one
  -- event, so an event's preset does not remove a marker another event or the club may still use.

  -- `save_event_setup` does not write two things the preset holds: the event's afternoon start and
  -- each playing day's own session starts. They are written here, under the same role check.
  if jsonb_typeof(v_settings -> 'afternoonStart') = 'string' then
    update public.tournaments
       set pm_first_tee_time = (v_settings ->> 'afternoonStart')::time
     where id = p_tournament and club_id = v_club;
  end if;

  for v_day in select * from jsonb_array_elements(coalesce(v_settings -> 'days', '[]'::jsonb)) loop
    v_day_number := (v_day ->> 'dayNumber')::integer;
    v_morning := case when jsonb_typeof(v_day -> 'morning') = 'string'
                      then (v_day ->> 'morning')::time else null end;
    v_afternoon := case when jsonb_typeof(v_day -> 'afternoon') = 'string'
                        then (v_day ->> 'afternoon')::time else null end;

    update public.tournament_days
       set start_time = v_morning,
           pm_start_time = v_afternoon,
           updated_at = now()
     where tournament_id = p_tournament
       and club_id = v_club
       and day_number = v_day_number;

    if found then
      v_days := v_days + 1;
    else
      -- The event has fewer playing days than the preset. The day is reported, never added: dates
      -- belong to the event, not to a standard.
      v_ignored := v_ignored || jsonb_build_array(v_day_number);
    end if;
  end loop;

  -- The event caps the playing handicap at its highest index allowed today. Say so when a preset
  -- asks for a different cap, rather than letting the screen report a rule that is not in force.
  v_cap := (v_settings ->> 'playingHandicapCap')::integer;
  v_max_index := floor((v_settings ->> 'maxIndex')::numeric);
  if v_cap <> v_max_index::integer then
    v_notes := v_notes || jsonb_build_array(
      format(
        'The preset caps the playing handicap at %s. This event caps at its highest index allowed (%s) until the handicap rule reads a cap of its own.',
        v_cap,
        v_max_index::integer
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'revision', v_revision,
    'applied', jsonb_build_object(
      'tees', jsonb_array_length(v_tees),
      'categories', v_categories,
      'flights', v_flights,
      'days', v_days
    ),
    'ignoredDays', v_ignored,
    'notes', v_notes
  );
end;
$$;

comment on function public.apply_tournament_preset(uuid, uuid) is
  'Copies a preset into an event through save_event_setup. Owner or organizer only; the preset is not changed.';

-- 7. Grants --------------------------------------------------------------------------------------
-- New functions are executable by public by default, so the grants are stated rather than assumed.
-- Anon reaches none of this: presets are a desk feature.

revoke all on function public.preset_settings_problem(jsonb) from public, anon;
revoke all on function public.save_tournament_preset(uuid, text, text, jsonb) from public, anon;
revoke all on function public.seed_preset_from_tournament(uuid, text, text) from public, anon;
revoke all on function public.apply_tournament_preset(uuid, uuid) from public, anon;

grant execute on function public.preset_settings_problem(jsonb) to authenticated;
grant execute on function public.save_tournament_preset(uuid, text, text, jsonb) to authenticated;
grant execute on function public.seed_preset_from_tournament(uuid, text, text) to authenticated;
grant execute on function public.apply_tournament_preset(uuid, uuid) to authenticated;

-- 8. Self-check ----------------------------------------------------------------------------------
-- Catalog checks plus the pure validator, which needs no signed-in caller. No event row and no
-- preset row is written by this block; the payloads it judges are in the block itself.

do $$
declare
  v_good jsonb := jsonb_build_object(
    'tees', jsonb_build_array(
      jsonb_build_object(
        'name', 'Blue', 'colour', 'blue', 'gender', 'M',
        'rating', 69.6, 'slope', 130, 'par', 70
      ),
      jsonb_build_object(
        'name', 'Red', 'colour', 'red', 'gender', 'F',
        'rating', 72.1, 'slope', 126, 'par', 70
      )
    ),
    'categories', jsonb_build_array(
      jsonb_build_object(
        'name', 'Men', 'gender', 'M', 'minAge', 0, 'maxAge', null, 'teeName', 'Blue'
      ),
      jsonb_build_object(
        'name', 'Women', 'gender', 'F', 'minAge', 0, 'maxAge', null, 'teeName', 'Red'
      )
    ),
    'flights', jsonb_build_array(
      jsonb_build_object('name', 'A', 'min', 0, 'max', 12),
      jsonb_build_object('name', 'B', 'min', 12.1, 'max', 30)
    ),
    'allowance', 1,
    'maxIndex', 30,
    'playingHandicapCap', 30,
    'groupSize', 4,
    'minGroupSize', 3,
    'startFormat', 'shotgun',
    'firstTeeTime', '06:30',
    'afternoonStart', '12:30',
    'batchGapMinutes', 15,
    'waveGapMinutes', 300,
    'days', jsonb_build_array(
      jsonb_build_object(
        'dayNumber', 1, 'label', 'Day 1', 'morning', '06:30', 'afternoon', '12:30'
      ),
      jsonb_build_object(
        'dayNumber', 2, 'label', 'Day 2', 'morning', null, 'afternoon', null
      )
    )
  );
  v_functions integer;
  v_policies integer;
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'tournament_presets'
  ) then
    raise exception 'public.tournament_presets is missing';
  end if;

  if not exists (
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'tournament_presets' and c.relrowsecurity
  ) then
    raise exception 'row level security is not on for tournament_presets';
  end if;

  select count(*) into v_policies
  from pg_policies
  where schemaname = 'public' and tablename = 'tournament_presets';
  if v_policies <> 2 then
    raise exception 'expected 2 policies on tournament_presets, found %', v_policies;
  end if;

  select count(*) into v_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'preset_settings_problem',
      'save_tournament_preset',
      'seed_preset_from_tournament',
      'apply_tournament_preset',
      'touch_tournament_preset'
    );
  if v_functions <> 5 then
    raise exception 'expected 5 preset functions, found %', v_functions;
  end if;

  if has_function_privilege(
    'anon', 'public.save_tournament_preset(uuid, text, text, jsonb)', 'execute'
  ) or has_function_privilege(
    'anon', 'public.apply_tournament_preset(uuid, uuid)', 'execute'
  ) or has_function_privilege(
    'anon', 'public.seed_preset_from_tournament(uuid, text, text)', 'execute'
  ) then
    raise exception 'anon can execute a preset function';
  end if;

  if not has_function_privilege(
    'authenticated', 'public.apply_tournament_preset(uuid, uuid)', 'execute'
  ) then
    raise exception 'authenticated cannot execute apply_tournament_preset';
  end if;

  if public.preset_settings_problem(v_good) is not null then
    raise exception 'the validator refused a usable preset: %',
      public.preset_settings_problem(v_good);
  end if;

  if public.preset_settings_problem(v_good || jsonb_build_object('allowance', 0))
     not like '%10%to%100%' then
    raise exception 'the validator accepted an allowance of 0';
  end if;

  if public.preset_settings_problem(
       v_good || jsonb_build_object('playingHandicapCap', 36)
     ) not like '%cannot be above the highest index allowed%' then
    raise exception 'the validator accepted a cap above the highest index';
  end if;

  if public.preset_settings_problem(
       v_good || jsonb_build_object(
         'tees', jsonb_build_array(
           jsonb_build_object(
             'name', 'Gold', 'colour', 'gold', 'gender', 'M',
             'rating', 69.6, 'slope', 130, 'par', 70
           )
         )
       )
     ) not like '%needs a colour%' then
    raise exception 'the validator accepted a tee with no known colour';
  end if;

  if public.preset_settings_problem(
       v_good || jsonb_build_object(
         'categories', jsonb_build_array(
           jsonb_build_object(
             'name', 'Men', 'gender', 'M', 'minAge', 0, 'maxAge', 59, 'teeName', 'Blue'
           ),
           jsonb_build_object(
             'name', 'Senior', 'gender', 'M', 'minAge', 55, 'maxAge', null, 'teeName', 'Blue'
           )
         )
       )
     ) not like '%cover the same players%' then
    raise exception 'the validator accepted two categories that cover the same players';
  end if;

  if public.preset_settings_problem(
       v_good || jsonb_build_object(
         'categories', jsonb_build_array(
           jsonb_build_object(
             'name', 'Regular', 'gender', 'M', 'minAge', 0, 'maxAge', null, 'teeName', 'Blue'
           ),
           jsonb_build_object(
             'name', 'Regular', 'gender', 'F', 'minAge', 0, 'maxAge', null, 'teeName', 'Red'
           )
         )
       )
     ) not like '%used twice%' then
    raise exception 'the validator accepted two categories with one name';
  end if;
end $$;

-- 9. Owner steps, after the migration is applied --------------------------------------------------
--
-- Make the first preset in the desk, not in the SQL editor. Open Setup, open "Tournament presets",
-- and press "Save these settings as a preset" under the 24th Bamboo Tee's own rules. The desk stores
-- what the event already runs on, so no number is typed in by hand.
--
-- The SQL editor cannot do that step: seed_preset_from_tournament asks for a signed-in owner or
-- organizer, the editor has no signed-in user, and the call is refused with 42501. The desk makes
-- the same preset through save_tournament_preset.
--
-- The read-only check for the list the desk shows:
--
--   select id, name, description, created_at from public.tournament_presets order by name;
