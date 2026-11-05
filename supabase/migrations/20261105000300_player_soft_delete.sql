-- Retiring a player without destroying the record.
--
-- The hard delete is refused while a registration or a round entry still depends on the player, which
-- left the desk with a duplicate it could not remove. A player can now be disabled (active = false)
-- and separately soft-deleted (deleted_at set). The row, its handicap history and its registrations
-- stay; the directory and the draw leave it out; the desk can put it back.
--
-- ADDITIVE. No column, policy or trigger is replaced. Writes stay restricted to the owner and
-- organizers by the existing players update policy, and the hard delete keeps its own guard.

alter table public.players
  add column if not exists active boolean not null default true,
  add column if not exists deleted_at timestamptz;

create index if not exists players_club_active
  on public.players (club_id, active);

create index if not exists players_club_deleted
  on public.players (club_id, deleted_at)
  where deleted_at is not null;

comment on column public.players.active is
  'False when the club has retired the record. It stays for history and is never drawn.';
comment on column public.players.deleted_at is
  'When the desk soft-deleted the record. Null while the player is in use.';

-- A soft-deleted record is never active as well, so no screen can show it as both.
alter table public.players
  drop constraint if exists players_deleted_is_inactive;
alter table public.players
  add constraint players_deleted_is_inactive check (deleted_at is null or active = false);

-- Self-check: the columns and the guard are in place.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'players' and column_name = 'active'
  ) then
    raise exception 'players.active was not added';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'players' and column_name = 'deleted_at'
  ) then
    raise exception 'players.deleted_at was not added';
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'players_deleted_is_inactive'
  ) then
    raise exception 'players_deleted_is_inactive was not created';
  end if;
end $$;
