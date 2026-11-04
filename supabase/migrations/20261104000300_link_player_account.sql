-- Desk-side account linking.
--
-- The player portal tells someone whose sign-in does not match a record to "ask the desk", but no
-- staff screen set public.players.user_id, so the desk had nothing to do. This is the staff
-- counterpart to claim_player_record: the account must already exist, and neither the record nor the
-- account may already be linked.
--
-- The match is by the account's own email in auth.users, never by a name typed into the form. A
-- wrong email therefore fails, it does not attach someone else's record. Nothing is guessed.
--
-- ADDITIVE: no table, column or policy is changed.

create or replace function public.link_player_account(
  p_player uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_linked uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_account uuid;
  v_holder uuid;
  v_rows integer;
begin
  select club_id, user_id into v_club, v_linked
    from public.players
   where id = p_player;

  if v_club is null then
    return jsonb_build_object('ok', false, 'code', 'not_found',
      'message', 'That player was not found.');
  end if;

  -- The same three roles the registration desk functions accept.
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'You do not have access to link accounts for this club.'
      using errcode = '42501';
  end if;

  if v_linked is not null then
    return jsonb_build_object('ok', false, 'code', 'already_linked',
      'message', 'This player record is already linked to an account.');
  end if;

  if v_email = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid',
      'message', 'Enter the email of the account to link.');
  end if;

  select id into v_account
    from auth.users
   where lower(email) = v_email
   limit 1;

  if v_account is null then
    return jsonb_build_object('ok', false, 'code', 'no_account',
      'message', 'No account uses that email. The person has to sign in once, then try again.');
  end if;

  -- One account per player record, across the whole table: the unique index already enforces it.
  select user_id into v_holder
    from public.players
   where user_id = v_account
   limit 1;

  if v_holder is not null then
    return jsonb_build_object('ok', false, 'code', 'account_linked',
      'message', 'That account is already linked to a player record.');
  end if;

  begin
    update public.players
       set user_id = v_account
     where id = p_player
       and club_id = v_club;
    get diagnostics v_rows = row_count;
  exception
    when unique_violation then
      -- Two desks linked the same account at once; the unique index is the authority.
      return jsonb_build_object('ok', false, 'code', 'account_linked',
        'message', 'That account is already linked to a player record.');
  end;

  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'code', 'not_found',
      'message', 'That player was not found.');
  end if;

  insert into public.audit_log (club_id, actor_id, action, entity, entity_id, detail)
  values (v_club, (select auth.uid()), 'link_account', 'players', p_player::text,
          jsonb_build_object('email', v_email));

  return jsonb_build_object('ok', true, 'code', 'linked',
    'message', 'The account is linked to this player.');
end;
$$;

comment on function public.link_player_account(uuid, text) is
  'Links one player record to an existing sign-in account by account email. Owner, organizer or desk only; refuses a record or account that is already linked.';

revoke all on function public.link_player_account(uuid, text) from public;
revoke all on function public.link_player_account(uuid, text) from anon;
grant execute on function public.link_player_account(uuid, text) to authenticated;
