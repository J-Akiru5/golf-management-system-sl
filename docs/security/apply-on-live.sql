-- TeeLine entry limits, as ONE paste-ready script for the Supabase SQL editor. Generated from
-- supabase/migrations/20261123000300_entry_limits.sql (verbatim below). Do not edit by hand.
--
-- BEFORE you run it:
--   1. Be on the live project (the one the golf app and apps/ops both use).
--   2. It is additive: one nullable column and one index on public.registrations, plus a replacement
--      of public.submit_registration. Every existing check and message is kept, and the grants are
--      unchanged. It takes a very short lock.
--   3. Run it once. It is wrapped in one transaction, so a failure changes nothing.
--
-- AFTER it runs: the read-only queries below should report the column, the index, the function and
-- the anon grants.

begin;

-- ============================================================
-- 20261123000300_entry_limits.sql
-- ============================================================
-- Public entry limits: a per-connection bucket, a honeypot and a cap on new player rows.
--
-- ADDITIVE for storage: one nullable column and one index on public.registrations. The function
-- public.submit_registration is replaced from its latest definition (20261038000000) with the same
-- checks and the same messages; only the limits below are new. No policy, grant or row is changed.
--
--   * A submission with a filled honeypot answers exactly like a real entry and writes nothing.
--   * One connection may send twenty entries in ten minutes. The count is kept on the rows it
--     already created, so no extra row and no raw address is stored. The key is the same
--     pseudonymous digest pattern the feedback form uses: a hash over the club and the proxy
--     address. Twenty is chosen for a shared clubhouse connection, where several players enter
--     together.
--   * An event accepts at most 25 new player rows in an hour. A returning member matches an existing
--     player row and is not affected; the cap only bounds rows created by the form itself.

-- 1. The bucket key ------------------------------------------------------------------------------

alter table public.registrations
  add column if not exists rate_key text;

comment on column public.registrations.rate_key is
  'A pseudonymous hash of the connection that sent the entry. Null for desk and import entries. Used only to count recent submissions.';

alter table public.registrations
  drop constraint if exists registrations_rate_key_length;
alter table public.registrations
  add constraint registrations_rate_key_length
  check (rate_key is null or char_length(rate_key) between 1 and 64);

create index if not exists registrations_rate_bucket_idx
  on public.registrations (tournament_id, rate_key, created_at desc);

-- 2. The submission ------------------------------------------------------------------------------
-- Same signature, same grants. Every check and message from 20261038000000 is kept.

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
  v_headers jsonb := '{}'::jsonb;
  v_address text;
  v_rate_key text;
  v_recent integer;
  v_new_players integer;
begin
  -- A filled honeypot is treated exactly like a real submission from the browser's point of view:
  -- the same acceptance, and no row. It is checked before anything is read or written.
  if nullif(btrim(coalesce(p_player ->> 'honeypot', '')), '') is not null then
    return jsonb_build_object('ok', true, 'code', 'accepted',
      'message', 'Thank you. The organizer will confirm your entry.');
  end if;

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

  -- The bucket. The key is pseudonymous: the proxy header is the best signal, the connection
  -- address is the fallback, and `no-address` is the smallest safe last resort sharing one bucket.
  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_address := nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '');
  if v_address is null then
    v_address := nullif(btrim(coalesce(v_headers ->> 'x-real-ip', '')), '');
  end if;
  if v_address is null then
    v_address := nullif(host(inet_client_addr()), '');
  end if;

  v_rate_key := hashtextextended(
    'entry|' || v_club::text || '|' || coalesce(v_address, 'no-address'),
    0
  )::text;

  -- Serialize the check-and-insert for one bucket, so two simultaneous requests cannot both see
  -- nineteen rows and both slip in as the twentieth and twenty-first.
  perform pg_advisory_xact_lock(hashtextextended('entry-rate|' || v_rate_key, 0));

  select count(*) into v_recent
    from public.registrations r
   where r.tournament_id = p_tournament
     and r.club_id = v_club
     and r.rate_key = v_rate_key
     and r.created_at > now() - interval '10 minutes';

  if v_recent >= 20 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited',
      'message', 'Too many entries were sent just now. Wait a few minutes and try again.');
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

  -- 3. Otherwise a new directory entry, with exactly what was supplied. The event accepts a bounded
  -- number of new player rows in an hour, so a script cannot fill the directory through one form.
  if v_player is null then
    select count(*) into v_new_players
      from public.players p
      join public.registrations r
        on r.player_id = p.id and r.club_id = p.club_id
     where r.tournament_id = p_tournament
       and p.created_at > now() - interval '1 hour';

    if v_new_players >= 25 then
      return jsonb_build_object('ok', false, 'code', 'rate_limited',
        'message', 'New entries for this event are paused for a while. Please try again later or contact the organizer.');
    end if;

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
    club_id, tournament_id, player_id, status, reasons, frozen_index, answers, source, rate_key
  )
  values (
    v_club,
    p_tournament,
    v_player,
    'needs_review',
    array['Sent from the public registration form; the desk confirms it.'],
    v_index,
    v_answers,
    'public_form',
    v_rate_key
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

-- 3. Self-check -----------------------------------------------------------------------------------

do $$
declare
  v_result jsonb;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'registrations'
       and column_name = 'rate_key'
  ) then
    raise exception 'registrations.rate_key was not added';
  end if;

  if to_regclass('public.registrations_rate_bucket_idx') is null then
    raise exception 'the entry rate bucket index was not created';
  end if;

  if to_regprocedure('public.submit_registration(uuid,jsonb,jsonb)') is null then
    raise exception 'submit_registration was not replaced';
  end if;

  if position(
    'rate_key' in pg_get_functiondef('public.submit_registration(uuid,jsonb,jsonb)'::regprocedure)
  ) = 0 then
    raise exception 'submit_registration does not record the bucket';
  end if;

  -- The honeypot answers with the ordinary acceptance and writes nothing, so this probe is safe on
  -- any project, including one with no events.
  v_result := public.submit_registration(
    gen_random_uuid(), '{"honeypot": "filled"}'::jsonb, '{}'::jsonb
  );
  if v_result ->> 'code' <> 'accepted' then
    raise exception 'submit_registration did not answer the honeypot with the ordinary acceptance';
  end if;

  -- Supabase grants table privileges to anon by default; row level security is what protects
  -- the table. So the check is that RLS is on and that no policy lets a visitor write a row.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'registrations' and c.relrowsecurity
  ) then
    raise exception 'row level security is off on public.registrations';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'registrations'
       and cmd in ('INSERT', 'ALL')
       and (roles && array['anon', 'public']::name[])
  ) then
    raise exception 'a policy lets visitors write to public.registrations';
  end if;
end $$;

commit;

-- Check 1: the bucket column and its index.
select table_name, column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'registrations'
  and column_name = 'rate_key';

select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'registrations'
  and indexname = 'registrations_rate_bucket_idx';

-- Check 2: the function is the replaced one, and both roles may still call it.
select p.proname, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_may_call,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_may_call
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'submit_registration';

-- Check 3: anon still holds no table privilege on registrations (this returns no rows).
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
  and table_name = 'registrations';
