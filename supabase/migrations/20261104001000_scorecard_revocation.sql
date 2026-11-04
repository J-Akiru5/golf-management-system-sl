-- Revoke an approved scorecard --------------------------------------------------------------------
-- A correction adds a revision. A revocation is different: the desk withdraws a card that should
-- not count at all (wrong player, duplicate entry, a score the committee ruled unofficial). The card
-- row, its entries and its audit trail stay; only its status changes. The canonical rows are then
-- rebuilt from the evidence that remains, so a revoked card cannot keep feeding the standings.
--
-- Allowed while scoring is open or provisional. A finalized round is locked, because its published
-- snapshot is the result the players were shown.

alter table public.scorecards
  drop constraint if exists scorecards_status_check;

alter table public.scorecards
  add constraint scorecards_status_check
  check (status in ('submitted', 'in_review', 'approved', 'rejected', 'superseded', 'revoked'));

create or replace function public.revoke_scorecard(
  p_card uuid,
  p_canonical jsonb,
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
  v_player uuid;
  v_status text;
  v_revision smallint;
  v_round_status text;
begin
  select s.club_id, s.round_id, s.player_id, s.status, s.revision, r.status
  into v_club, v_round, v_player, v_status, v_revision, v_round_status
  from public.scorecards s
  join public.competition_rounds r on r.id = s.round_id and r.club_id = s.club_id
  where s.id = p_card
  for update of s, r;

  if v_club is null then
    raise exception 'Scorecard not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'Only club staff can revoke a scorecard' using errcode = '42501';
  end if;
  if v_status <> 'approved' then
    raise exception 'Only an approved card can be revoked' using errcode = '23514';
  end if;
  if v_round_status not in ('open', 'scoring', 'provisional') then
    raise exception 'A finalized round is locked; its scores cannot be revoked' using errcode = '23514';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'A revocation needs a reason' using errcode = '22023';
  end if;

  update public.scorecards
  set status = 'revoked', rejection_reason = btrim(p_reason)
  where id = p_card;

  -- Rebuilds the player's canonical holes and results from the cards and resolutions that remain.
  perform public.apply_canonical(v_round, v_player, coalesce(p_canonical, '[]'::jsonb));

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, reason, before, after)
  values
    (v_club, v_round, 'scorecard', p_card, 'revoked', (select auth.uid()), btrim(p_reason),
     jsonb_build_object('status', v_status, 'revision', v_revision),
     jsonb_build_object('status', 'revoked'));
end;
$$;

revoke all on function public.revoke_scorecard(uuid, jsonb, text) from public, anon;
grant execute on function public.revoke_scorecard(uuid, jsonb, text) to authenticated;
