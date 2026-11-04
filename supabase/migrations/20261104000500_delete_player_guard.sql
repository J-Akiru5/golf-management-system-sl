-- A player delete must not take the event's scoring evidence with it without a word.
--
-- `public.players` is the root of a playing record. Registrations point at it, group members point at
-- the registrations, and round entries, scorecards, hole resolutions and results all reach the player
-- through `on delete cascade`. The desk confirmation only mentions the audit log, so removing a
-- player can drop entries and scoring history with no warning beyond "this cannot be undone".
--
-- This adds a `before delete` guard. It refuses the delete while the player still has a registration
-- or a round entry, and names the player and the row counts so the desk knows what is in the way. The
-- club owner keeps the final say and can still remove a player deliberately.
--
-- The trigger fires before any cascade starts, so a refused delete changes nothing. It depends on
-- `public.round_entries` (20261035000000) and `public.has_club_role` (20261019000000).

create or replace function public.guard_player_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registrations integer;
  v_entries integer;
  v_parts text[] := '{}';
begin
  -- Only the club owner may remove a player who already has history.
  if public.has_club_role(old.club_id, array['owner']) then
    return old;
  end if;

  select count(*) into v_registrations
    from public.registrations r
   where r.player_id = old.id
     and r.club_id = old.club_id;

  -- Round entries hang off the registration; these are the scoring rows that would cascade.
  select count(*) into v_entries
    from public.registrations r
    join public.round_entries re
      on re.registration_id = r.id and re.club_id = r.club_id
   where r.player_id = old.id
     and r.club_id = old.club_id;

  if v_registrations > 0 then
    v_parts := v_parts || format(
      '%s registration%s',
      v_registrations,
      case when v_registrations = 1 then '' else 's' end
    );
  end if;

  if v_entries > 0 then
    v_parts := v_parts || format(
      '%s scoring entr%s',
      v_entries,
      case when v_entries = 1 then 'y' else 'ies' end
    );
  end if;

  -- array_length is null for an empty array, so the null-safe comparison keeps an unused player
  -- deletable.
  if array_length(v_parts, 1) > 0 then
    raise exception
      'Cannot delete player "%". This record still has %. Remove the entries first, or ask the owner.',
      old.full_name,
      array_to_string(v_parts, ' and ')
      using errcode = '23503';
  end if;

  return old;
end;
$$;

comment on function public.guard_player_delete() is
  'Before delete on public.players: refuse while a registration or round entry depends on the player, unless the caller is the club owner.';

revoke all on function public.guard_player_delete() from public, anon;

drop trigger if exists players_delete_guard on public.players;
create trigger players_delete_guard
  before delete on public.players
  for each row execute function public.guard_player_delete();

-- Self-check: the trigger is on the table and not internal.
do $$
begin
  if not exists (
    select 1
      from pg_trigger
     where tgname = 'players_delete_guard'
       and tgrelid = 'public.players'::regclass
       and not tgisinternal
  ) then
    raise exception 'players_delete_guard was not created';
  end if;
end $$;
