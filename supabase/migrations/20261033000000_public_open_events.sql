-- What a signed-out visitor may see about the club's events.
--
-- The landing page wants to show the events a player can enter. Until now nothing let an anonymous
-- caller enumerate events: the public surface was three functions that each need a tournament id
-- they already know (`public_pairings`, `public_registration_form`, `submit_registration`). This adds
-- the list, and it is deliberately narrow.
--
-- What it returns and why:
--
--   * only events with `state = 'open'` and a cut-off that has not passed. A draft or a
--     not-yet-announced event is never listed, and neither is one that closed yesterday. That is the
--     same condition `public_registration_form` uses for its `isOpen`, so the two cannot disagree
--     about whether a player can still enter.
--   * name, dates, start format, first tee time, cut-off, and how many are entered. No contact
--     details, no club instructions, no fee text, no player names, no handicaps. Those live in
--     `registration` jsonb and stay there: it is free text the club writes for its own desk, and it
--     may name people or read oddly out of context.
--   * `entered` counts only registrations with `status = 'ok'`. `needs_review` means the desk has not
--     confirmed it and `ineligible` means it will not count, so neither belongs in a number the
--     public reads as the field size.
--
-- Security definer, like the other two public functions, because every club table is behind
-- `is_club_member` and a visitor is not a member. The grant below is explicit and required: since
-- 20261031000000 a new function is closed to PUBLIC and anon by default, and this is exactly the
-- case that default exists to make deliberate.
--
-- Read-only and stable, so it can be cached and costs one call per page render.
--
-- The self-check at the end proves the filter rather than asserting it: it inserts one open event
-- and one draft, calls the function, and raises unless the open one is listed and the draft is not.
-- A raise rolls the whole migration back.

create or replace function public.public_open_events()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(entry order by first_date, name), '[]'::jsonb)
  from (
    select
      (coalesce(t.dates, array[t.play_date]))[1] as first_date,
      t.name,
      jsonb_build_object(
        'tournamentId', t.id,
        'name', t.name,
        'dates', to_jsonb(coalesce(t.dates, array[t.play_date])),
        'startFormat', t.start_format,
        'firstTeeTime', to_char(t.first_tee_time, 'HH24:MI'),
        'cutOffDate', t.cutoff_date,
        'entered', (
          select count(*)
          from public.registrations r
          where r.tournament_id = t.id and r.status = 'ok'
        )
      ) as entry
    from public.tournaments t
    where t.state = 'open'
      and t.cutoff_date >= current_date
  ) s;
$$;

comment on function public.public_open_events() is
  'Events a signed-out visitor may see: state open, cut-off not passed. Name, dates, format, first tee time, cut-off and the count of confirmed entries only.';

-- Explicit, and required: new functions are private by default since 20261031000000.
revoke all on function public.public_open_events() from public;
grant execute on function public.public_open_events() to anon, authenticated;

-- Prove the filter, in this transaction.
do $$
declare
  v_club uuid;
  v_course uuid;
  v_open jsonb;
  v_names text[];
begin
  select club_id, course_id into v_club, v_course from public.tournaments limit 1;
  if v_club is null then
    raise notice 'No event exists to derive a club and course from; skipping the self-check.';
    return;
  end if;

  insert into public.tournaments
    (club_id, course_id, name, play_date, cutoff_date, start_format, first_tee_time, state, dates)
  values
    (v_club, v_course, 'zz-probe-open', current_date + 30, current_date + 10, 'shotgun', '06:30',
     'open', array[current_date + 30]),
    (v_club, v_course, 'zz-probe-draft', current_date + 30, current_date + 10, 'shotgun', '06:30',
     'draft', array[current_date + 30]),
    (v_club, v_course, 'zz-probe-closed', current_date + 30, current_date - 1, 'shotgun', '06:30',
     'open', array[current_date + 30]);

  select array_agg(e ->> 'name') into v_names
  from jsonb_array_elements(public.public_open_events()) e;

  if not ('zz-probe-open' = any (v_names)) then
    raise exception 'An open event was not listed: %', v_names;
  end if;
  if 'zz-probe-draft' = any (v_names) then
    raise exception 'A draft event was listed publicly: %', v_names;
  end if;
  if 'zz-probe-closed' = any (v_names) then
    raise exception 'An event whose cut-off has passed was listed publicly: %', v_names;
  end if;

  -- And nothing sensitive rides along on a listed event.
  select array_agg(k) into v_names
  from jsonb_array_elements(public.public_open_events()) e,
       jsonb_object_keys(e) k
  where k not in ('tournamentId', 'name', 'dates', 'startFormat', 'firstTeeTime', 'cutOffDate', 'entered');
  if v_names is not null then
    raise exception 'The public payload carries unexpected fields: %', v_names;
  end if;

  -- Raised so this transaction rolls back: the probes must not survive the migration.
  raise exception 'SELFCHECK-OK: open listed, draft and closed excluded, payload fields as agreed';
exception
  when others then
    if sqlerrm like 'SELFCHECK-OK%' then
      raise notice '%', sqlerrm;
    else
      raise;
    end if;
end $$;
