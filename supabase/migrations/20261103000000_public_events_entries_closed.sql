-- Public events after entries close
--
-- `public_open_events()` answers one question: which events can a visitor still enter? That is the
-- right question for the entry form, and the wrong one for the landing page during tournament week.
-- The 24th Bamboo Tee closes entries on 1 Nov and is played 12 to 15 Nov, so for eleven days the
-- landing page showed no event at all: no carousel, and a generic hero in place of the club's own
-- tournament.
--
-- This function returns the events a visitor may see, with `entriesOpen` telling the page whether the
-- entry button still applies:
--
--   * `state` is `open` or `closed`. A draft is never listed.
--   * The event has not finished long ago. It stays listed until a week after its last playing day,
--     which covers the event itself and the results that follow it.
--   * `entriesOpen` is true only when the event is open *and* the cut-off has not passed, the same
--     condition `public_registration_form()` uses for `isOpen`. One rule, two readers.
--   * The payload is the open-events payload plus `entriesOpen`: name, dates, format, first tee time,
--     cut-off and the count of confirmed entries. No contact details, no instructions, no player data.
--
-- The old function stays in place. The app reads this one first and falls back to
-- `public_open_events()` if this migration has not reached the project yet, so the two can ship in
-- either order.
--
-- Security definer, like the other public reads, because every club table is behind `is_club_member`
-- and a visitor is not a member. The grant below is explicit: new functions are private by default.

create or replace function public.public_events()
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
        'entriesOpen', (t.state = 'open' and t.cutoff_date >= current_date),
        'entered', (
          select count(*)
          from public.registrations r
          where r.tournament_id = t.id and r.status = 'ok'
        )
      ) as entry,
      coalesce(
        (select max(d) from unnest(coalesce(t.dates, array[t.play_date])) as d),
        t.play_date
      ) as last_date
    from public.tournaments t
    where t.state in ('open', 'closed')
  ) s
  where s.last_date >= current_date - 7;
$$;

comment on function public.public_events() is
  'Events a signed-out visitor may see, including ones whose entries have closed. entriesOpen says whether the entry form still applies. Name, dates, format, first tee time, cut-off and confirmed entries only.';

revoke all on function public.public_events() from public;
grant execute on function public.public_events() to anon, authenticated;

-- Prove the filter and the flag, in this transaction.
do $$
declare
  v_club uuid;
  v_course uuid;
  v_rows jsonb;
  v_names text[];
  v_open_flag boolean;
  v_closed_flag boolean;
  v_keys text[];
begin
  select club_id, course_id into v_club, v_course from public.tournaments limit 1;
  if v_club is null then
    raise notice 'No event exists to derive a club and course from; skipping the self-check.';
    return;
  end if;

  insert into public.tournaments
    (club_id, course_id, name, play_date, cutoff_date, start_format, first_tee_time, state, dates)
  values
    (v_club, v_course, 'zz-probe-open', current_date + 10, current_date + 2, 'shotgun', '06:30',
     'open', array[current_date + 10]),
    (v_club, v_course, 'zz-probe-closed', current_date + 10, current_date - 1, 'shotgun', '06:30',
     'closed', array[current_date + 10]),
    (v_club, v_course, 'zz-probe-draft', current_date + 10, current_date + 2, 'shotgun', '06:30',
     'draft', array[current_date + 10]),
    (v_club, v_course, 'zz-probe-finished', current_date - 30, current_date - 40, 'shotgun', '06:30',
     'closed', array[current_date - 30]);

  v_rows := public.public_events();

  select array_agg(e ->> 'name') into v_names from jsonb_array_elements(v_rows) e;
  if not ('zz-probe-open' = any (v_names)) then
    raise exception 'An open event was not listed: %', v_names;
  end if;
  if not ('zz-probe-closed' = any (v_names)) then
    raise exception 'An event whose entries have closed was not listed: %', v_names;
  end if;
  if 'zz-probe-draft' = any (v_names) then
    raise exception 'A draft event was listed publicly: %', v_names;
  end if;
  if 'zz-probe-finished' = any (v_names) then
    raise exception 'An event finished more than a week ago was listed: %', v_names;
  end if;

  select (e ->> 'entriesOpen')::boolean into v_open_flag
  from jsonb_array_elements(v_rows) e where e ->> 'name' = 'zz-probe-open';
  if v_open_flag is not true then
    raise exception 'An open event did not report entriesOpen: %', v_open_flag;
  end if;

  select (e ->> 'entriesOpen')::boolean into v_closed_flag
  from jsonb_array_elements(v_rows) e where e ->> 'name' = 'zz-probe-closed';
  if v_closed_flag is not false then
    raise exception 'A closed event reported entries as open: %', v_closed_flag;
  end if;

  select array_agg(k) into v_keys
  from jsonb_array_elements(v_rows) e, jsonb_object_keys(e) k
  where k not in ('tournamentId', 'name', 'dates', 'startFormat', 'firstTeeTime', 'cutOffDate',
                  'entriesOpen', 'entered');
  if v_keys is not null then
    raise exception 'The public payload carries unexpected fields: %', v_keys;
  end if;

  -- Raised so this transaction rolls back: the probes must not survive the migration.
  raise exception 'SELFCHECK-OK: open and closed listed, draft and finished excluded, entriesOpen correct';
exception
  when others then
    if sqlerrm like 'SELFCHECK-OK%' then
      raise notice '%', sqlerrm;
    else
      raise;
    end if;
end $$;
