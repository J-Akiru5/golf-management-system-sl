-- A shotgun wave belongs to a day's plan, next to the tee time and the start hole.
--
-- `registration_days.wave` is one capital letter, A onwards, and null when the desk has not put the
-- player in a wave. A wave is a plan, so it is allowed without a time or a hole; confirming still
-- needs both, which the existing check on this table already enforces. The public programme keeps
-- reading only `tee_time` and `start_hole`, so a wave stays internal until the assignment is
-- confirmed.
--
-- The write path gains `p_wave`. The old five-argument function is dropped rather than given a
-- defaulted sixth argument: a default would leave two callable signatures, and PostgREST would pick
-- between them by the payload it is given.

alter table public.registration_days
  add column if not exists wave text;

alter table public.registration_days
  drop constraint if exists registration_days_wave_format;

alter table public.registration_days
  add constraint registration_days_wave_format
  check (wave is null or wave ~ '^[A-Z]$');

create index if not exists registration_days_wave
  on public.registration_days (tournament_day_id, wave);

drop function if exists public.assign_registration_day_tee(uuid, integer, time, smallint, boolean);

create or replace function public.assign_registration_day_tee(
  p_registration uuid,
  p_day integer,
  p_tee_time time,
  p_start_hole smallint,
  p_confirmed boolean,
  p_wave text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_tournament uuid;
  v_day_id uuid;
  v_wave text;
begin
  select club_id, tournament_id into v_club, v_tournament
  from public.registrations where id = p_registration;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'That registration was not found.');
  end if;

  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'You do not have access to schedule this event.' using errcode = '42501';
  end if;

  -- A wave is one letter. Lower case and padding are normalised here so the column's check is the
  -- only format rule that has to hold.
  v_wave := nullif(upper(btrim(coalesce(p_wave, ''))), '');
  if v_wave is not null and v_wave !~ '^[A-Z]$' then
    return jsonb_build_object('ok', false, 'message', 'A wave is one letter, for example A.');
  end if;

  select id into v_day_id
  from public.tournament_days
  where tournament_id = v_tournament and club_id = v_club
    and day_number = p_day and is_playing_day;

  if v_day_id is null then
    return jsonb_build_object('ok', false, 'message', 'That is not a playing day for this event.');
  end if;

  update public.registration_days
     set tee_time = p_tee_time,
         start_hole = p_start_hole,
         tee_confirmed = coalesce(p_confirmed, false),
         wave = v_wave,
         selected = true,
         updated_at = now()
   where registration_id = p_registration and tournament_day_id = v_day_id;

  if not found then
    -- The day was not selected. Select it and the assignment together, so a caller cannot end up
    -- with a tee time on a day the player is not playing.
    insert into public.registration_days
      (club_id, registration_id, tournament_day_id, selected, tee_time, start_hole, tee_confirmed, wave)
    values
      (v_club, p_registration, v_day_id, true, p_tee_time, p_start_hole, coalesce(p_confirmed, false), v_wave);
  end if;

  perform public.check_registration_day_rule(p_registration);

  insert into public.audit_log (club_id, actor_id, action, entity, entity_id, detail)
  values (v_club, (select auth.uid()), 'assign_tee', 'registrations', p_registration::text,
          jsonb_build_object('day', p_day, 'teeTime', p_tee_time, 'startHole', p_start_hole,
                             'confirmed', p_confirmed, 'wave', v_wave));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.assign_registration_day_tee(uuid, integer, time, smallint, boolean, text) from public;
grant execute on function public.assign_registration_day_tee(uuid, integer, time, smallint, boolean, text) to authenticated;
