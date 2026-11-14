-- Save a handicap snapshot from the HDCP box on the scorecard (issue 258).
--
-- NOT APPLIED. Review before `supabase db push`.
--
-- The owner must approve applying it by name. It adds one function and changes nothing that exists:
-- no table, column, constraint, trigger, policy or existing function is touched, so it is additive.
--
-- Why it exists. For the 24th Bamboo Tee the playing handicap is the handicap written on the paper
-- card with the decimal dropped (16.7 plays off 16), and a blank box counts as 0. Every snapshot
-- written so far comes from `save_handicap_snapshot`, which works the playing handicap out from the
-- registration's frozen index and the tee's slope and rating. That function cannot produce the
-- card's number, and `recalculate_player_results` scores net points from the snapshot's
-- `playing_handicap`, so the card's number has to be stored in the snapshot.
--
-- What it does, in one transaction:
--   1. Reads the round entry, its round and the registration's tee. Only an owner, organizer or desk
--      user may call it, the same as `save_handicap_snapshot`.
--   2. Reads `p_card_handicap` as text: blank is 0, a plain number such as 16.7 is accepted, anything
--      else (a plus handicap, text, a negative number, a number above 54) is refused. Nothing is
--      guessed.
--   3. Stores the snapshot with `playing_handicap = course_handicap = floor(value)`, the index cut
--      (not rounded) to one decimal, a full allowance and `rounding = 'single'`. The database check
--      only knows 'whs' and 'single'; this file does not widen it. The snapshot is marked by its
--      `index_source`, the fixed text 'Scorecard HDCP box', and the app reads that mark to treat the
--      snapshot as the card rule instead of recomputing it from the tee.
--   4. Writes one scoring_audit row with the text typed, the playing handicap and the one it replaced.
--
-- Freezing is unchanged. A snapshot is frozen once the round leaves draft or open, by the existing
-- `handicap_snapshot_guard` trigger. So:
--   * a player with no snapshot can get one in any open, scoring or provisional round (an insert is
--     not guarded);
--   * a player whose snapshot already has the same playing handicap is left alone;
--   * a player whose snapshot differs can only be changed while the round is draft or open. After
--     that the trigger refuses it, and fixing that is an owner decision, not something this file
--     works around.

create or replace function public.save_card_handicap_snapshot(
  p_round_entry uuid,
  p_card_handicap text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_round uuid;
  v_status text;
  v_tournament uuid;
  v_play_date date;
  v_rules text;
  v_tee uuid;
  v_tee_row public.tees%rowtype;
  v_text text;
  v_value numeric;
  v_playing smallint;
  v_index numeric;
  v_previous smallint;
  v_id uuid;
begin
  select re.club_id, re.round_id, r.status, r.tournament_id, r.play_date, r.rules_version,
         reg.tee_id
  into v_club, v_round, v_status, v_tournament, v_play_date, v_rules, v_tee
  from public.round_entries re
  join public.competition_rounds r on r.id = re.round_id and r.club_id = re.club_id
  join public.registrations reg on reg.id = re.registration_id and reg.club_id = re.club_id
  where re.id = p_round_entry;

  if v_club is null then
    raise exception 'Round entry not found' using errcode = 'P0002';
  end if;
  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'Only club staff can save a card handicap' using errcode = '42501';
  end if;
  if v_status not in ('draft', 'open', 'scoring', 'provisional') then
    raise exception 'The round is final, so its handicaps cannot be saved' using errcode = '23514';
  end if;
  if v_rules is null or btrim(v_rules) = '' then
    raise exception 'The round has no rules version, so the card handicap cannot be recorded'
      using errcode = '22023';
  end if;

  v_text := btrim(coalesce(p_card_handicap, ''));
  if v_text = '' then
    v_value := 0;
  elsif v_text !~ '^[0-9]+(\.[0-9]+)?$' then
    raise exception 'The card handicap "%" is not a plain number', v_text using errcode = '22023';
  else
    v_value := v_text::numeric;
  end if;
  if v_value > 54 then
    raise exception 'The card handicap % is above the limit of 54', v_value using errcode = '22023';
  end if;

  v_playing := floor(v_value)::smallint;
  v_index := trunc(v_value, 1);

  if v_tee is null then
    raise exception 'The registration has no tee' using errcode = '23503';
  end if;

  select * into v_tee_row
  from public.tees
  where id = v_tee and club_id = v_club;

  if v_tee_row.id is null then
    raise exception 'The tee was not found' using errcode = '23503';
  end if;

  if v_tee_row.course_id <> (
    select t.course_id from public.tournaments t
    where t.id = v_tournament and t.club_id = v_club
  ) then
    raise exception 'The tee does not belong to this tournament''s course' using errcode = '23503';
  end if;

  select hs.id, hs.playing_handicap into v_id, v_previous
  from public.handicap_snapshots hs
  where hs.round_id = v_round and hs.round_entry_id = p_round_entry;

  -- Nothing to change: the snapshot already plays off the same whole number.
  if v_id is not null and v_previous = v_playing then
    return v_id;
  end if;

  -- An existing snapshot that differs is updated here, and the freeze trigger refuses that once the
  -- round has left draft or open. A first snapshot is an insert and is allowed in a scoring round.
  insert into public.handicap_snapshots
    (club_id, round_id, round_entry_id, handicap_index, index_source, index_effective_date,
     tee_id, course_rating, slope, course_par, allowance, rounding, course_handicap,
     playing_handicap, rules_version, created_by)
  values
    (v_club, v_round, p_round_entry, v_index, 'Scorecard HDCP box', v_play_date,
     v_tee, v_tee_row.course_rating, v_tee_row.slope, v_tee_row.par, 1, 'single',
     v_playing, v_playing, v_rules, (select auth.uid()))
  on conflict (round_id, round_entry_id) do update
    set handicap_index = excluded.handicap_index,
        index_source = excluded.index_source,
        index_effective_date = excluded.index_effective_date,
        tee_id = excluded.tee_id,
        course_rating = excluded.course_rating,
        slope = excluded.slope,
        course_par = excluded.course_par,
        allowance = excluded.allowance,
        rounding = excluded.rounding,
        course_handicap = excluded.course_handicap,
        playing_handicap = excluded.playing_handicap,
        rules_version = excluded.rules_version
  returning id into v_id;

  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, reason, after)
  values
    (v_club, v_round, 'handicap_snapshot', v_id, 'saved', (select auth.uid()), null,
     jsonb_build_object(
       'rule', 'card_handicap',
       'cardHandicap', nullif(v_text, ''),
       'blank', v_text = '',
       'handicapIndex', v_index,
       'playingHandicap', v_playing,
       'previousPlayingHandicap', v_previous,
       'rulesVersion', v_rules
     ));

  return v_id;
end;
$$;

revoke all on function public.save_card_handicap_snapshot(uuid, text) from public, anon;
grant execute on function public.save_card_handicap_snapshot(uuid, text) to authenticated;
