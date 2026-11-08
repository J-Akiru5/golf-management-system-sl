-- Member-guest pairs become first-class records.
--
-- Why: the pair number only lived in `registrations.answers.teamNo`, written by the import and the
-- seed. No desk screen could assign, replace, move or swap a partner, and nothing stopped one
-- player being placed in two pairs. The draw already keeps partners together through `teamKey` and
-- classes them on the pair average, so a bad pair silently changes the draw.
--
-- This migration is additive. It creates two tables, two guarded write functions and one read
-- function, and replaces `player_own_profile()` with the same shape plus a `pair` key. It does not
-- change or drop an existing table, column, policy or grant on an existing object. It has NOT been
-- applied to the live project.
--
-- The JSON field `answers.teamNo` is backfilled once and stays readable as a fallback for one
-- release. New writes go to the pair tables only.

-- 1. Tables --------------------------------------------------------------------------------------

create table if not exists public.registration_pairs (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  number integer not null check (number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, number)
);

create table if not exists public.registration_pair_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  pair_id uuid not null references public.registration_pairs (id) on delete cascade,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  side text not null check (side in ('member', 'guest')),
  primary key (pair_id, side),
  unique (registration_id)
);

create index if not exists registration_pair_members_club
  on public.registration_pair_members (club_id);
create index if not exists registration_pair_members_registration
  on public.registration_pair_members (registration_id);

-- 2. Guard rails ---------------------------------------------------------------------------------

create or replace function public.touch_registration_pair()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists registration_pairs_touch on public.registration_pairs;
create trigger registration_pairs_touch
  before update on public.registration_pairs
  for each row execute function public.touch_registration_pair();

/**
 * One registration may fill one side of one pair, and only a matching role may fill that side.
 * A player with no recorded role is refused rather than guessed.
 */
create or replace function public.validate_pair_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pair public.registration_pairs%rowtype;
  v_reg public.registrations%rowtype;
  v_role text;
begin
  select * into v_pair from public.registration_pairs where id = new.pair_id;
  if v_pair.id is null then
    raise exception 'That pair does not exist.' using errcode = '23503';
  end if;
  if v_pair.club_id <> new.club_id then
    raise exception 'The pair belongs to another club.' using errcode = '42501';
  end if;

  select * into v_reg from public.registrations where id = new.registration_id;
  if v_reg.id is null then
    raise exception 'That player is not entered in this event.' using errcode = '23503';
  end if;
  if v_reg.club_id <> v_pair.club_id or v_reg.tournament_id <> v_pair.tournament_id then
    raise exception 'That player is not entered in this event.' using errcode = '23503';
  end if;

  v_role := coalesce(v_reg.membership_type, v_reg.answers ->> 'role');
  if v_role is distinct from new.side then
    raise exception 'That player is a %, not a %.', coalesce(v_role, 'player without a recorded role'),
      new.side
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists registration_pair_members_validate on public.registration_pair_members;
create trigger registration_pair_members_validate
  before insert or update on public.registration_pair_members
  for each row execute function public.validate_pair_member();

-- 3. RLS: staff read, the guarded functions write ------------------------------------------------

alter table public.registration_pairs enable row level security;
alter table public.registration_pair_members enable row level security;

drop policy if exists registration_pairs_member_read on public.registration_pairs;
create policy registration_pairs_member_read on public.registration_pairs
  for select to authenticated using (public.is_club_member(club_id));

drop policy if exists registration_pair_members_member_read on public.registration_pair_members;
create policy registration_pair_members_member_read on public.registration_pair_members
  for select to authenticated using (public.is_club_member(club_id));

revoke all on table public.registration_pairs from public, anon;
revoke all on table public.registration_pair_members from public, anon;
grant select on table public.registration_pairs to authenticated;
grant select on table public.registration_pair_members to authenticated;

-- 4. save_pair -----------------------------------------------------------------------------------
-- Creates, replaces or removes one pair. A player named in a slot is removed from their old pair
-- first, so the same call covers assign, replace, move and remove. The response lists every
-- registration whose pair number changed, so the screen updates exactly those rows.

create or replace function public.save_pair(
  p_tournament uuid,
  p_number integer,
  p_member uuid default null,
  p_guest uuid default null,
  p_action text default 'pair.save',
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_pair uuid;
  v_old_pair uuid;
  v_old_number integer;
  v_old record;
  v_reg public.registrations%rowtype;
  v_name text;
  v_affected jsonb := '[]'::jsonb;
  v_action text;
begin
  select t.club_id into v_club from public.tournaments t where t.id = p_tournament for update;
  if v_club is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'Only an owner, organizer or desk member can change a pair'
      using errcode = '42501';
  end if;
  if p_number is null or p_number < 1 then
    raise exception 'A pair number must be 1 or more' using errcode = '22023';
  end if;
  if p_member is not null and p_guest is not null and p_member = p_guest then
    raise exception 'A player cannot fill both sides of one pair' using errcode = '22023';
  end if;

  v_action := case
    when p_action in ('pair.assign', 'pair.replace', 'pair.move', 'pair.remove', 'pair.create')
      then p_action
    else 'pair.save'
  end;

  -- One pair write at a time per event. Two tabs cannot race the same number or the same player.
  perform pg_advisory_xact_lock(hashtext('teeline-pair-' || p_tournament::text)::bigint);

  -- Validate and resolve each named player before touching a row.
  if p_member is not null then
    select * into v_reg from public.registrations where id = p_member;
    if v_reg.id is null or v_reg.club_id <> v_club or v_reg.tournament_id <> p_tournament then
      raise exception 'The member is not entered in this event' using errcode = '23503';
    end if;
    if coalesce(v_reg.membership_type, v_reg.answers ->> 'role') is distinct from 'member' then
      select p.full_name into v_name from public.players p where p.id = v_reg.player_id;
      raise exception '% is not a member entry', coalesce(v_name, v_reg.player_id::text)
        using errcode = '23514';
    end if;
  end if;

  if p_guest is not null then
    select * into v_reg from public.registrations where id = p_guest;
    if v_reg.id is null or v_reg.club_id <> v_club or v_reg.tournament_id <> p_tournament then
      raise exception 'The guest is not entered in this event' using errcode = '23503';
    end if;
    if coalesce(v_reg.membership_type, v_reg.answers ->> 'role') is distinct from 'guest' then
      select p.full_name into v_name from public.players p where p.id = v_reg.player_id;
      raise exception '% is not a guest entry', coalesce(v_name, v_reg.player_id::text)
        using errcode = '23514';
    end if;
  end if;

  -- Find or create the target pair.
  select id into v_pair
  from public.registration_pairs
  where tournament_id = p_tournament and number = p_number
  for update;
  if v_pair is null then
    insert into public.registration_pairs (club_id, tournament_id, number)
    values (v_club, p_tournament, p_number)
    returning id into v_pair;
  end if;

  -- Remove the incoming players from their current pairs. A pair left with no member is deleted.
  for v_old in
    select m.registration_id, m.pair_id, p.number
    from public.registration_pair_members m
    join public.registration_pairs p on p.id = m.pair_id
    where p.tournament_id = p_tournament
      and m.registration_id in (p_member, p_guest)
      and m.pair_id <> v_pair
    for update of p
  loop
    delete from public.registration_pair_members
    where pair_id = v_old.pair_id and registration_id = v_old.registration_id;

    v_affected := v_affected || jsonb_build_array(
      jsonb_build_object('registrationId', v_old.registration_id, 'number', null)
    );

    if not exists (
      select 1 from public.registration_pair_members where pair_id = v_old.pair_id
    ) then
      delete from public.registration_pairs where id = v_old.pair_id;
    end if;
  end loop;

  -- Remember the target pair's current members so a replaced partner is cleared on the screen.
  for v_old in
    select m.registration_id
    from public.registration_pair_members m
    where m.pair_id = v_pair
      and m.registration_id is distinct from p_member
      and m.registration_id is distinct from p_guest
  loop
    v_affected := v_affected || jsonb_build_array(
      jsonb_build_object('registrationId', v_old.registration_id, 'number', null)
    );
  end loop;

  delete from public.registration_pair_members where pair_id = v_pair;

  if p_member is not null then
    insert into public.registration_pair_members (club_id, pair_id, registration_id, side)
    values (v_club, v_pair, p_member, 'member');
    v_affected := v_affected || jsonb_build_array(
      jsonb_build_object('registrationId', p_member, 'number', p_number)
    );
  end if;

  if p_guest is not null then
    insert into public.registration_pair_members (club_id, pair_id, registration_id, side)
    values (v_club, v_pair, p_guest, 'guest');
    v_affected := v_affected || jsonb_build_array(
      jsonb_build_object('registrationId', p_guest, 'number', p_number)
    );
  end if;

  -- A pair with two empty slots carries no information, so it goes away.
  if p_member is null and p_guest is null then
    delete from public.registration_pairs where id = v_pair;
  end if;

  insert into public.audit_log (club_id, actor_id, action, entity, entity_id, result, detail)
  values (
    v_club,
    (select auth.uid()),
    v_action,
    'registration_pair',
    v_pair::text,
    'ok',
    jsonb_build_object(
      'number', p_number,
      'member', p_member,
      'guest', p_guest,
      'reason', nullif(btrim(coalesce(p_reason, '')), ''),
      'affected', v_affected
    )
  );

  return jsonb_build_object('number', p_number, 'affected', v_affected);
end;
$$;

revoke all on function public.save_pair(uuid, integer, uuid, uuid, text, text) from public, anon;
grant execute on function public.save_pair(uuid, integer, uuid, uuid, text, text) to authenticated;

-- 5. swap_pair_members ---------------------------------------------------------------------------
-- Exchanges one side (guest by default) between two full pairs in one transaction. Used by the
-- "Swap partners" action, where a two-call save would trip the one-pair-per-player rule.

create or replace function public.swap_pair_members(
  p_tournament uuid,
  p_number_a integer,
  p_number_b integer,
  p_side text default 'guest',
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_pair_a uuid;
  v_pair_b uuid;
  v_reg_a uuid;
  v_reg_b uuid;
  v_affected jsonb;
begin
  select t.club_id into v_club from public.tournaments t where t.id = p_tournament for update;
  if v_club is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'Only an owner, organizer or desk member can swap partners'
      using errcode = '42501';
  end if;
  if p_side not in ('member', 'guest') then
    raise exception 'The side must be member or guest' using errcode = '22023';
  end if;
  if p_number_a = p_number_b then
    raise exception 'Choose two different pairs to swap' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('teeline-pair-' || p_tournament::text)::bigint);

  select id into v_pair_a from public.registration_pairs
    where tournament_id = p_tournament and number = p_number_a for update;
  select id into v_pair_b from public.registration_pairs
    where tournament_id = p_tournament and number = p_number_b for update;
  if v_pair_a is null or v_pair_b is null then
    raise exception 'One of those pairs does not exist' using errcode = 'P0002';
  end if;

  select registration_id into v_reg_a from public.registration_pair_members
    where pair_id = v_pair_a and side = p_side;
  select registration_id into v_reg_b from public.registration_pair_members
    where pair_id = v_pair_b and side = p_side;
  if v_reg_a is null or v_reg_b is null then
    raise exception 'Both pairs need a % to swap', p_side using errcode = '23514';
  end if;

  delete from public.registration_pair_members
  where pair_id in (v_pair_a, v_pair_b) and side = p_side;

  insert into public.registration_pair_members (club_id, pair_id, registration_id, side)
  values
    (v_club, v_pair_a, v_reg_b, p_side),
    (v_club, v_pair_b, v_reg_a, p_side);

  v_affected := jsonb_build_array(
    jsonb_build_object('registrationId', v_reg_b, 'number', p_number_a),
    jsonb_build_object('registrationId', v_reg_a, 'number', p_number_b)
  );

  insert into public.audit_log (club_id, actor_id, action, entity, entity_id, result, detail)
  values (
    v_club,
    (select auth.uid()),
    'pair.swap',
    'registration_pair',
    v_pair_a::text,
    'ok',
    jsonb_build_object(
      'side', p_side,
      'from', p_number_a,
      'to', p_number_b,
      'reason', nullif(btrim(coalesce(p_reason, '')), ''),
      'affected', v_affected
    )
  );

  return jsonb_build_object('affected', v_affected);
end;
$$;

revoke all on function public.swap_pair_members(uuid, integer, integer, text, text)
  from public, anon;
grant execute on function public.swap_pair_members(uuid, integer, integer, text, text)
  to authenticated;

-- 6. The player's own pair ----------------------------------------------------------------------
-- The profile page already reads `player_own_profile()`. Add one key rather than a second round
-- trip. The partner is this player's partner, never the pair's other name guessed from a list.

create or replace function public.player_own_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select
      p.id,
      p.club_id,
      p.full_name,
      p.ngap_id,
      p.phone,
      p.email,
      p.nickname,
      p.photo_path is not null as has_private_photo,
      p.photo_public_path is not null
        and p.photo_public_consent_at is not null as has_public_photo,
      p.photo_public_consent_at
    from public.players p
    where p.user_id = (select auth.uid())
    limit 1
  )
  select jsonb_build_object(
    'linked', true,
    'player', jsonb_build_object(
      'id', me.id,
      'name', me.full_name,
      'ngapId', me.ngap_id
    ),
    'contact', jsonb_build_object(
      'phone', me.phone,
      'email', me.email,
      'nickname', me.nickname
    ),
    'handicap', (
      select jsonb_build_object(
        'index', h.handicap_index,
        'effectiveDate', h.effective_date
      )
      from public.handicap_records h
      where h.player_id = me.id
        and h.club_id = me.club_id
      order by h.effective_date desc
      limit 1
    ),
    'membership', (
      select jsonb_build_object(
        'type', m.membership_type,
        'memberNumber', m.member_number
      )
      from public.player_memberships m
      where m.player_id = me.id
        and m.club_id = me.club_id
        and m.status = 'active'
      limit 1
    ),
    'club', (
      select jsonb_build_object('name', c.name)
      from public.clubs c
      where c.id = me.club_id
    ),
    'photo', jsonb_build_object(
      'private', me.has_private_photo,
      'public', me.has_public_photo,
      'publicConsentAt', me.photo_public_consent_at
    ),
    'pair', (
      select jsonb_build_object(
        'number', pair.number,
        'published', coalesce(t.published, false),
        'partner', (
          select jsonb_build_object('id', partner.id, 'name', partner.full_name)
          from public.registration_pair_members other
          join public.registrations other_reg on other_reg.id = other.registration_id
          join public.players partner on partner.id = other_reg.player_id
          where other.pair_id = pair.id
            and other.registration_id <> mine.registration_id
          limit 1
        )
      )
      from public.registration_pair_members mine
      join public.registration_pairs pair on pair.id = mine.pair_id
      join public.tournaments t on t.id = pair.tournament_id
      join public.registrations my_reg on my_reg.id = mine.registration_id
      where my_reg.player_id = me.id
      order by pair.updated_at desc
      limit 1
    )
  )
  from me;
$$;

-- 7. Backfill from the old JSON field ------------------------------------------------------------

do $$
declare
  v_row record;
  v_pair uuid;
  v_inserted integer;
  v_clean integer := 0;
  v_incomplete integer := 0;
  v_skipped integer := 0;
begin
  for v_row in
    select
      r.id,
      r.club_id,
      r.tournament_id,
      (r.answers ->> 'teamNo')::integer as team_no,
      coalesce(r.membership_type, r.answers ->> 'role') as role
    from public.registrations r
    where r.answers ? 'teamNo'
      and (r.answers ->> 'teamNo') ~ '^[0-9]+$'
      and (r.answers ->> 'teamNo')::integer > 0
    order by r.tournament_id, (r.answers ->> 'teamNo')::integer, r.id
  loop
    if v_row.role not in ('member', 'guest') then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.registration_pairs (club_id, tournament_id, number)
    values (v_row.club_id, v_row.tournament_id, v_row.team_no)
    on conflict (tournament_id, number) do update set updated_at = now()
    returning id into v_pair;

    insert into public.registration_pair_members (club_id, pair_id, registration_id, side)
    values (v_row.club_id, v_pair, v_row.id, v_row.role)
    on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  select count(*) into v_clean
  from public.registration_pairs p
  where exists (
      select 1 from public.registration_pair_members m
      where m.pair_id = p.id and m.side = 'member'
    )
    and exists (
      select 1 from public.registration_pair_members m
      where m.pair_id = p.id and m.side = 'guest'
    );

  select count(*) into v_incomplete
  from public.registration_pairs p
  where not (
    exists (
      select 1 from public.registration_pair_members m
      where m.pair_id = p.id and m.side = 'member'
    )
    and exists (
      select 1 from public.registration_pair_members m
      where m.pair_id = p.id and m.side = 'guest'
    )
  );

  raise notice
    'registration_pairs backfill: % complete pairs, % incomplete pairs, % entries skipped (duplicate or no role)',
    v_clean, v_incomplete, v_skipped;
end;
$$;

-- 8. Prove the objects and the posture in this transaction ---------------------------------------

do $$
declare
  v_pairs regclass := to_regclass('public.registration_pairs');
  v_members regclass := to_regclass('public.registration_pair_members');
  v_save regprocedure := to_regprocedure(
    'public.save_pair(uuid, integer, uuid, uuid, text, text)'
  );
  v_swap regprocedure := to_regprocedure(
    'public.swap_pair_members(uuid, integer, integer, text, text)'
  );
begin
  if v_pairs is null or v_members is null then
    raise exception 'The pair tables were not created.';
  end if;
  if v_save is null or v_swap is null then
    raise exception 'The pair write functions were not created.';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('registration_pairs', 'registration_pair_members')
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'The pair tables must be SELECT-only for staff; a write policy exists.';
  end if;
end;
$$;
