-- Desk registration in one transaction.
--
-- Why this exists
-- ---------------
-- The desk used to take an entry in two requests: an insert into `registrations`, then a call to
-- `set_registration_days`. PostgREST runs each request in its own transaction, so the two halves
-- could not be rolled back together.
--
-- That matters because `registrations_day_rule` is a deferred constraint trigger: the day rule is
-- checked at commit time, not at insert time. An insert whose day rows had not arrived yet was
-- refused on its own, after the screen had already shown "Recorded on the club database". The
-- adapter reported the failure afterwards, and the entry stayed on screen as if it had been saved.
--
-- One function, one transaction: the registration and its chosen days are written together, and
-- the rule is checked before the function returns. Either both rows exist or neither does.
--
-- The validation mirrors what the table already enforces:
--   * the same role check as the other desk functions (owner, organizer or desk)
--   * the event exists and the player belongs to the same club
--   * one entry per event and player, with a plain message instead of a constraint error
--   * only real playing days of this event, and the event's required/max day rule
--   * `registration_days_validate` still runs for each day row; the deferred rule is checked here
--     as well so the caller gets a readable message rather than a commit-time failure.
--
-- Security definer, like the rest of the desk functions, because the club tables are behind
-- `is_club_member`. New functions are private by default (20261031000000), so the grant below is
-- explicit and only to authenticated desk staff.

create or replace function public.create_registration(
  p_id uuid,
  p_tournament uuid,
  p_player uuid,
  p_answers jsonb,
  p_days integer[],
  p_frozen_index numeric,
  p_frozen_record_id uuid,
  p_frozen_effective_date date,
  p_frozen_at timestamptz,
  p_payment_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_required smallint;
  v_max smallint;
  v_existing uuid;
  v_days integer[];
  v_bad integer;
  v_payment text;
  v_registration uuid;
begin
  select club_id, required_days, max_days
    into v_club, v_required, v_max
    from public.tournaments
   where id = p_tournament;

  if v_club is null then
    return jsonb_build_object('ok', false, 'message', 'That event was not found.');
  end if;

  -- The desk takes entries; the same three roles the other desk functions accept.
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'You do not have access to take a registration for this event.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.players
     where id = p_player and club_id = v_club
  ) then
    return jsonb_build_object('ok', false, 'message', 'That player is not in this club.');
  end if;

  select id into v_existing
    from public.registrations
   where tournament_id = p_tournament and player_id = p_player;

  if v_existing is not null then
    return jsonb_build_object('ok', false, 'code', 'duplicate',
      'message', 'That player is already entered in this event.');
  end if;

  -- Whole day numbers, 1 to 14, the same range `set_registration_days` accepts. An empty list is
  -- allowed when the event has no day rule: the deferred trigger below is the authority on that,
  -- exactly as it was when the adapter sent no day call at all.
  if p_days is null then
    v_days := array[]::integer[];
  else
    select array_agg(distinct x), count(*) filter (where x is null or x < 1 or x > 14)
      into v_days, v_bad
      from unnest(p_days) x;

    if v_bad > 0 then
      return jsonb_build_object('ok', false, 'code', 'invalid',
        'message', 'One or more selected days are not valid.');
    end if;

    v_days := coalesce(v_days, array[]::integer[]);
  end if;

  select count(*) into v_bad
    from unnest(v_days) x
   where not exists (
     select 1 from public.tournament_days d
      where d.tournament_id = p_tournament
        and d.club_id = v_club
        and d.day_number = x
        and d.is_playing_day
   );

  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid',
      'message', 'One of the selected days is not a playing day for this event.');
  end if;

  -- The event's own rule, read from tournaments, not a number in this function.
  if v_required is not null and cardinality(v_days) <> v_required then
    return jsonb_build_object('ok', false, 'code', 'invalid',
      'message', format('This event requires exactly %s playing day(s).', v_required));
  end if;

  if v_max is not null and cardinality(v_days) > v_max then
    return jsonb_build_object('ok', false, 'code', 'invalid',
      'message', format('This event allows at most %s playing day(s).', v_max));
  end if;

  v_payment := coalesce(p_payment_status, 'unpaid');

  if v_payment not in ('unpaid', 'paid', 'waived') then
    return jsonb_build_object('ok', false, 'message', 'The payment status is not valid.');
  end if;

  if p_answers is not null and jsonb_typeof(p_answers) <> 'object' then
    return jsonb_build_object('ok', false, 'message', 'The registration answers are not valid.');
  end if;

  insert into public.registrations (
    id, club_id, tournament_id, player_id, frozen_index, frozen_record_id,
    frozen_effective_date, frozen_at, payment_status, answers, source
  )
  values (
    coalesce(p_id, gen_random_uuid()), v_club, p_tournament, p_player,
    p_frozen_index, p_frozen_record_id, p_frozen_effective_date, p_frozen_at,
    v_payment, coalesce(p_answers, '{}'::jsonb), 'desk'
  )
  returning id into v_registration;

  -- `attach_registration_days_from_preferences` may already have filled rows from the entry's
  -- teePreferences, which can leave a day the desk did not tick. The explicit set is authoritative,
  -- but only when the desk actually sent one.
  if cardinality(v_days) > 0 then
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

  -- The deferred trigger would say the same thing at commit; doing it here gives the desk the
  -- message on the call it made, not as an error after the request looked finished.
  perform public.check_registration_day_rule(v_registration);

  return jsonb_build_object('ok', true, 'id', v_registration);
end;
$$;

comment on function public.create_registration(
  uuid, uuid, uuid, jsonb, integer[], numeric, uuid, date, timestamptz, text
) is
  'Writes one desk registration and its playing days in a single transaction. Returns {ok, id} or {ok:false, message}. Owner, organizer or desk only.';

revoke all on function public.create_registration(
  uuid, uuid, uuid, jsonb, integer[], numeric, uuid, date, timestamptz, text
) from public;

grant execute on function public.create_registration(
  uuid, uuid, uuid, jsonb, integer[], numeric, uuid, date, timestamptz, text
) to authenticated;

-- Self-check: the function exists and only authenticated staff can execute it.
do $$
declare
  acl text[];
  open_to_anon boolean;
  open_to_authenticated boolean;
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'create_registration'
  ) then
    raise exception 'create_registration was not created';
  end if;

  select p.proacl into acl
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_registration';

  select exists (
    select 1 from unnest(coalesce(acl, array[]::text[])) e
     where split_part(e, '=', 1) in ('anon', '')
  ) into open_to_anon;

  select exists (
    select 1 from unnest(coalesce(acl, array[]::text[])) e
     where split_part(e, '=', 1) = 'authenticated'
  ) into open_to_authenticated;

  if open_to_anon then
    raise exception 'create_registration is executable by anon (acl: %)', acl;
  end if;

  if not open_to_authenticated then
    raise exception 'create_registration is not executable by authenticated (acl: %)', acl;
  end if;
end $$;
