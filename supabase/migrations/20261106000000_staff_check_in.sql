/**
 * Arrivals are recorded per playing day, on the day row the tee time already lives on.
 *
 * A volunteer taps Arrived; the guarded function stamps who and when. Undo clears both rather than
 * writing a second record, because the question the desk asks is "is this player here", not "how
 * many times did someone press the button". The audit row keeps the history.
 */
alter table public.registration_days
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by uuid references auth.users (id) on delete set null;

comment on column public.registration_days.checked_in_at is
  'When the player was checked in for this playing day. Null means expected, not arrived.';
comment on column public.registration_days.checked_in_by is
  'The staff account that recorded the arrival. Cleared together with the time on undo.';

-- A day's arrival list is read for one playing day at a time.
create index if not exists registration_days_checked_in
  on public.registration_days (tournament_day_id, checked_in_at);

/**
 * Records or undoes an arrival for one player on one playing day.
 *
 * Refuses a caller who is not staff of the same club, a day the player is not entered for, and a
 * day number the event does not have. Returns the stamp so the phone can show the time without a
 * second read.
 */
create or replace function public.set_entry_day_check_in(
  p_registration uuid,
  p_day_number smallint,
  p_arrived boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_club uuid;
  v_day uuid;
  v_at timestamptz;
  v_actor uuid := (select auth.uid());
begin
  select r.club_id into v_club
  from public.registrations r
  where r.id = p_registration;

  if v_club is null then
    raise exception 'That registration was not found.';
  end if;

  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'Only club staff can record an arrival.';
  end if;

  select rd.id into v_day
  from public.registration_days rd
  join public.tournament_days d on d.id = rd.tournament_day_id
  where rd.registration_id = p_registration
    and rd.club_id = v_club
    and d.day_number = p_day_number
    and rd.selected;

  if v_day is null then
    raise exception 'That player is not entered for that day.';
  end if;

  update public.registration_days
  set checked_in_at = case when coalesce(p_arrived, false) then now() else null end,
      checked_in_by = case when coalesce(p_arrived, false) then v_actor else null end,
      updated_at = now()
  where id = v_day
  returning checked_in_at into v_at;

  insert into public.audit_log (club_id, actor_id, action, entity, entity_id, detail)
  values (
    v_club,
    v_actor,
    case when coalesce(p_arrived, false) then 'entry.check_in' else 'entry.check_in_undo' end,
    'registration_day',
    v_day::text,
    jsonb_build_object('registration', p_registration, 'day', p_day_number)
  );

  return jsonb_build_object('ok', true, 'checked_in_at', v_at);
end;
$$;

revoke all on function public.set_entry_day_check_in(uuid, smallint, boolean) from public;
revoke all on function public.set_entry_day_check_in(uuid, smallint, boolean) from anon;
grant execute on function public.set_entry_day_check_in(uuid, smallint, boolean) to authenticated;
