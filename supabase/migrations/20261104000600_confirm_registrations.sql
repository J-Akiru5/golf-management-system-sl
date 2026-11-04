-- Confirm a batch of registrations in one call.
--
-- A public registration always lands as `needs_review`, so a large field arrives with every entry
-- waiting for the desk's per-row "Mark ready". This flips only the rows the desk selected and only
-- while they are still `needs_review`; an `ineligible` row is never touched, and nothing outside the
-- named event is touched.
--
-- The desk filters out entries with missing facts (no birthdate, no handicap index, a duplicate
-- name, an ineligible age) before it calls this. The function does not invent routing facts; it
-- records the desk's confirmation of the rows it was given.
--
-- ADDITIVE: no table, column, policy or existing function is changed.

create or replace function public.confirm_registrations(
  p_tournament uuid,
  p_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_count integer := 0;
begin
  select club_id into v_club
    from public.tournaments
   where id = p_tournament;

  if v_club is null then
    raise exception 'That event was not found.' using errcode = 'P0002';
  end if;

  -- The same three roles that may take a registration may confirm one.
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'You do not have access to confirm registrations for this event.'
      using errcode = '42501';
  end if;

  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;

  update public.registrations
     set status = 'ok'
   where club_id = v_club
     and tournament_id = p_tournament
     and status = 'needs_review'
     and id = any (p_ids);

  get diagnostics v_count = row_count;

  insert into public.audit_log (club_id, actor_id, action, entity, entity_id, detail)
  values (v_club, (select auth.uid()), 'confirm_registrations', 'tournaments', p_tournament::text,
          jsonb_build_object('confirmed', v_count));

  return v_count;
end;
$$;

comment on function public.confirm_registrations(uuid, uuid[]) is
  'Marks the named needs-review registrations in one event as ready and returns how many changed. Owner, organizer or desk only.';

revoke all on function public.confirm_registrations(uuid, uuid[]) from public;
revoke all on function public.confirm_registrations(uuid, uuid[]) from anon;
grant execute on function public.confirm_registrations(uuid, uuid[]) to authenticated;
