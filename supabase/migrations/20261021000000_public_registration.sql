-- Public registration form.
--
-- A player entering an event is NOT a login. Public visitors use the anon key, and every club table
-- is behind `is_club_member`, so the form goes through two SECURITY DEFINER functions instead:
--
--   public_registration_form(tournament)  -> the form's public configuration, no player data
--   submit_registration(tournament, ...)  -> creates or matches a player, then records an entry
--
-- Nothing here grants read access to club tables. A submission always lands as `needs_review`, so
-- the desk confirms it before it counts. Payments stay manual and photos are not collected.

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
    'payment', t.registration -> 'payment'
  )
  from public.tournaments t
  where t.id = p_tournament;
$$;

revoke all on function public.public_registration_form(uuid) from public;
grant execute on function public.public_registration_form(uuid) to anon, authenticated;

-- 2. A submission -------------------------------------------------------------------------------
-- Matches by NGAP id first, then by an unambiguous exact name. An ambiguous name is refused with a
-- message rather than guessed. Duplicates are impossible: registrations is unique on
-- (tournament_id, player_id).

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
  v_name text;
  v_ngap text;
  v_birthdate date;
  v_gender text;
  v_matches int;
  v_index numeric(4, 1);
  v_answers jsonb;
begin
  select id, club_id, state, cutoff_date
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

  -- Only known keys are kept, so a caller cannot stuff the column with arbitrary JSON.
  v_answers := jsonb_build_object(
    'role', case when p_answers ->> 'role' = 'guest' then 'guest' else 'member' end,
    'sponsor', case when jsonb_typeof(p_answers -> 'sponsor') = 'boolean'
                    then p_answers -> 'sponsor' else 'null'::jsonb end,
    'shirt', case when jsonb_typeof(p_answers -> 'shirt') = 'string'
                  then p_answers -> 'shirt' else 'null'::jsonb end,
    'teePreferences', case when jsonb_typeof(p_answers -> 'teePreferences') = 'object'
                           then p_answers -> 'teePreferences' else '{}'::jsonb end,
    'declaredWshId', case when jsonb_typeof(p_answers -> 'declaredWshId') = 'string'
                          then p_answers -> 'declaredWshId' else 'null'::jsonb end,
    'declaredWshHandicap', case when jsonb_typeof(p_answers -> 'declaredWshHandicap') = 'string'
                                then p_answers -> 'declaredWshHandicap' else 'null'::jsonb end,
    'extra', case when jsonb_typeof(p_answers -> 'extra') = 'object'
                  then p_answers -> 'extra' else '{}'::jsonb end,
    'submittedFrom', 'public_form'
  );

  insert into public.registrations (
    club_id, tournament_id, player_id, status, reasons, frozen_index, answers
  )
  values (
    v_club,
    p_tournament,
    v_player,
    'needs_review',
    array['Sent from the public registration form; the desk confirms it.'],
    v_index,
    v_answers
  );

  return jsonb_build_object('ok', true, 'code', 'accepted',
    'message', 'Thank you. The organizer will confirm your entry.');
end;
$$;

revoke all on function public.submit_registration(uuid, jsonb, jsonb) from public;
grant execute on function public.submit_registration(uuid, jsonb, jsonb) to anon, authenticated;
