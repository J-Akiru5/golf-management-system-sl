-- Let a card snapshot hold a negative playing handicap (issue: WHS on save).
--
-- NOT APPLIED. Review before `supabase db push`; the owner must approve applying it to the live
-- event by name.
--
-- Why it exists. The event now scores a card with the WHS playing handicap worked out from the
-- registration index and tee. On a tee whose Course Rating is below its par, index 0 plays off a
-- negative number (the owner's rule of 14 November 2026 names -2 on White). The installed
-- `save_card_handicap_snapshot` only accepts `^[0-9]+(\.[0-9]+)?$`, so it refuses a negative
-- playing handicap with "The card handicap "-2" is not a plain number". Nothing else can store it:
-- `save_handicap_snapshot` only runs while the round is draft or open, and the round is scoring.
--
-- What changes. This file replaces only the body of `public.save_card_handicap_snapshot`. The
-- signature, return type, `security definer`, `set search_path = ''` and the ACL are unchanged, and
-- `create or replace` keeps the existing grants. No table, column, constraint, trigger, policy,
-- index or data is touched.
--   * `p_card_handicap` accepts an optional leading minus, so -2 and -2.4 are plain numbers.
--   * The accepted range is -20 to 54 (it was 0 to 54), which covers every playing handicap a WHS
--     index capped at the event maximum can produce.
--   * Everything else is unchanged: blank is 0, the playing handicap is floor(value), the stored
--     index is value cut to one decimal, `rounding` is 'single', `index_source` is
--     'Scorecard HDCP box', the freeze behaviour is the same, and one audit row is written.
--
-- Until this is applied the app keeps working: it works the WHS number out in TypeScript, saves it
-- through the installed function for every 0-or-more handicap, and refuses a negative one with a
-- plain sentence naming this file.

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
  elsif v_text !~ '^-?[0-9]+(\.[0-9]+)?$' then
    raise exception 'The card handicap "%" is not a plain number', v_text using errcode = '22023';
  else
    v_value := v_text::numeric;
  end if;
  if v_value > 54 or v_value < -20 then
    raise exception 'The card handicap % is outside the range -20 to 54', v_value
      using errcode = '22023';
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

-- Checks to run once applied to a disposable project, in one transaction that is rolled back:
--   1. A scoring round, as a desk user, with p_card_handicap = '-2': expect a snapshot whose
--      playing_handicap is -2, one audit row, and the player's net result recalculated next time
--      the card is saved.
--   2. The same call with '-20' succeeds and '-21' is refused with the range message.
--   3. p_card_handicap = '18' behaves exactly as before, including the "already the same" no-op.
