-- Player self-service profile -------------------------------------------------------------------
--
-- ADDITIVE AND UNAPPLIED. This file has not been applied to any database. `supabase db push` has not
-- been run against it. It drops nothing, creates no table or column, changes no policy, changes no
-- grant on an existing object, and replaces no existing function.
--
-- It adds two functions, both scoped to the caller's own record:
--
--   1. public.player_update_own_contact(p_phone, p_email, p_nickname)  <- the write path
--   2. public.player_own_profile()                                      <- the read path
--
-- The write function is the one this screen needs: until now a player had no self-service write path
-- at all, because public.players is gated by public.is_club_member() and a player is not a club
-- member. It updates exactly phone, email and nickname on the caller's one player row.
--
-- The read function is here because every field the profile screen shows for the player's own record
-- (handicap index and its effective date, membership, the club, whether a private or public photo
-- exists) also sits behind the staff-only gate. Without it the screen can show only the name and NGAP
-- number that public.player_portal_entries() already returns. It is STABLE, takes no arguments, and
-- returns booleans for the photos, never a storage path, so the private bucket path cannot leak
-- through a cached response.
--
-- The caller's record is resolved exactly the way the player portal resolves it:
--
--   public.players.user_id = (select auth.uid())
--
-- copied from 20261023000000_player_portal.sql (current_player_id and player_portal_entries) and
-- 20261104000200_portal_group_by_player_id.sql. There is one row per account: the unique partial
-- index players_user_id_key enforces it.
--
-- Columns used, checked against the real schema:
--   public.players: id, club_id, full_name, ngap_id, phone, email, nickname, user_id,
--                   photo_path, photo_public_path, photo_public_consent_at
--     - email and nickname were added by 20261020000000_shell_domain.sql (both on public.players, not
--       on a separate table).
--     - photo_public_path and photo_public_consent_at were added by
--       20261039000000_caddies_public_photos.sql.
--   public.handicap_records: player_id, club_id, handicap_index, effective_date
--   public.player_memberships: player_id, club_id, membership_type, member_number, status
--   public.clubs: id, name

-- 1. Read the caller's own record ----------------------------------------------------------------

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
    )
  )
  from me;
$$;

-- 2. Update the three fields a player may change -------------------------------------------------

create or replace function public.player_update_own_contact(
  p_phone text,
  p_email text,
  p_nickname text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid;
  v_club uuid;
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_nickname text := nullif(btrim(coalesce(p_nickname, '')), '');
begin
  -- Only the caller's own row. No id is accepted from the client, so this cannot be pointed at
  -- someone else's record.
  select p.id, p.club_id
  into v_player, v_club
  from public.players p
  where p.user_id = (select auth.uid())
  limit 1;

  if v_player is null then
    raise exception 'No club record is linked to this account.' using errcode = 'P0002';
  end if;

  -- The page validates first and says so in the player's language. These checks are the last line:
  -- a direct PostgREST call must not be able to store a value the column cannot present.
  if v_phone is not null and char_length(v_phone) > 24 then
    raise exception 'That mobile number is too long.' using errcode = '22001';
  end if;
  if v_email is not null and (
    char_length(v_email) > 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
  ) then
    raise exception 'That contact email does not look complete.' using errcode = '22023';
  end if;
  if v_nickname is not null and char_length(v_nickname) > 24 then
    raise exception 'That nickname is too long.' using errcode = '22001';
  end if;

  update public.players
  set
    phone = v_phone,
    email = v_email,
    nickname = v_nickname
  where id = v_player
    and club_id = v_club;

  return jsonb_build_object(
    'phone', v_phone,
    'email', v_email,
    'nickname', v_nickname
  );
end;
$$;

-- 3. Grants: signed-in players only ---------------------------------------------------------------
-- The project's convention (20261031000000_private_functions_by_default.sql and
-- 20261030000000_revoke_anon_execute.sql) is to revoke from public and anon explicitly and grant to
-- authenticated, because Supabase's own default grants are wider than PUBLIC alone.

revoke all on function public.player_own_profile() from public, anon;
grant execute on function public.player_own_profile() to authenticated;

revoke all on function public.player_update_own_contact(text, text, text) from public, anon;
grant execute on function public.player_update_own_contact(text, text, text) to authenticated;

-- 4. Prove the posture in this transaction --------------------------------------------------------

do $$
declare
  v_read regprocedure := to_regprocedure('public.player_own_profile()');
  v_write regprocedure := to_regprocedure(
    'public.player_update_own_contact(text, text, text)'
  );
  v_secdef boolean;
begin
  if v_read is null or v_write is null then
    raise exception 'The player self-profile functions were not created.';
  end if;

  select p.prosecdef into v_secdef from pg_proc p where p.oid = v_read;
  if v_secdef is not true then
    raise exception 'player_own_profile() must be security definer.';
  end if;

  select p.prosecdef into v_secdef from pg_proc p where p.oid = v_write;
  if v_secdef is not true then
    raise exception 'player_update_own_contact() must be security definer.';
  end if;
end;
$$;
