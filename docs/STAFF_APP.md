# The staff app at `/staff`

The app a volunteer carries on the course and the desk uses at the registration table. It is not a
smaller copy of the tournament desk: it is four destinations and one job per screen.

| Destination | Screen | The job |
| --- | --- | --- |
| Today | `/staff` | The day, how many have arrived, the group this phone walks with, four ways to start a job |
| Players | `/staff/players` | Search, check in, undo, call, move a player (manager), withdraw from the day |
| Schedule | `/staff/schedule` | Every group in tee order with its hole, flight and arrival count |
| Score | `/staff/score` | The claimed group's sheet, tap scores or scan the paper card |

Supporting screens: `/staff/add` (walk-up), `/staff/schedule/[id]` (one group),
`/staff/groups/[id]/score` (the sheet).

## The ten rules

1. One job per screen.
2. Four destinations, labels always visible, no drawer, no settings, no print, no map.
3. Nothing typed but a search. Scores are + and −.
4. Every write says Saving… then Saved, or what to do next.
5. Nothing irreversible in one tap: arrivals undo, cards go through review.
6. No dead ends; every empty state names the next action.
7. Sunlight legibility: white, near-black, one gold accent, no glass or gradients.
8. Big numbers: scores and times 28px+ mono, names 17px, times never abbreviated.
9. Primary action in the thumb zone above the safe area.
10. No silent failure: an unsaved change stays visibly unsaved with Retry.

## Benchmark

What the products in this market actually document, and what TeeLine copied:

- **Golf Genius scoring stations**: a bounded task, station confirmation, one player at a time,
  review before save; a walking scorer is assigned a group; verification is a later step that locks
  the card.
- **BlueGolf TD App**: a player card carries the name, club, starting time and hole; one-tap check-in.
- **GolfStatus**: a searchable roster with one-tap check-in that syncs between stations, replacing a
  printed list and page-flipping.
- **GGID scoping**: access is scoped to the event, round or foursome, never a general admin console.

Sizes: 48dp Material and 44pt Apple minimum targets, 56px desk rows, WCAG AA 4.5:1 contrast.

## Data and permissions

- Staff roles are unchanged: `owner`, `organizer`, `desk`. `/staff` is a staff area in
  `src/lib/auth/routes.ts`, so the proxy guards it like the desk.
- Arrivals are per playing day on `registration_days` (`checked_in_at`, `checked_in_by`), written by
  `set_entry_day_check_in` in `supabase/migrations/20261106000000_staff_check_in.sql`. Undo clears
  both columns; the audit row keeps the history. **The migration is written and reviewed but has not
  been applied, and the function has never run against a database**, so the arrival write is designed
  and unproven. [Before the event](#before-the-event) holds the step that proves it, and that step has
  not been done yet.
- The group a phone is walking with is kept in this browser only (`src/lib/staff/claim.ts`), keyed by
  event and day. It is not a new table and it is not shared between phones.
- Cards are submitted through the desk's guarded scoring function with the reciprocal marker
  rotation. The staff app never approves, corrects, revokes, publishes or finalizes. A card already
  in is shown as "In, ask the desk".
- Walking up: an existing directory player or a new guest, days and session, written by the same
  registration function the desk uses. A player the rules cannot place stays for review.

## Offline

Reads come from the existing desk snapshot and say when it was saved. A write with no signal fails in
place: "Nothing was saved" with Retry, no queue. Scanning needs a signal because the photo is
uploaded and read server-side; the Scan tab says so and points at tap entry.

## The scanner

The Scan tab is the existing `ScorecardScan` flow: camera or photo, presign, upload to R2, read by
the inference service, then every hole shown with weak reads flagged before submit. It needs
`SCAN_INFERENCE_URL` and the R2 credentials on the deployment. Without them the photo is stored but
nothing is drafted, and the screen offers manual entry.

## Before the event

Everything in this section is **unverified**. The routing, the row filters and the score maths are
tested; the check-in SQL has only been read. The demo build keeps arrivals in memory, so a working
demo says nothing about the database. The step below has not been run against any database, local or
hosted. Do it before the first tee time, in this order.

### 1. Apply the check-in migration

The SQL below is a copy of `supabase/migrations/20261106000000_staff_check_in.sql` so this step is
paste-ready. That file is the source of truth: if the two ever differ, the file wins. Every statement
is safe to run twice (`add column if not exists`, `create or replace`, `create index if not exists`).

Open the Supabase dashboard for project `golf-management-system` (`egfwfyznbndunqfqzxjx`), then
**SQL Editor**, paste this, and run it:

```sql
alter table public.registration_days
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by uuid references auth.users (id) on delete set null;

comment on column public.registration_days.checked_in_at is
  'When the player was checked in for this playing day. Null means expected, not arrived.';
comment on column public.registration_days.checked_in_by is
  'The staff account that recorded the arrival. Cleared together with the time on undo.';

create index if not exists registration_days_checked_in
  on public.registration_days (tournament_day_id, checked_in_at);

create or replace function public.set_entry_day_check_in(
  p_registration uuid,
  p_day_number smallint,
  p_arrived boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_club uuid;
  v_day uuid;
  v_at timestamptz;
  v_actor uuid := (select auth.uid());
begin
  select r.club_id into v_club
  from public.registrations r
  where r.id = p_registration;

  if v_club is null then
    raise exception 'That registration was not found.';
  end if;

  if not public.has_club_role(v_club, array['owner', 'organizer', 'desk']) then
    raise exception 'Only club staff can record an arrival.';
  end if;

  select rd.id into v_day
  from public.registration_days rd
  join public.tournament_days d on d.id = rd.tournament_day_id
  where rd.registration_id = p_registration
    and rd.club_id = v_club
    and d.day_number = p_day_number
    and rd.selected;

  if v_day is null then
    raise exception 'That player is not entered for that day.';
  end if;

  update public.registration_days
  set checked_in_at = case when coalesce(p_arrived, false) then now() else null end,
      checked_in_by = case when coalesce(p_arrived, false) then v_actor else null end,
      updated_at = now()
  where id = v_day
  returning checked_in_at into v_at;

  insert into public.audit_log (club_id, actor_id, action, entity, entity_id, detail)
  values (
    v_club,
    v_actor,
    case when coalesce(p_arrived, false) then 'entry.check_in' else 'entry.check_in_undo' end,
    'registration_day',
    v_day::text,
    jsonb_build_object('registration', p_registration, 'day', p_day_number)
  );

  return jsonb_build_object('ok', true, 'checked_in_at', v_at);
end;
$$;

revoke all on function public.set_entry_day_check_in(uuid, smallint, boolean) from public;
revoke all on function public.set_entry_day_check_in(uuid, smallint, boolean) from anon;
grant execute on function public.set_entry_day_check_in(uuid, smallint, boolean) to authenticated;
```

Expected: "Success. No rows returned." A syntax or permission error here means stop and fix the
migration; the app cannot record an arrival without this function.

### 2. Prove the grants in the SQL editor

```sql
select p.proname,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'set_entry_day_check_in';
```

Expected: one row, `authenticated_can_execute = true` and `anon_can_execute = false`.

### 3. Prove a desk-role write, the audit row and undo

Find a staff account and a real registration day, then copy their ids into the next block.

```sql
select m.user_id, m.role
from public.club_members m
where m.role in ('owner', 'organizer', 'desk')
order by m.role, m.user_id
limit 5;

select r.id as registration_id, d.day_number, rd.id as registration_day_id
from public.registrations r
join public.tournament_days d
  on d.tournament_id = r.tournament_id and d.club_id = r.club_id
join public.registration_days rd
  on rd.registration_id = r.id and rd.tournament_day_id = d.id
where rd.selected
order by r.id, d.day_number
limit 5;
```

Then act as that desk user. The SQL editor is its own session, so the claims are set at session level
(the third argument `false`) and the role is switched explicitly; `auth.uid()` reads that claim, which
is how the function sees who is calling.

```sql
select set_config('request.jwt.claims',
  '{"sub":"<STAFF-USER-ID>","role":"authenticated"}', false);
set role authenticated;
select public.set_entry_day_check_in('<REGISTRATION-ID>'::uuid, <DAY-NUMBER>, true);
reset role;
select set_config('request.jwt.claims', '', false);
```

Expected: `{"ok": true, "checked_in_at": "<a timestamp>"}` and no error.

Now read the row and the audit trail:

```sql
select checked_in_at, checked_in_by
from public.registration_days
where registration_id = '<REGISTRATION-ID>'::uuid
  and tournament_day_id = (
    select d.id from public.tournament_days d
    where d.tournament_id = (select tournament_id from public.registrations
                             where id = '<REGISTRATION-ID>'::uuid)
      and d.day_number = <DAY-NUMBER>
  );

select action, entity, entity_id, actor_id, detail, created_at
from public.audit_log
where entity = 'registration_day'
order by id desc
limit 3;
```

Expected: `checked_in_at` set, `checked_in_by` equal to the staff user id, and the newest audit row
`entry.check_in` with `actor_id` set to that same user. A null `checked_in_by` with a non-null time, or
a missing audit row, is a failure even though the screen would look right.

Undo by running the same block with `false` as the third argument. Expected:
`{"ok": true, "checked_in_at": null}`, both columns back to null, and the newest audit row
`entry.check_in_undo`.

### 4. Prove the refusals

Anonymous callers must not reach the function at all:

```sql
set role anon;
select public.set_entry_day_check_in('<REGISTRATION-ID>'::uuid, <DAY-NUMBER>, true);
reset role;
```

Expected: `permission denied for function set_entry_day_check_in` (SQLSTATE 42501). If it instead
returns `Only club staff can record an arrival`, the revoke is not doing its job and the grants need
fixing before the event.

A caller who is signed in but is not staff of the club must be refused by the function itself. Run the
step 3 block with the `sub` of an account that has no `club_members` row for this club. Expected:
`Only club staff can record an arrival.`

A registration or day that does not exist must fail loudly, never quietly succeed:

```sql
select set_config('request.jwt.claims',
  '{"sub":"<STAFF-USER-ID>","role":"authenticated"}', false);
set role authenticated;
select public.set_entry_day_check_in(gen_random_uuid(), <DAY-NUMBER>, true);
reset role;
select set_config('request.jwt.claims', '', false);
```

Expected: `That registration was not found.` With the real registration id and a day number the event
does not have (for example `99`), expected: `That player is not entered for that day.`

### 5. Prove the app path, including the read-back

1. Sign in as a `desk` account and open `/staff/players`.
2. Tap **Arrived** on one player. Expected: the row shows the arrival with its time, and the count on
   `/staff` goes up by one.
3. Reload the page. Expected: the player is still shown as arrived. This is the loader's read-back; if
   the row comes back as arrived after a reload, the stamp was written and read.
4. Tap undo and reload again. Expected: back to expected, with the time gone.
5. Before the migration is applied, `/staff` must still load with everyone shown as expected and no
   error banner. That is the absent-column path the loader tolerates; it has not been exercised against
   a real database, only read in the code. Tapping **Arrived** in that state must show a failure, never
   a silent success.

### 6. The rest of the on-site checks

1. Walk one group's sheet on a phone and submit the four cards; confirm the desk sees them.
2. Scan one real IGCC card and check the flagged holes.
3. Sign in with a `desk` account: it must not see "Full desk", must not move players, and must still
   check in and score.
