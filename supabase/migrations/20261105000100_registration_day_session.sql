-- The desk can put a player in the morning or the afternoon on each day they play.
--
-- `registration_days.session` is 'AM' or 'PM', and null when the desk has not chosen. Every playing
-- day runs both a morning and an afternoon shotgun, Sunday included, so the column is available on
-- every day.
--
-- The write path gains `p_sessions`, a JSON object keyed by day number ({"1": "AM"}). The old
-- two-argument function is dropped rather than left beside a defaulted three-argument one, so
-- PostgREST has a single signature to call.

alter table public.registration_days
  add column if not exists session text;

alter table public.registration_days
  drop constraint if exists registration_days_session_format;

alter table public.registration_days
  add constraint registration_days_session_format
  check (session is null or session in ('AM', 'PM'));

drop function if exists public.set_registration_days(uuid, integer[]);

create or replace function public.set_registration_days(
  p_registration uuid,
  p_days integer[],
  p_sessions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_tournament uuid;
  v_day integer;
  v_day_id uuid;
  v_selected integer := 0;
  v_bad text;
begin
  select club_id, tournament_id into v_club, v_tournament
  from public.registrations where id = p_registration;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'That registration was not found.');
  end if;

  if not public.is_club_member(v_club) then
    raise exception 'You do not have access to this event.' using errcode = '42501';
  end if;

  -- A session is one of two words. Anything else is refused before a row is touched.
  select s.value into v_bad
  from jsonb_each_text(coalesce(p_sessions, '{}'::jsonb)) as s(key, value)
  where btrim(s.value) <> ''
    and upper(btrim(s.value)) not in ('AM', 'PM')
  limit 1;

  if v_bad is not null then
    return jsonb_build_object('ok', false,
      'message', format('%s is not a session. Use AM or PM.', v_bad));
  end if;

  foreach v_day in array coalesce(p_days, array[]::integer[]) loop
    select id into v_day_id
    from public.tournament_days
    where tournament_id = v_tournament and club_id = v_club
      and day_number = v_day and is_playing_day;

    if v_day_id is null then
      return jsonb_build_object('ok', false, 'message', format('Day %s is not a playing day for this event.', v_day));
    end if;

    insert into public.registration_days (club_id, registration_id, tournament_day_id, selected)
    values (v_club, p_registration, v_day_id, true)
    on conflict (registration_id, tournament_day_id)
    do update set selected = true, updated_at = now();
  end loop;

  update public.registration_days rd
     set selected = false,
         tee_time = null,
         start_hole = null,
         tee_confirmed = false,
         session = null,
         updated_at = now()
   where rd.registration_id = p_registration
     and rd.selected
     and not exists (
       select 1 from public.tournament_days d
       where d.id = rd.tournament_day_id
         and d.is_playing_day
         and d.day_number = any (coalesce(p_days, array[]::integer[]))
     );

  update public.registration_days rd
     set session = nullif(upper(btrim(coalesce(p_sessions ->> d.day_number::text, ''))), ''),
         updated_at = now()
    from public.tournament_days d
   where d.id = rd.tournament_day_id
     and rd.registration_id = p_registration
     and rd.selected;

  select count(*) into v_selected
  from public.registration_days rd
  where rd.registration_id = p_registration and rd.selected;

  perform public.check_registration_day_rule(p_registration);

  insert into public.audit_log (club_id, actor_id, action, entity, entity_id, detail)
  values (v_club, (select auth.uid()), 'set_days', 'registrations', p_registration::text,
          jsonb_build_object('days', coalesce(p_days, array[]::integer[]),
                             'selected', v_selected,
                             'sessions', coalesce(p_sessions, '{}'::jsonb)));

  return jsonb_build_object('ok', true, 'selected', v_selected);
end;
$$;

revoke all on function public.set_registration_days(uuid, integer[], jsonb) from public;
grant execute on function public.set_registration_days(uuid, integer[], jsonb) to authenticated;
