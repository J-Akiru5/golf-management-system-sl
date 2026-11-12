-- A scored round can be published provisionally.
--
-- `competition_rounds.provisional_publication` defaulted to 'off' and no code ever set it, so
-- publish_round() always refused and the public leaderboard stayed empty until a finalization that
-- could not be reached. A round that has approved cards should be publishable provisionally;
-- finalization keeps its own gates.
--
-- Two changes, both on the existing publish path:
--   1. The column default becomes 'verified_holes', and rounds already open are switched on. A round
--      opened after this migration takes the new default from open_round()'s insert.
--   2. publish_round() accepts a round that is still 'open'. Nothing moved a round from open to
--      scoring after the first card, so the old function refused the only state a scored round could
--      be in. The transition now happens inside the publish, through the allowed open -> scoring ->
--      provisional path.
--
-- This migration is additive in behaviour. It does not add a publication route, table or policy.

alter table public.competition_rounds
  alter column provisional_publication set default 'verified_holes';

update public.competition_rounds
set provisional_publication = 'verified_holes'
where provisional_publication = 'off'
  and status in ('draft', 'open', 'scoring');

create or replace function public.publish_round(
  p_round uuid,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_status text;
  v_publication text;
  v_version integer;
  v_snapshot jsonb;
begin
  select club_id, status, provisional_publication
  into v_club, v_status, v_publication
  from public.competition_rounds
  where id = p_round
  for update;

  if v_club is null then
    raise exception 'Round not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer can publish results' using errcode = '42501';
  end if;
  if v_status not in ('open', 'scoring', 'provisional') then
    raise exception 'The round is not ready to publish provisional results' using errcode = '23514';
  end if;
  if v_publication = 'off' then
    raise exception 'Provisional publication is off for this round' using errcode = '23514';
  end if;

  -- The status guard allows open -> scoring -> provisional only. A round that was opened and then
  -- scored but never moved on is moved here, so the desk does not need a separate "start scoring"
  -- step that does not exist on the screen.
  if v_status = 'open' then
    update public.competition_rounds
    set status = 'scoring'
    where id = p_round and status = 'open';
    v_status := 'scoring';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.round_publications
  where round_id = p_round;

  v_snapshot := public.build_round_snapshot(p_round, 'provisional', v_version);

  if jsonb_array_length(v_snapshot -> 'gross') = 0 then
    raise exception 'There are no results to publish' using errcode = '23514';
  end if;

  insert into public.round_publications
    (club_id, round_id, version, state, snapshot, note, published_by)
  values
    (v_club, p_round, v_version, 'provisional', v_snapshot, nullif(btrim(p_note), ''),
     (select auth.uid()));

  update public.competition_rounds
  set status = 'provisional'
  where id = p_round and status = 'scoring';

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, reason, after)
  values
    (v_club, p_round, 'round_publication', null, 'published_provisional', (select auth.uid()),
     nullif(btrim(p_note), ''), jsonb_build_object('version', v_version));

  return v_version;
end;
$$;

revoke all on function public.publish_round(uuid, text) from public, anon;
grant execute on function public.publish_round(uuid, text) to authenticated;
