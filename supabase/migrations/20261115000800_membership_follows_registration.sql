-- A member/guest change now reaches the event registration, the pair and the public pages.
--
-- RUN IN THE SUPABASE SQL EDITOR. Not applied by the agent.
--
-- Why: `set_player_membership` (the Member/Guest edit on the player page) only changed the player's
-- `player_memberships` row. The event registration (`registrations.membership_type` and
-- `answers.role`), which the Players list, Registration desk, pair validation and the public
-- profile read, kept the old role. So a player changed to Guest stayed a Member everywhere else,
-- and the pair kept the old side.
--
-- What changes (only this function is replaced):
--   * The player's registrations in events that still have an unfinished round (or no rounds) take
--     the new role in both places (`membership_type` and `answers.role`).
--   * The player's pair seat moves to the new side. If the partner already sits on that side, the
--     player is taken out of the pair instead (never two players on one side), and the pair is
--     deleted if it ends up empty. The result says which happened.
--   * Public pages read these rows live (profile, partner), so they follow at once. The published
--     pairings snapshot holds names and groups only, not the role, so it needs no change.
-- Final events are left alone. The role check and permissions are unchanged (owner/organizer).

create or replace function public.set_player_membership(
  p_player uuid,
  p_type text,
  p_member_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_reg record;
  v_pair_member record;
  v_unpaired int := 0;
  v_moved int := 0;
begin
  select club_id into v_club from public.players where id = p_player;
  if v_club is null then
    return jsonb_build_object('ok', false, 'message', 'That player was not found.');
  end if;

  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer can change membership.' using errcode = '42501';
  end if;

  if p_type = 'member' then
    insert into public.player_memberships
      (club_id, player_id, membership_type, member_number, status)
    values
      (v_club, p_player, 'member', nullif(btrim(coalesce(p_member_number, '')), ''), 'active')
    on conflict (club_id, player_id) where status = 'active'
    do update set membership_type = 'member',
                  member_number = excluded.member_number,
                  updated_at = now();
  elsif p_type = 'guest' then
    update public.player_memberships
       set status = 'inactive', updated_at = now()
     where club_id = v_club and player_id = p_player and status = 'active';
  else
    return jsonb_build_object('ok', false, 'message', 'Membership must be member or guest.');
  end if;

  for v_reg in
    select reg.id
    from public.registrations reg
    where reg.player_id = p_player
      and reg.club_id = v_club
      and (
        not exists (select 1 from public.competition_rounds r where r.tournament_id = reg.tournament_id)
        or exists (
          select 1 from public.competition_rounds r
          where r.tournament_id = reg.tournament_id and r.status <> 'final'
        )
      )
  loop
    update public.registrations
       set membership_type = p_type,
           answers = jsonb_set(coalesce(answers, '{}'::jsonb), '{role}', to_jsonb(p_type), true)
     where id = v_reg.id;

    select m.pair_id, m.side into v_pair_member
    from public.registration_pair_members m
    where m.registration_id = v_reg.id;

    if v_pair_member.pair_id is not null and v_pair_member.side is distinct from p_type then
      if exists (
        select 1 from public.registration_pair_members m
        where m.pair_id = v_pair_member.pair_id and m.side = p_type
      ) then
        delete from public.registration_pair_members where registration_id = v_reg.id;
        if not exists (
          select 1 from public.registration_pair_members where pair_id = v_pair_member.pair_id
        ) then
          delete from public.registration_pairs where id = v_pair_member.pair_id;
        end if;
        v_unpaired := v_unpaired + 1;
      else
        update public.registration_pair_members
           set side = p_type
         where registration_id = v_reg.id;
        v_moved := v_moved + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'membershipType', p_type,
    'pairSideChanged', v_moved,
    'removedFromPair', v_unpaired
  );
end;
$$;

revoke all on function public.set_player_membership(uuid, text, text) from public;
grant execute on function public.set_player_membership(uuid, text, text) to authenticated;
