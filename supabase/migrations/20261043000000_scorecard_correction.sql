-- Record why a scorecard was corrected.
--
-- A correction is a new card revision written by `submit_scorecard`. The revision is the evidence;
-- this function adds the desk's reason to the append-only audit, next to the `submitted` row that
-- `submit_scorecard` already writes. Only an owner or organizer may record it, matching the UI.
--
-- The function is idempotent per card: retrying the reason after a network failure cannot add a
-- second correction row for the same revision.

create or replace function public.record_scorecard_correction(
  p_card uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_round uuid;
  v_revision smallint;
begin
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'A correction needs a reason' using errcode = '22023';
  end if;

  select club_id, round_id, revision
    into v_club, v_round, v_revision
    from public.scorecards
   where id = p_card;

  if v_club is null then
    raise exception 'Scorecard not found' using errcode = 'P0002';
  end if;

  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only the owner or an organizer can correct a scorecard'
      using errcode = '42501';
  end if;

  -- The same revision may be retried after a failed request.
  if exists (
    select 1
      from public.scoring_audit
     where club_id = v_club
       and entity = 'scorecard'
       and entity_id = p_card
       and action = 'correction'
  ) then
    return;
  end if;

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, reason, after)
  values
    (v_club, v_round, 'scorecard', p_card, 'correction', (select auth.uid()),
     btrim(p_reason), jsonb_build_object('revision', v_revision));
end;
$$;

revoke all on function public.record_scorecard_correction(uuid, text) from public, anon;
grant execute on function public.record_scorecard_correction(uuid, text) to authenticated;

comment on function public.record_scorecard_correction(uuid, text) is
  'Appends the desk''s reason for a scorecard correction to scoring_audit. Owner and organizer only.';
