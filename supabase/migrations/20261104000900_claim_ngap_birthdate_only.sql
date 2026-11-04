-- Account linking: NGAP number and birthdate only.
--
-- `20261104000100` allowed a second factor: the email the account signed in with, matched against
-- the email the club holds on a player record. That factor is only as strong as control of the
-- address, and this project runs with email confirmation off, so anyone could sign up with a
-- member's address and claim that record. The owner chose to drop it.
--
-- The rule is now one factor only: the NGAP number together with the birthdate on the record. A
-- player whose details do not match is told to ask the desk, and the desk has a real action for it
-- (`link_player_account`, migration 20261104000300).
--
-- The signature is unchanged, so this is `create or replace`; no overload is left behind. The body
-- is the 20261104000100 function with the email block and its variable removed and nothing else
-- changed.

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

  -- The NGAP number together with the birthdate on the record. Both are required: one without the
  -- other proves nothing, and a name is public so it is not a factor at all. `ngap_id` is unique per
  -- club, not across clubs, so a second club with the same number and birthdate is refused rather
  -- than one of them being chosen. The matched row's club_id is carried into the update, so the link
  -- can only land in the club that owned the matched record.
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

-- Prove the email factor is gone and the grants are still right, in this transaction.
do $$
declare
  v_src text;
begin
  select prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'claim_player_record';

  if v_src is null then
    raise exception 'claim_player_record is missing.';
  end if;

  if position('auth.users' in v_src) > 0 then
    raise exception 'claim_player_record still reads auth.users; the email factor is not removed.';
  end if;

  if not has_function_privilege('authenticated', 'public.claim_player_record(text, date)', 'execute') then
    raise exception 'authenticated cannot execute claim_player_record.';
  end if;

  if has_function_privilege('anon', 'public.claim_player_record(text, date)', 'execute') then
    raise exception 'anon can execute claim_player_record.';
  end if;

  raise notice 'Verified: the claim requires NGAP number and birthdate, and nothing reads the account email.';
end $$;
