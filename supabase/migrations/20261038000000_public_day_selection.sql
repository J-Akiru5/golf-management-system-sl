-- Public registration: choose the playing days explicitly, and enforce the event's day rule.
--
-- STATUS: written after 20261037000000 was applied. This file is the next migration and is applied
-- separately. It replaces the two public functions; it does not touch club data except the day rule
-- for the current event at the end.
--
-- The old form sent only tee-time preferences. Those keys are still accepted as a fallback, but the
-- form now sends a `days` array of tournament day numbers. The server validates every number against
-- the event's active days, checks the required/maximum rule, writes registration_days explicitly,
-- and returns a readable message instead of letting a deferred constraint fail the transaction.

-- 1. The form's public configuration ------------------------------------------------------------

create or replace function public.public_registration_form(p_tournament uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tournamentId', t.id,
    'name', t.name,
    'dates', coalesce(t.dates, array[t.play_date]),
    'cutOffDate', t.cutoff_date,
    'isOpen', (t.state = 'open' and t.cutoff_date >= current_date),
    'shirtSizes', coalesce(t.registration -> 'shirtSizes', '[]'::jsonb),
    'teeTimes', coalesce(t.registration -> 'teeTimes', '[]'::jsonb),
    'fields', coalesce(t.registration -> 'fields', '[]'::jsonb),
    'sponsorQuestion', coalesce(t.registration ->> 'sponsorQuestion', ''),
    'instructions', t.registration ->> 'instructions',
    'payment', t.registration -> 'payment',
    'requiredDays', t.required_days,
    'maxDays', t.max_days,
    'days', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'dayNumber', d.day_number,
            'playDate', d.play_date,
            'label', d.label,
            'startTime', d.start_time
          )
          order by d.day_number
        )
        from public.tournament_days d
        where d.tournament_id = t.id and d.is_playing_day
      ),
      '[]'::jsonb
    )
  )
  from public.tournaments t
  where t.id = p_tournament;
$$;

revoke all on function public.public_registration_form(uuid) from public;
grant execute on function public.public_registration_form(uuid) to anon, authenticated;

-- 2. A submission -------------------------------------------------------------------------------

create or replace function public.submit_registration(
  p_tournament uuid,
  p_player jsonb,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  v_club uuid;
  v_player uuid;
  v_registration uuid;
  v_name text;
  v_ngap text;
  v_birthdate date;
  v_gender text;
  v_matches int;
  v_index numeric(4, 1);
  v_answers jsonb;
  v_days integer[];
  v_day_count integer;
  v_bad_day integer;
begin
  select id, club_id, state, cutoff_date, required_days, max_days
    into t
    from public.tournaments
   where id = p_tournament;

  if t.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found',
      'message', 'That tournament was not found.');
  end if;

  if t.state <> 'open' then
    return jsonb_build_object('ok', false, 'code', 'closed',
      'message', 'Registration for this event is not open.');
  end if;

  if t.cutoff_date < current_date then
    return jsonb_build_object('ok', false, 'code', 'closed',
      'message', 'The entry deadline for this event has passed.');
  end if;

  v_club := t.club_id;
  v_name := nullif(btrim(coalesce(p_player ->> 'name', '')), '');
  v_ngap := nullif(btrim(coalesce(p_player ->> 'ngapId', '')), '');

  -- A category needs the age and the gender, so both are required rather than defaulted.
  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'A name is required.');
  end if;

  begin
    v_birthdate := (p_player ->> 'birthdate')::date;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'invalid',
      'message', 'Please give a valid date of birth.');
  end;

  if v_birthdate is null then
    return jsonb_build_object('ok', false, 'code', 'invalid',
      'message', 'A date of birth is required.');
  end if;

  v_gender := upper(coalesce(p_player ->> 'gender', ''));
  if v_gender not in ('M', 'F') then
    return jsonb_build_object('ok', false, 'code', 'invalid',
      'message', 'Please choose a category (male or female).');
  end if;

  -- 1. Match on the NGAP id, which is the strongest signal.
  if v_ngap is not null then
    select id into v_player
      from public.players
     where club_id = v_club and ngap_id = v_ngap
     limit 1;
  end if;

  -- 2. Otherwise an exact name, but only when it is unique.
  if v_player is null then
    select count(*) into v_matches
      from public.players
     where club_id = v_club and lower(full_name) = lower(v_name);

    if v_matches > 1 then
      return jsonb_build_object('ok', false, 'code', 'ambiguous',
        'message', 'More than one member matches that name. Please add your NGAP number.');
    end if;

    if v_matches = 1 then
      select id into v_player
        from public.players
       where club_id = v_club and lower(full_name) = lower(v_name)
       limit 1;
    end if;
  end if;

  -- 3. Otherwise a new directory entry, with exactly what was supplied.
  if v_player is null then
    insert into public.players (
      club_id, full_name, birthdate, gender, ngap_id, phone,
      first_name, last_name, home_course, email
    )
    values (
      v_club,
      v_name,
      v_birthdate,
      v_gender,
      v_ngap,
      nullif(btrim(coalesce(p_player ->> 'contactNumber', '')), ''),
      nullif(btrim(coalesce(p_player ->> 'firstName', '')), ''),
      nullif(btrim(coalesce(p_player ->> 'lastName', '')), ''),
      nullif(btrim(coalesce(p_player ->> 'homeCourse', '')), ''),
      nullif(btrim(coalesce(p_player ->> 'email', '')), '')
    )
    returning id into v_player;
  end if;

  if exists (
    select 1 from public.registrations
     where tournament_id = p_tournament and player_id = v_player
  ) then
    return jsonb_build_object('ok', false, 'code', 'duplicate',
      'message', 'That player is already registered for this event.');
  end if;

  -- The index on or before the cut-off, if there is one. Null means no index on file, which the
  -- desk sees as Needs review rather than a made-up number.
  select h.handicap_index into v_index
    from public.handicap_records h
   where h.club_id = v_club
     and h.player_id = v_player
     and h.effective_date <= t.cutoff_date
   order by h.effective_date desc
   limit 1;

  -- The explicit days array wins. The old form's teePreferences keys are the fallback, so a client
  -- that has not been updated yet is still understood. A day number is only a number until it is
  -- checked against this event's active rows.
  if jsonb_typeof(p_answers -> 'days') = 'array' then
    select array_agg(distinct (value)::integer)
      into v_days
      from jsonb_array_elements_text(p_answers -> 'days') value
     where value ~ '^[0-9]{1,2}$' and (value)::integer between 1 and 14;

    if jsonb_array_length(p_answers -> 'days') <> coalesce(cardinality(v_days), 0) then
      return jsonb_build_object('ok', false, 'code', 'invalid',
        'message', 'One or more selected days are not valid. Choose the days again.');
    end if;
  end if;

  if v_days is null or cardinality(v_days) = 0 then
    select array_agg(distinct d.day_number)
      into v_days
      from public.tournament_days d
     where d.tournament_id = p_tournament
       and d.club_id = v_club
       and d.is_playing_day
       and d.play_date::text in (
         select key from jsonb_each_text(coalesce(p_answers -> 'teePreferences', '{}'::jsonb))
          where btrim(value) <> ''
       );
  end if;

  v_day_count := coalesce(cardinality(v_days), 0);

  if t.required_days is not null and v_day_count <> t.required_days then
    return jsonb_build_object('ok', false, 'code', 'invalid',
      'message', format('Choose exactly %s playing day(s).', t.required_days));
  end if;

  if t.max_days is not null and v_day_count > t.max_days then
    return jsonb_build_object('ok', false, 'code', 'invalid',
      'message', format('Choose at most %s playing day(s).', t.max_days));
  end if;

  if v_days is not null then
    select count(*) into v_bad_day
      from unnest(v_days) x
     where not exists (
       select 1 from public.tournament_days d
        where d.tournament_id = p_tournament
          and d.club_id = v_club
          and d.day_number = x
          and d.is_playing_day
     );

    if v_bad_day > 0 then
      return jsonb_build_object('ok', false, 'code', 'invalid',
        'message', 'One of the selected days is not a playing day for this event.');
    end if;
  end if;

  -- Only known keys are kept, so a caller cannot stuff the column with arbitrary JSON.
  v_answers := jsonb_build_object(
    'role', case when p_answers ->> 'role' = 'guest' then 'guest' else 'member' end,
    'sponsor', case when jsonb_typeof(p_answers -> 'sponsor') = 'boolean'
                    then p_answers -> 'sponsor' else 'null'::jsonb end,
    'shirt', case when jsonb_typeof(p_answers -> 'shirt') = 'string'
                  then p_answers -> 'shirt' else 'null'::jsonb end,
    'teePreferences', case when jsonb_typeof(p_answers -> 'teePreferences') = 'object'
                           then p_answers -> 'teePreferences' else '{}'::jsonb end,
    'days', to_jsonb(coalesce(v_days, array[]::integer[])),
    'declaredWshId', case when jsonb_typeof(p_answers -> 'declaredWshId') = 'string'
                          then p_answers -> 'declaredWshId' else 'null'::jsonb end,
    'declaredWshHandicap', case when jsonb_typeof(p_answers -> 'declaredWshHandicap') = 'string'
                                then p_answers -> 'declaredWshHandicap' else 'null'::jsonb end,
    'extra', case when jsonb_typeof(p_answers -> 'extra') = 'object'
                  then p_answers -> 'extra' else '{}'::jsonb end,
    'submittedFrom', 'public_form'
  );

  insert into public.registrations (
    club_id, tournament_id, player_id, status, reasons, frozen_index, answers, source
  )
  values (
    v_club,
    p_tournament,
    v_player,
    'needs_review',
    array['Sent from the public registration form; the desk confirms it.'],
    v_index,
    v_answers,
    'public_form'
  )
  returning id into v_registration;

  -- The trigger may have filled days from the old teePreferences. The explicit set is authoritative:
  -- insert the chosen days and deactivate anything else that the trigger added.
  if v_days is not null and cardinality(v_days) > 0 then
    insert into public.registration_days (club_id, registration_id, tournament_day_id, selected)
    select v_club, v_registration, d.id, true
      from public.tournament_days d
     where d.tournament_id = p_tournament
       and d.club_id = v_club
       and d.is_playing_day
       and d.day_number = any (v_days)
    on conflict (registration_id, tournament_day_id)
    do update set selected = true, updated_at = now();

    update public.registration_days rd
       set selected = false,
           tee_time = null,
           start_hole = null,
           tee_confirmed = false,
           updated_at = now()
     where rd.registration_id = v_registration
       and rd.selected
       and not exists (
         select 1 from public.tournament_days d
          where d.id = rd.tournament_day_id
            and d.day_number = any (v_days)
       );
  end if;

  return jsonb_build_object('ok', true, 'code', 'accepted',
    'message', 'Thank you. The organizer will confirm your entry.');
end;
$$;

revoke all on function public.submit_registration(uuid, jsonb, jsonb) from public;
grant execute on function public.submit_registration(uuid, jsonb, jsonb) to anon, authenticated;

-- 3. The current event's confirmed rule ---------------------------------------------------------
-- The 24th Bamboo Tee is a four-day event with a two-day entry. This is the event-specific rule the
-- organizer confirmed; it is not a global default. The public picker and the desk both read it from
-- tournaments.required_days/max_days.

update public.tournaments
   set required_days = 2, max_days = 2
 where id = '1f0d98d4-e5c8-4929-bca9-2920c1a74cbb';

-- 4. Self-check ---------------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'public_registration_form'
  ) then
    raise exception 'public_registration_form was not replaced';
  end if;

  if exists (select 1 from public.tournaments
              where id = '1f0d98d4-e5c8-4929-bca9-2920c1a74cbb') then
    if (select required_days from public.tournaments
         where id = '1f0d98d4-e5c8-4929-bca9-2920c1a74cbb') is distinct from 2 then
      raise exception 'The current event did not receive the two-day rule';
    end if;
  end if;

  if exists (
    select 1 from pg_proc p
     where p.proname = 'public_registration_form'
       and p.proacl is not null
       and not exists (select 1 from unnest(p.proacl) a where a::text like 'anon=%')
  ) then
    raise exception 'public_registration_form is not executable by anon';
  end if;
end $$;
