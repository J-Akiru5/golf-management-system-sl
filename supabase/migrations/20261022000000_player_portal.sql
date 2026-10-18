-- Player portal: one account, one player record, read-only.
--
-- ADDITIVE. Nothing is dropped and no existing policy is replaced. A player never gains access to a
-- staff table: the link lives on public.players.user_id and NOT in public.club_members, because
-- public.is_club_member(club_id) gates every club table. A "player" role in club_members would hand
-- a player the whole club's data.
--
-- The claim matches exactly like public.submit_registration: NGAP id first, then an unambiguous
-- exact name. An ambiguous name is refused, never guessed. The only write a player can make is
-- setting user_id on a record no one else holds.

-- 1. The link ------------------------------------------------------------------------------------

alter table public.players
  add column if not exists user_id uuid references auth.users (id) on delete set null;

comment on column public.players.user_id is
  'The signed-in account that claimed this directory entry. Null until claimed; one account per entry.';

create unique index if not exists players_user_id_key
  on public.players (user_id)
  where user_id is not null;

-- 2. Who is signed in? ---------------------------------------------------------------------------

-- SECURITY DEFINER so the lookup itself is never filtered by the players policies (no recursion).
-- PostgREST exposes it, which is how the sign-in action decides where to send an account.
create or replace function public.current_player_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
    from public.players
   where user_id = (select auth.uid())
   limit 1;
$$;

revoke all on function public.current_player_id() from public;
grant execute on function public.current_player_id() to authenticated;

-- 3. Claim a record ------------------------------------------------------------------------------

create or replace function public.claim_player_record(
  p_name text,
  p_ngap_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_ngap text := nullif(btrim(coalesce(p_ngap_id, '')), '');
  v_player uuid;
  v_owner uuid;
  v_matches int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'signed_out',
      'message', 'Sign in before linking your record.');
  end if;

  if v_name is null and v_ngap is null then
    return jsonb_build_object('ok', false, 'code', 'invalid',
      'message', 'Enter your full name, or your NGAP number.');
  end if;

  -- One record per account. Claiming twice is not an error, it is just already done.
  select id into v_player from public.players where user_id = v_uid limit 1;
  if v_player is not null then
    return jsonb_build_object('ok', true, 'code', 'already_linked',
      'message', 'Your member record is already linked to this account.');
  end if;

  -- 1. The NGAP number, which is the strongest signal.
  if v_ngap is not null then
    select count(*) into v_matches from public.players where ngap_id = v_ngap;

    if v_matches > 1 then
      return jsonb_build_object('ok', false, 'code', 'ambiguous',
        'message', 'More than one member record uses that NGAP number. Ask the club to check it.');
    end if;

    if v_matches = 1 then
      select id into v_player from public.players where ngap_id = v_ngap limit 1;
    end if;
  end if;

  -- 2. Otherwise an exact name, but only when it is unique.
  if v_player is null and v_name is not null then
    select count(*) into v_matches from public.players where lower(full_name) = lower(v_name);

    if v_matches > 1 then
      return jsonb_build_object('ok', false, 'code', 'ambiguous',
        'message', 'More than one member matches that name. Add your NGAP number so we can tell them apart.');
    end if;

    if v_matches = 1 then
      select id into v_player from public.players where lower(full_name) = lower(v_name) limit 1;
    end if;
  end if;

  if v_player is null then
    return jsonb_build_object('ok', false, 'code', 'no_match',
      'message', 'No member record matches those details. Ask the club to add you, or enter through the event link.');
  end if;

  select user_id into v_owner from public.players where id = v_player;
  if v_owner is not null then
    return jsonb_build_object('ok', false, 'code', 'taken',
      'message', 'That member record is already linked to another account. Ask the club to check it.');
  end if;

  -- The only write a player can make, and it only ever sets the link.
  update public.players set user_id = v_uid where id = v_player;

  return jsonb_build_object('ok', true, 'code', 'linked',
    'message', 'Your member record is linked to this account.');
end;
$$;

revoke all on function public.claim_player_record(text, text) from public;
grant execute on function public.claim_player_record(text, text) to authenticated;

-- 4. What the portal shows -----------------------------------------------------------------------

-- One allow-listed projection, computed server-side for the signed-in player only. Staff read
-- tournaments, groups and flights through their own policies; this function is the only path a
-- player has to any of it, and it returns their own entry plus the frozen published start.
--
-- The start comes from tournaments.published_snapshot, never from the live board (AGENTS.md rule).
-- A snapshot lists players by name, so the match is on the exact name; a snapshot with no matching
-- group simply shows nothing rather than a guess.
create or replace function public.player_portal_entries()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select id, club_id, full_name, ngap_id
      from public.players
     where user_id = (select auth.uid())
     limit 1
  )
  select jsonb_build_object(
    'linked', (select count(*) from me) = 1,
    'player', (
      select jsonb_build_object('id', id, 'name', full_name, 'ngapId', ngap_id)
        from me
    ),
    'entries', coalesce((
      select jsonb_agg(entry order by entry ->> 'eventDate' desc, entry ->> 'eventName')
      from (
        select jsonb_build_object(
          'tournamentId', t.id,
          'eventName', t.name,
          'eventDate', t.play_date,
          'dates', to_jsonb(coalesce(t.dates, array[t.play_date])),
          'startFormat', t.start_format,
          'firstTeeTime', to_char(t.first_tee_time, 'HH24:MI'),
          'state', t.state,
          'status', r.status,
          'reasons', to_jsonb(r.reasons),
          'frozenIndex', r.frozen_index,
          'playingHandicap', r.playing_handicap,
          'category', c.name,
          'tee', tee.name,
          'flight', f.name,
          'paymentStatus', r.payment_status,
          'published', t.published_snapshot is not null,
          'start', (
            select jsonb_build_object(
              'hole', g ->> 'startHole',
              'wave', g -> 'wave',
              'time', g ->> 'time'
            )
            from jsonb_array_elements(coalesce(t.published_snapshot -> 'groups', '[]'::jsonb)) g
            where (g -> 'players') @> to_jsonb(me.full_name)
            limit 1
          )
        ) as entry
        from public.registrations r
        join public.tournaments t on t.id = r.tournament_id and t.club_id = r.club_id
        left join public.categories c on c.id = r.category_id and c.club_id = r.club_id
        left join public.tees tee on tee.id = r.tee_id and tee.club_id = r.club_id
        left join public.flights f on f.id = r.flight_id and f.club_id = r.club_id
        where r.player_id = (select id from me)
      ) rows
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.player_portal_entries() from public;
grant execute on function public.player_portal_entries() to authenticated;
