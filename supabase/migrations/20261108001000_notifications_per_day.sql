-- Make the unplaced-player alert count each playing day, not the event once.
--
-- Before this file, `sync_notifications` asked whether a ready player had any `group_members` row
-- at all. A player drawn on day 1 satisfied that check for the whole event, so a player missing
-- from day 3's board never raised the blocking alert.
--
-- This migration only replaces the body of the existing function. The signature, return type,
-- `security definer`, `set search_path = ''` and the ACL are unchanged, and `create or replace`
-- keeps the existing grants. No table, column, policy, trigger or data is touched.
--
-- The check now walks the playing days the player is registered for. A player raises the alert
-- when at least one selected day's round has no group_members row for them. A player with no
-- selected-day row at all (a row written before registration_days) keeps the old event-wide check,
-- because a missing row still means "plays every day".
-- Additive and safe to re-run. It has NOT been applied by the agent.

create or replace function public.sync_notifications(p_tournament uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_cutoff date;
  v_group_size smallint;
  v_min smallint;
  n int;
  v_open int := 0;
begin
  select t.club_id, t.cutoff_date, t.group_size, t.min_group_size
    into v_club, v_cutoff, v_group_size, v_min
    from public.tournaments t
   where t.id = p_tournament;

  if v_club is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;

  if not public.is_club_member(v_club) then
    raise exception 'Not a member of this club' using errcode = '42501';
  end if;

  -- Everything is treated as fixed until the checks below say otherwise. An alert that stops
  -- applying goes away by itself.
  update public.notifications
     set resolved_at = now()
   where tournament_id = p_tournament and resolved_at is null;

  -- Ready players the draw does not place on every playing day they selected.
  select count(distinct r.id) into n
    from public.registrations r
   where r.tournament_id = p_tournament
     and r.status = 'ok'
     and (
       exists (
         select 1
           from public.registration_days rd
           join public.tournament_days td on td.id = rd.tournament_day_id
           join public.competition_rounds cr
             on cr.tournament_id = td.tournament_id
            and cr.day_number = td.day_number
          where rd.registration_id = r.id
            and rd.selected
            and not exists (
              select 1
                from public.group_members gm
               where gm.registration_id = r.id
                 and gm.round_id = cr.id
            )
       )
       or (
         not exists (
           select 1
             from public.registration_days rd2
            where rd2.registration_id = r.id
              and rd2.selected
         )
         and not exists (
           select 1
             from public.group_members gm2
            where gm2.registration_id = r.id
         )
       )
     );

  if n > 0 then
    insert into public.notifications
      (club_id, tournament_id, kind, subject, severity, title, detail)
    values (v_club, p_tournament, 'unplaced', '', 'blocking',
      n || ' ready player(s) have no group',
      'They are registered and eligible, but the draw does not place them on a playing day they chose.')
    on conflict (tournament_id, kind, subject)
      do update set resolved_at = null, title = excluded.title, detail = excluded.detail;
    v_open := v_open + 1;
  end if;

  -- Entries the desk has not confirmed.
  select count(*) into n
    from public.registrations r
   where r.tournament_id = p_tournament and r.status = 'needs_review';

  if n > 0 then
    insert into public.notifications
      (club_id, tournament_id, kind, subject, severity, title, detail)
    values (v_club, p_tournament, 'needs_review', '', 'warning',
      n || ' registration(s) need review',
      'The routing could not place them without a decision.')
    on conflict (tournament_id, kind, subject)
      do update set resolved_at = null, title = excluded.title, detail = excluded.detail;
    v_open := v_open + 1;
  end if;

  -- Groups over the cap the event allows.
  select count(*) into n
    from public.groups g
   where g.tournament_id = p_tournament
     and (select count(*) from public.group_members gm where gm.group_id = g.id) > v_group_size;

  if n > 0 then
    insert into public.notifications
      (club_id, tournament_id, kind, subject, severity, title, detail)
    values (v_club, p_tournament, 'group_over_capacity', '', 'blocking',
      n || ' group(s) are over the limit',
      'A group has more players than the event allows (' || v_group_size || ').')
    on conflict (tournament_id, kind, subject)
      do update set resolved_at = null, title = excluded.title, detail = excluded.detail;
    v_open := v_open + 1;
  end if;

  -- Groups below the minimum, which the engine flags rather than blocks.
  select count(*) into n
    from public.groups g
   where g.tournament_id = p_tournament
     and (select count(*) from public.group_members gm where gm.group_id = g.id) between 1 and (v_min - 1);

  if n > 0 then
    insert into public.notifications
      (club_id, tournament_id, kind, subject, severity, title, detail)
    values (v_club, p_tournament, 'group_under_minimum', '', 'warning',
      n || ' group(s) are below the minimum',
      'Aim for ' || v_min || ' to ' || v_group_size || ' players a group.')
    on conflict (tournament_id, kind, subject)
      do update set resolved_at = null, title = excluded.title, detail = excluded.detail;
    v_open := v_open + 1;
  end if;

  -- The cut-off is close. Seven days is a heads-up, not a rule.
  if v_cutoff is not null and v_cutoff >= current_date and v_cutoff - current_date <= 7 then
    insert into public.notifications
      (club_id, tournament_id, kind, subject, severity, title, detail)
    values (v_club, p_tournament, 'cutoff_soon', '', 'info',
      'Entry cut-off is within a week',
      'The cut-off is ' || to_char(v_cutoff, 'FMDD FMMon YYYY') ||
      '. Upload a fresh NGAP export before it passes.')
    on conflict (tournament_id, kind, subject)
      do update set resolved_at = null, title = excluded.title, detail = excluded.detail;
    v_open := v_open + 1;
  end if;

  return v_open;
end;
$$;
