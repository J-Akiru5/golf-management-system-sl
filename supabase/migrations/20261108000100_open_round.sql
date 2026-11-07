-- Open a scoring round for one playing day, from the published draw only.
--
-- This migration is additive. It creates one new security-definer function and nothing else: no
-- table, column, policy or existing function is changed or dropped. NOT APPLIED. It is written for
-- review and `supabase db push` has not been run.
--
-- What open_round() does, in one transaction:
--   1. Locks the event row and resolves the playing day. The caller may name a day; otherwise the
--      earliest existing competition_rounds day is used, then the earliest playing day, then day 1.
--      Every playing day in tournament_days gets a draft round row on the first call, because
--      nothing else creates competition_rounds for days after the first. The named day is then
--      opened.
--   2. Refuses the call when the draw revision has moved, when the event is not published, or when
--      the live draw no longer matches the published draw.
--   3. Reads membership from tournaments.published_snapshot only. It never reads the live board to
--      decide who is in the round.
--   4. Resolves the round settings from the arguments, then the stored round row, then a confirmed
--      club policy where one unambiguously exists. It raises instead of guessing a value.
--   5. Creates the round entries and the handicap snapshots for players whose registration has a
--      frozen index. Players without a frozen index get no snapshot; their net result is left out
--      rather than estimated.
--   6. Writes one scoring_audit row and returns the round id.
--
-- Multi-day events have one competition_rounds row per playing day. This function opens the day the
-- caller names (or the earliest existing day). Calling it again on the same day returns the same
-- round when the draw has not moved.
--
-- The draw-moved check (section H) builds the same signature from the published snapshot groups and
-- from the live public.groups rows and compares them.

create or replace function public.open_round(
  p_tournament uuid,
  p_expected_revision integer,
  p_required_cards smallint default null,
  p_finalization_authority text default null,
  p_tie_break_policy_id uuid default null,
  p_rules_version text default null,
  p_day_number smallint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_rev integer;
  v_play_date date;
  v_published boolean;
  v_snapshot jsonb;
  v_course uuid;
  v_allowance numeric;
  v_day smallint;
  v_day_date date;
  v_round uuid;
  v_round_status text;
  v_holes smallint;
  v_required smallint;
  v_authority text;
  v_tie_break uuid;
  v_rules text;
  v_missing text[];
  v_confirmed integer;
  v_group jsonb;
  v_pid uuid;
  v_seen uuid[];
  v_reg public.registrations%rowtype;
  v_player_name text;
  v_entry uuid;
  v_source text;
  v_snapshot_sig text;
  v_live_sig text;
begin
  -- A. Lock the event and read the values this call depends on.
  select t.club_id, t.draw_revision, t.play_date, t.published, t.published_snapshot,
         t.course_id, t.allowance
  into v_club, v_rev, v_play_date, v_published, v_snapshot, v_course, v_allowance
  from public.tournaments t
  where t.id = p_tournament
  for update;

  if v_club is null then
    raise exception 'open_round_not_found: no tournament has that id' using errcode = 'P0002';
  end if;

  if p_expected_revision is null then
    raise exception 'The expected draw revision is required' using errcode = '22023';
  end if;

  -- B. Only an owner or organizer may open a round. The desk is read-only for this action.
  if not public.has_club_role(v_club, array['owner', 'organizer']) then
    raise exception 'Only an owner or organizer can open a round' using errcode = '42501';
  end if;

  -- C. Resolve the playing day and make sure every playing day has a round row.
  if p_day_number is not null then
    v_day := p_day_number;
  else
    select min(r.day_number) into v_day
    from public.competition_rounds r
    where r.tournament_id = p_tournament and r.club_id = v_club;

    if v_day is null then
      select min(d.day_number) into v_day
      from public.tournament_days d
      where d.tournament_id = p_tournament
        and d.club_id = v_club
        and d.is_playing_day;
    end if;

    if v_day is null then
      v_day := 1;
    end if;
  end if;

  if v_day < 1 then
    raise exception 'The playing day must be 1 or more' using errcode = '22023';
  end if;

  select c.holes into v_holes
  from public.courses c
  where c.id = v_course and c.club_id = v_club;

  if v_holes is null or v_holes < 1 or v_holes > 36 then
    raise exception 'open_round_no_course: the event course has no usable hole count'
      using errcode = '23503';
  end if;

  -- One draft round per playing day. Days that already have a row are left alone, so a second
  -- call changes nothing. A day whose date is already used by another round is skipped here and
  -- reported below if it is the day being opened.
  insert into public.competition_rounds
    (club_id, tournament_id, day_number, play_date, hole_count, status, allowance,
     handicap_rounding)
  select v_club, p_tournament, d.day_number, d.play_date, v_holes, 'draft', v_allowance, 'whs'
  from public.tournament_days d
  where d.tournament_id = p_tournament
    and d.club_id = v_club
    and d.is_playing_day
  order by d.day_number
  on conflict do nothing;

  select r.id, r.status into v_round, v_round_status
  from public.competition_rounds r
  where r.tournament_id = p_tournament
    and r.club_id = v_club
    and r.day_number = v_day
  for update;

  if v_round is null then
    -- A database without event days still opens day one from the event date.
    select d.play_date into v_day_date
    from public.tournament_days d
    where d.tournament_id = p_tournament
      and d.club_id = v_club
      and d.day_number = v_day
      and d.is_playing_day;

    if v_day_date is null then
      if v_day = 1 then
        v_day_date := v_play_date;
      else
        raise exception 'open_round_no_playing_day: day % is not a playing day for this event', v_day
          using errcode = '23514';
      end if;
    end if;

    insert into public.competition_rounds
      (club_id, tournament_id, day_number, play_date, hole_count, status, allowance,
       handicap_rounding)
    values
      (v_club, p_tournament, v_day, v_day_date, v_holes, 'draft', v_allowance, 'whs')
    on conflict do nothing
    returning id, status into v_round, v_round_status;

    if v_round is null then
      select r.id, r.status into v_round, v_round_status
      from public.competition_rounds r
      where r.tournament_id = p_tournament
        and r.club_id = v_club
        and r.day_number = v_day
      for update;

      if v_round is null then
        raise exception
          'open_round_round_conflict: day % could not be created because its play date is already used by another round',
          v_day using errcode = '23505';
      end if;
    end if;
  end if;

  -- D. Idempotency. An open round returns its id when the draw has not moved. A round already in
  -- scoring, provisional or final is refused. Only a draft round proceeds.
  if v_round_status = 'open' then
    if v_rev = p_expected_revision then
      return v_round;
    end if;
    raise exception 'open_round_stale_revision: the draw is at revision %, you had %',
      v_rev, p_expected_revision using errcode = '40001';
  elsif v_round_status <> 'draft' then
    raise exception 'open_round_already_open: the round for day % is in %', v_day, v_round_status
      using errcode = '23514';
  end if;

  -- E. The caller must name the revision it loaded.
  if v_rev <> p_expected_revision then
    raise exception 'open_round_stale_revision: the draw is at revision %, you had %',
      v_rev, p_expected_revision using errcode = '40001';
  end if;

  -- F. The draw must be published. The published snapshot is the only membership source.
  if not coalesce(v_published, false) or v_snapshot is null then
    raise exception 'open_round_not_published: publish the draw before opening a round'
      using errcode = '23514';
  end if;

  -- G. Every published group must carry its player ids. Players are never matched by name.
  if coalesce(jsonb_typeof(v_snapshot -> 'groups'), 'null') <> 'array' then
    raise exception 'open_round_missing_player_ids: the published draw has no groups'
      using errcode = '23514';
  end if;
  if jsonb_array_length(v_snapshot -> 'groups') = 0 then
    raise exception 'open_round_missing_player_ids: the published draw has no groups'
      using errcode = '23514';
  end if;

  for v_group in select * from jsonb_array_elements(v_snapshot -> 'groups') loop
    if coalesce(jsonb_typeof(v_group -> 'playerIds'), 'null') <> 'array' then
      raise exception 'open_round_missing_player_ids: every published group must name its players'
        using errcode = '23514';
    end if;
    if jsonb_array_length(v_group -> 'playerIds') = 0 then
      raise exception 'open_round_missing_player_ids: every published group must name its players'
        using errcode = '23514';
    end if;
  end loop;

  -- H. Compare the published draw with the live board. Both signatures use the same algorithm:
  -- group number, a colon, the player ids in order joined by commas, and the groups joined by a
  -- vertical bar. Empty groups are left out on both sides, and both sides use inner joins.
  select string_agg(
           (grp.item ->> 'number') || ':' || ids.players,
           '|' order by (grp.item ->> 'number')::integer
         )
  into v_snapshot_sig
  from jsonb_array_elements(v_snapshot -> 'groups') as grp(item)
  cross join lateral (
    select string_agg(p.value, ',' order by p.ord) as players
    from jsonb_array_elements_text(grp.item -> 'playerIds') with ordinality as p(value, ord)
  ) ids
  where jsonb_array_length(grp.item -> 'playerIds') > 0;

  select string_agg(grp.number::text || ':' || mem.players, '|' order by grp.number)
  into v_live_sig
  from public.groups grp
  join lateral (
    select string_agg(reg.player_id::text, ',' order by gm.position) as players
    from public.group_members gm
    join public.registrations reg on reg.id = gm.registration_id and reg.club_id = gm.club_id
    where gm.group_id = grp.id and gm.club_id = v_club
  ) mem on mem.players is not null
  where grp.round_id = v_round and grp.club_id = v_club;

  if v_snapshot_sig is distinct from v_live_sig then
    raise exception 'open_round_draw_moved: the live draw no longer matches the published draw'
      using errcode = '40001';
  end if;

  -- I. Settings. Start from the argument, then the stored round value. Where a table holds a
  -- confirmed answer, use it only when it is unambiguous. Never invent a value.
  v_required := p_required_cards;
  if v_required is null then
    select r.required_cards into v_required
    from public.competition_rounds r
    where r.id = v_round;
  end if;
  if v_required is not null and v_required <= 0 then
    raise exception 'The required number of scorecards must be greater than zero'
      using errcode = '22023';
  end if;

  v_authority := nullif(btrim(p_finalization_authority), '');
  if v_authority is null then
    select r.finalization_authority into v_authority
    from public.competition_rounds r
    where r.id = v_round;
  end if;
  if v_authority is not null and v_authority not in ('owner', 'organizer', 'committee') then
    raise exception 'The finalization authority must be owner, organizer or committee'
      using errcode = '22023';
  end if;

  v_tie_break := p_tie_break_policy_id;
  if v_tie_break is null then
    select r.tie_break_policy_id into v_tie_break
    from public.competition_rounds r
    where r.id = v_round;
  end if;

  if v_tie_break is null then
    select count(*) into v_confirmed
    from public.tie_break_policies p
    where p.club_id = v_club
      and p.confirmed_at is not null
      and p.confirmed_by is not null;

    if v_confirmed = 1 then
      select p.id into v_tie_break
      from public.tie_break_policies p
      where p.club_id = v_club
        and p.confirmed_at is not null
        and p.confirmed_by is not null;
    end if;
  end if;

  if v_tie_break is not null then
    if not exists (
      select 1
      from public.tie_break_policies p
      where p.id = v_tie_break and p.club_id = v_club
    ) then
      -- An id that is not a policy for this club is a missing setting, not a confirmation problem.
      v_tie_break := null;
    elsif not exists (
      select 1
      from public.tie_break_policies p
      where p.id = v_tie_break
        and p.club_id = v_club
        and p.confirmed_at is not null
        and p.confirmed_by is not null
    ) then
      raise exception 'open_round_tie_break_unconfirmed: the tie-break policy is not confirmed for this club'
        using errcode = '23514';
    end if;
  end if;

  v_rules := nullif(btrim(p_rules_version), '');
  if v_rules is null then
    select nullif(btrim(r.rules_version), '') into v_rules
    from public.competition_rounds r
    where r.id = v_round;
  end if;

  v_missing := array[]::text[];
  if v_required is null then
    v_missing := array_append(v_missing, 'required cards');
  end if;
  if v_authority is null then
    v_missing := array_append(v_missing, 'finalization authority');
  end if;
  if v_tie_break is null then
    v_missing := array_append(v_missing, 'tie-break policy');
  end if;
  if v_rules is null then
    v_missing := array_append(v_missing, 'rules version');
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'open_round_missing_settings: %', array_to_string(v_missing, ', ')
      using errcode = '23514';
  end if;

  -- J. One update. The status guard allows draft to open and the settings change from draft.
  update public.competition_rounds
  set required_cards = v_required,
      finalization_authority = v_authority,
      tie_break_policy_id = v_tie_break,
      rules_version = v_rules,
      status = 'open'
  where id = v_round;

  -- K. Entries and handicap snapshots. Duplicate player ids in the snapshot are skipped.
  v_seen := array[]::uuid[];

  for v_group in select * from jsonb_array_elements(v_snapshot -> 'groups') loop
    for v_pid in
      select distinct t.value::uuid
      from jsonb_array_elements_text(v_group -> 'playerIds') as t(value)
    loop
      if v_pid = any (v_seen) then
        continue;
      end if;
      v_seen := array_append(v_seen, v_pid);

      select * into v_reg
      from public.registrations r
      where r.tournament_id = p_tournament
        and r.player_id = v_pid
        and r.club_id = v_club;

      if v_reg.id is null then
        raise exception 'open_round_missing_registration: %', v_pid using errcode = '23503';
      end if;

      insert into public.round_entries (club_id, round_id, registration_id, flight_id)
      values (v_club, v_round, v_reg.id, v_reg.flight_id)
      on conflict (round_id, registration_id) do nothing;

      select re.id into v_entry
      from public.round_entries re
      where re.round_id = v_round and re.registration_id = v_reg.id;

      if v_reg.frozen_index is not null then
        if v_reg.tee_id is null or v_reg.frozen_effective_date is null then
          select p.full_name into v_player_name
          from public.players p
          where p.id = v_pid and p.club_id = v_club;

          raise exception 'open_round_incomplete_registration: % has a frozen index but is missing %',
            coalesce(v_player_name, v_pid::text),
            concat_ws(' and ',
              case when v_reg.tee_id is null then 'a tee' end,
              case when v_reg.frozen_effective_date is null then 'an effective date' end)
            using errcode = '23514';
        end if;

        v_source := null;
        select case hr.source
                 when 'ngap_import' then 'NGAP import'
                 when 'manual' then 'Manual entry'
                 else 'Registration freeze'
               end
        into v_source
        from public.handicap_records hr
        where hr.id = v_reg.frozen_record_id;

        if v_source is null then
          v_source := 'Registration freeze';
        end if;

        perform public.save_handicap_snapshot(
          v_entry,
          v_reg.frozen_index,
          v_source,
          v_reg.frozen_effective_date
        );
      end if;
    end loop;
  end loop;

  -- L. One audit row for the open action.
  insert into public.scoring_audit
    (club_id, round_id, entity, entity_id, action, actor_id, after)
  values
    (v_club, v_round, 'round', v_round, 'opened', (select auth.uid()),
     jsonb_build_object(
       'requiredCards', v_required,
       'finalizationAuthority', v_authority,
       'tieBreakPolicyId', v_tie_break,
       'rulesVersion', v_rules
     ));

  -- M. Return the round id.
  return v_round;
end;
$$;

revoke all on function public.open_round(uuid, integer, smallint, text, uuid, text, smallint)
  from public, anon;
grant execute on function public.open_round(uuid, integer, smallint, text, uuid, text, smallint)
  to authenticated;
