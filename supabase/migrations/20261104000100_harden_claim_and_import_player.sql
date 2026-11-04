-- Close the two open doors on player identity.
--
-- 1. `find_or_create_import_player` is SECURITY DEFINER, takes the club id from the caller and
--    writes `public.players`, with no membership or role check. `20261037000000` revoked it from
--    PUBLIC only, which left Supabase's own EXECUTE grant to `authenticated` in place, so any
--    signed-in account could write into a club roster through PostgREST. This migration re-creates
--    the function with an owner/organizer guard and removes the grant. The registration import
--    calls it from `commit_registration_import`, which is itself SECURITY DEFINER and guarded, so
--    the desk keeps working.
--
-- 2. `claim_player_record` linked an account to a member record by NGAP id, or by a unique exact
--    name, with no proof the account belonged to that person. `signUpWithPassword` called it
--    automatically with the name the person typed, and a name is public. Anyone could claim a
--    member's record and then read that member's entry, handicap, payment status and tee time.
--    The replacement drops the name match and the old two-argument signature and links only when
--    exactly one record matches one of two factors:
--
--      a. the NGAP number AND the birthdate on the record, or
--      b. the email on the signed-in account, when the record holds that email
--         (case-insensitive).
--
--    A match must identify one player row. More than one is refused as ambiguous rather than
--    guessed, including a duplicate in another club: `ngap_id` is unique per (club_id, ngap_id),
--    not globally. A factor that matches nothing, or no factor at all, returns the desk-link
--    answer instead of linking. The account email is read from `auth.users`, never from the
--    request, so a caller cannot nominate someone else's address.
--
-- Nothing here is applied by this file; the owner applies it. The app no longer claims on sign-up
-- and only calls the new (text, date) form, so this migration and the app release move together.

-- 1. The import helper: guarded, and not executable by a signed-in client ------------------------

create or replace function public.find_or_create_import_player(
  p_club uuid,
  p_name text,
  p_first text,
  p_last text,
  p_birthdate date,
  p_gender text,
  p_ngap text,
  p_phone text,
  p_email text,
  p_home_course text,
  p_whs text,
  p_link_player uuid,
  p_force_new boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer;
  v_parts text[];
begin
  -- Only the desk may write the club roster. The import commits already check this, and the grant
  -- is removed below; the guard stays because one mistake in a grant must not become a hole.
  if not public.has_club_role(p_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer can add or link a player.' using errcode = '42501';
  end if;

  -- An explicit operator choice wins, but only after checking the player is in this club. This is
  -- what makes "link to this candidate" mean the chosen person, not a re-match by name.
  if p_link_player is not null then
    select id into v_id
    from public.players
    where id = p_link_player and club_id = p_club;

    if v_id is null then
      return jsonb_build_object('ok', false, 'code', 'not_found',
        'message', 'The linked player is not in this club.');
    end if;
    return jsonb_build_object('ok', true, 'playerId', v_id, 'created', false);
  end if;

  if p_ngap is not null and btrim(p_ngap) <> '' then
    select count(*) into v_count
    from public.players
    where club_id = p_club and ngap_id = btrim(p_ngap);

    if v_count > 1 then
      return jsonb_build_object('ok', false, 'code', 'ambiguous',
        'message', format('NGAP ID %s matches more than one player.', p_ngap));
    end if;
    if v_count = 1 then
      select id into v_id
      from public.players
      where club_id = p_club and ngap_id = btrim(p_ngap)
      limit 1;
      return jsonb_build_object('ok', true, 'playerId', v_id, 'created', false);
    end if;
  end if;

  if not coalesce(p_force_new, false) then
    select count(*) into v_count
    from public.players
    where club_id = p_club and public.import_name_key(full_name) = public.import_name_key(p_name);

    if v_count > 1 then
      return jsonb_build_object('ok', false, 'code', 'ambiguous',
        'message', format('More than one player is named "%s". Add an NGAP ID.', p_name));
    end if;

    if v_count = 1 then
      select id into v_id
      from public.players
      where club_id = p_club and public.import_name_key(full_name) = public.import_name_key(p_name)
      limit 1;
      return jsonb_build_object('ok', true, 'playerId', v_id, 'created', false);
    end if;
  end if;

  if p_gender is not null and p_gender not in ('M', 'F') then
    return jsonb_build_object('ok', false, 'code', 'invalid_gender',
      'message', 'The gender must be M, F or empty.');
  end if;

  v_parts := regexp_split_to_array(btrim(p_name), '\s+');

  insert into public.players
    (club_id, full_name, first_name, last_name, birthdate, gender, ngap_id, phone, email, home_course, whs_id)
  values
    (p_club,
     btrim(p_name),
     nullif(btrim(coalesce(p_first, '')), ''),
     nullif(btrim(coalesce(p_last, '')), ''),
     p_birthdate,
     p_gender,
     nullif(btrim(coalesce(p_ngap, '')), ''),
     nullif(btrim(coalesce(p_phone, '')), ''),
     nullif(btrim(coalesce(p_email, '')), ''),
     nullif(btrim(coalesce(p_home_course, '')), ''),
     nullif(btrim(coalesce(p_whs, '')), ''))
  returning id into v_id;

  -- The first/last columns are optional in the table; fill them when the caller did not.
  if p_first is null or btrim(p_first) = '' then
    update public.players
       set first_name = case
             when array_length(v_parts, 1) > 1
             then array_to_string(v_parts[1:array_length(v_parts, 1) - 1], ' ')
             else null
           end,
           last_name = case
             when array_length(v_parts, 1) > 1
             then v_parts[array_length(v_parts, 1)]
             else v_parts[1]
           end
     where id = v_id;
  end if;

  return jsonb_build_object('ok', true, 'playerId', v_id, 'created', true);
end;
$$;

-- No client calls this function. `commit_registration_import` calls it as its owner, which keeps
-- the permission check off the signed-in role without weakening the guard above.
revoke all on function public.find_or_create_import_player(
  uuid, text, text, text, date, text, text, text, text, text, text, uuid, boolean
) from public, anon, authenticated;

-- 2. The claim: one account, one record, two possible proofs ------------------------------------

-- `create or replace` cannot replace a function whose argument list changed; it would create an
-- overload and leave the insecure name-based function reachable. Drop the old signature first.
drop function if exists public.claim_player_record(text, text);

create or replace function public.claim_player_record(
  p_ngap_id text,
  p_birthdate date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ngap text := nullif(btrim(coalesce(p_ngap_id, '')), '');
  v_email text;
  v_player uuid;
  v_club uuid;
  v_matches integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'signed_out',
      'message', 'Sign in before linking your record.');
  end if;

  -- One record per account. Claiming twice is not an error, it is just already done.
  select id into v_player from public.players where user_id = v_uid limit 1;
  if v_player is not null then
    return jsonb_build_object('ok', true, 'code', 'already_linked',
      'message', 'Your member record is already linked to this account.');
  end if;

  -- Factor 1: the NGAP number together with the birthdate on the record. Both are required: one
  -- without the other proves nothing, and a name is public so it is no longer a factor at all.
  -- `ngap_id` is unique per club, not across clubs, so a second club with the same number and
  -- birthdate is refused below rather than one of them being chosen. The matched row's club_id is
  -- carried into the update, so the link can only land in the club that owned the matched record.
  if v_ngap is not null and p_birthdate is not null then
    select count(*) into v_matches
    from public.players
    where ngap_id = v_ngap and birthdate = p_birthdate;

    if v_matches > 1 then
      return jsonb_build_object('ok', false, 'code', 'ambiguous',
        'message', 'More than one member record matches that NGAP number and birthdate. Ask the desk to link your entry.');
    end if;

    if v_matches = 1 then
      select id, club_id into v_player, v_club
      from public.players
      where ngap_id = v_ngap and birthdate = p_birthdate
      limit 1;
    end if;
  end if;

  -- Factor 2: the email the account signed in with, when the club has that email on a record.
  -- Two rosters sharing one address does not identify a person, so it is refused rather than guessed.
  if v_player is null then
    select lower(btrim(u.email)) into v_email
    from auth.users u
    where u.id = v_uid;

    if v_email is not null and v_email <> '' then
      select count(*) into v_matches
      from public.players p
      where p.email is not null
        and btrim(p.email) <> ''
        and lower(btrim(p.email)) = v_email;

      if v_matches > 1 then
        return jsonb_build_object('ok', false, 'code', 'ambiguous',
          'message', 'More than one member record uses the email on this account. Use your NGAP number and birthdate so the club can tell them apart.');
      end if;

      if v_matches = 1 then
        select p.id, p.club_id into v_player, v_club
        from public.players p
        where p.email is not null
          and btrim(p.email) <> ''
          and lower(btrim(p.email)) = v_email
        limit 1;
      end if;
    end if;
  end if;

  -- No factor, or a factor that matched nothing: say what to do instead of linking a guess.
  if v_player is null then
    return jsonb_build_object('ok', false, 'code', 'no_match',
      'message', 'We could not confirm your identity from those details. Ask the desk to link your entry.');
  end if;

  -- The update is the proof, not the select above: it only links a row that is still free, so a
  -- second account cannot take a record between the check and the write. club_id is pinned to the
  -- row that matched, so the candidate cannot drift to another club.
  update public.players
     set user_id = v_uid
   where id = v_player
     and club_id = v_club
     and user_id is null;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'taken',
      'message', 'That member record is already linked to another account. Ask the desk to check it.');
  end if;

  return jsonb_build_object('ok', true, 'code', 'linked',
    'message', 'Your member record is linked to this account.');
end;
$$;

revoke all on function public.claim_player_record(text, date) from public, anon, authenticated;
grant execute on function public.claim_player_record(text, date) to authenticated;

-- 3. Prove the posture in this transaction -----------------------------------------------------

do $$
declare
  v_old regprocedure := to_regprocedure('public.claim_player_record(text, text)');
begin
  if v_old is not null then
    raise exception 'The old name-based claim_player_record(text, text) still exists.';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.find_or_create_import_player(uuid, text, text, text, date, text, text, text, text, text, text, uuid, boolean)',
       'execute'
     ) then
    raise exception 'authenticated can still execute find_or_create_import_player.';
  end if;

  if has_function_privilege(
       'anon',
       'public.find_or_create_import_player(uuid, text, text, text, date, text, text, text, text, text, text, uuid, boolean)',
       'execute'
     ) then
    raise exception 'anon can still execute find_or_create_import_player.';
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.claim_player_record(text, date)',
       'execute'
     ) then
    raise exception 'authenticated cannot execute claim_player_record.';
  end if;

  if has_function_privilege('anon', 'public.claim_player_record(text, date)', 'execute') then
    raise exception 'anon can execute claim_player_record.';
  end if;

  raise notice 'Verified: the roster helper is closed to clients and the claim requires two factors.';
end $$;
