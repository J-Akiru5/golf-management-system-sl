-- Removes the last thing that kept a deleted class on file: a draw group naming it.
--
-- `save_event_setup` will not delete a class row that a group still points at, and it skips that row
-- instead of failing. So replacing a class set left the extra rows behind whenever the board on file
-- had groups in them, and they reappeared on the next reload. Replacing "Class D" with one "Class D"
-- could still show three Class D rows afterwards.
--
-- This function moves those groups onto a class that is staying, before the save removes the old
-- rows: the class with the same name when there is one, otherwise the class whose band covers the
-- removed row. The save that follows bumps the draw revision, so the board is already marked out of
-- date; its group numbers, players and start holes are kept.
--
-- Every statement is additive and the function is called before the class save, so a database
-- without it behaves exactly as before.

create or replace function public.detach_dropped_class_groups(
  p_tournament uuid,
  p_keep uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_moved integer := 0;
  v_left integer := 0;
begin
  select club_id into v_club
  from public.tournaments
  where id = p_tournament;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'That event was not found.');
  end if;

  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer can change the classes.' using errcode = '42501';
  end if;

  -- A group whose class is being removed moves to the class that replaces it. The order is the same
  -- name first, then the nearest band.
  update public.groups g
     set flight_id = pick.kept_id
    from (
      select g2.id as group_id,
             (
               select f.id
               from public.flights f
               where f.club_id = g2.club_id
                 and f.id = any (p_keep)
               order by
                 (f.name = dropped.name) desc,
                 abs(f.min_value - dropped.min_value),
                 f.id
               limit 1
             ) as kept_id
      from public.groups g2
      join public.flights dropped on dropped.id = g2.flight_id
      where g2.club_id = v_club
        and not (dropped.id = any (p_keep))
    ) pick
   where g.club_id = v_club
     and g.id = pick.group_id
     and pick.kept_id is not null;

  get diagnostics v_moved = row_count;

  -- Groups whose removed class has no replacement at all. They are reported so the desk knows the
  -- row will survive the save instead of wondering why it came back.
  select count(*) into v_left
  from public.groups g
  join public.flights dropped on dropped.id = g.flight_id
  where g.club_id = v_club
    and not (dropped.id = any (p_keep));

  return jsonb_build_object('ok', true, 'moved', v_moved, 'left', v_left);
end;
$$;

revoke all on function public.detach_dropped_class_groups(uuid, uuid[]) from public;
grant execute on function public.detach_dropped_class_groups(uuid, uuid[]) to authenticated;
