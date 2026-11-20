-- Give every registration a member/guest role, so it can be searched and paired.
--
-- RUN IN THE SUPABASE SQL EDITOR. Not applied by the agent.
--
-- Why: the pair dialog lists unpaired players by the registration's role (member or guest).
-- 14 registrations added from the desk lists and sheets carry no role at all, so they never appear
-- in the search: ASENCIO, JOHN MARK (a guest) could not be paired with ADORIO, RONNEL (member),
-- and the same holds for 12 other players.
--
-- Rule used, the one the player page already uses: a player with an active membership is a member;
-- a player with none is a guest. Only registrations whose role is empty are filled; a role that is
-- already set is never changed. A trigger applies the same rule to new registrations that arrive
-- without a role. After this, pair ASENCIO with ADORIO in the pair dialog.

update public.registrations r
   set membership_type = case
         when exists (
           select 1 from public.player_memberships m
           where m.player_id = r.player_id and m.club_id = r.club_id and m.status = 'active'
         ) then 'member'
         else 'guest'
       end,
       answers = jsonb_set(
         coalesce(r.answers, '{}'::jsonb), '{role}',
         to_jsonb(case
           when exists (
             select 1 from public.player_memberships m
             where m.player_id = r.player_id and m.club_id = r.club_id and m.status = 'active'
           ) then 'member'::text
           else 'guest'::text
         ), true)
 where r.membership_type is null
   and coalesce(r.answers ->> 'role', '') not in ('member', 'guest');

create or replace function public.default_registration_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.membership_type is null then
    new.membership_type := case
      when exists (
        select 1 from public.player_memberships m
        where m.player_id = new.player_id and m.club_id = new.club_id and m.status = 'active'
      ) then 'member'
      else 'guest'
    end;
    new.answers := jsonb_set(coalesce(new.answers, '{}'::jsonb), '{role}',
                             to_jsonb(new.membership_type), true);
  end if;
  return new;
end;
$$;

revoke all on function public.default_registration_role() from public;

drop trigger if exists registrations_zz_default_role on public.registrations;
create trigger registrations_zz_default_role
  before insert on public.registrations
  for each row execute function public.default_registration_role();

-- Expect 0:
select count(*) as still_without_role
  from public.registrations
 where membership_type is null;
