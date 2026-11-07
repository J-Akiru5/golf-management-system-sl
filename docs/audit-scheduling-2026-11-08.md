# Scheduling system audit (read-only)

Repository: `S:\Dev\golf-management-system-sl\golf-management-cleanup-912fcd`
Branch: `claude/golf-management-cleanup-912fcd`
HEAD: `20b3c83` (working tree clean at the start)
Date: 8 November 2026

## Method and limits

Read `AGENTS.md`, `docs/PLAN.md` sections 3 and 7, the "Playing days and sessions" paragraph and the start-times row in `docs/spec/IGCC_Tournament_Desk.md`, `docs/draft-24th-bamboo-tee.md`, every file in scope, their tests, and the migrations that define `groups`, `group_members`, `competition_rounds`, `save_draw`, `publish_pairings` and `player_portal_entries`.

Nothing in the repository was edited, created, deleted or committed. No migration was applied, no build or dev server was run, and the test suite was not executed. Every finding below was checked against the cited lines in this checkout; four parallel read-only sub-audits were used to widen coverage, and their claims were re-read here before being kept. Line numbers are from this checkout.

Ignored by request: the shotgun "wave" naming and the removal work another agent is doing. This report talks about sessions, days, batches and times only, and uses the code identifiers `wave`, `wavePosition` and `waveGapMinutes` only where quoting the code needs them.

---

## Headline

Gap 7 is **not** "the desk does not pass a day". Since commit `b1f026e` the desk does pass a round id (`desk-store.tsx:428`), and `save_draw` accepts it (`draw-sync.ts:62`). The real blocker is one level lower: **nothing creates a `competition_rounds` row for playing days 2..n**, so the loader can only ever find day 1, the day selector silently snaps back to day 1, and every save lands on day 1. On top of that, the desk's "make the draw" still routes the whole event in one pass with no day and no sessions, so even a correct per-day save would store the wrong field. These two together are why the 24th Bamboo Tee is a document and not a saved board.

`docs/PLAN.md:337-342` and `docs/spec/IGCC_Tournament_Desk.md:54` still say "the desk does not pass a day yet". That sentence is stale; the outcome it describes is still true for a different reason.

---

## A. Findings that block an event

### A1. No `competition_rounds` row exists for playing days 2..n, so only day 1 can ever be saved

- **Severity:** blocks an event
- **File:line:** `supabase/migrations/20261035000000_scoring_schema.sql:373-378` (the only backfill, one day-1 round per tournament), `:533-561` (`set_group_round` creates day 1 only), `:583-585` (trigger); `src/lib/data/supabase/load-desk-state.ts:296-306`; `src/lib/store/desk-store.tsx:293-305`, `:387-391`
- **Scenario:** a four-day event has `tournament_days` 1..4, but `competition_rounds` has only day 1. `loadDeskState(dayNumber = 3)` does `rows.find(row => row.day_number === 3) ?? rows[0]` (`load-desk-state.ts:302`), finds nothing and uses day 1; it returns `roundDays = 1`, and `desk-store.tsx:303-305` writes `drawDay` back to 1. Selecting "Day 3" on the Draw screen therefore reloads and snaps back to Day 1 (`draw/page.tsx:387-403`), and "Print all days" (`print/page.tsx:179-231`) can build only the days that have a round, which is one. Every `save_draw` call names day 1's round.
- **Smallest fix:** add a migration (or an RPC) that creates one `competition_rounds` row per `tournament_days` row where `is_playing_day` (tournament, day_number, play_date, hole_count), with a backfill for existing events and a trigger on `tournament_days` for the future. In `loadDeskState`, return an explicit error when the requested day has no round instead of silently using `rows[0]`.
- **Test that would catch it:** a new `src/lib/data/supabase/load-desk-state.test.ts` with rounds for days 1..3, case "returns the requested day's round and groups"; plus a migration check that every playing day has a round.

### A2. The desk draws the whole event in one pass, with no day and no sessions

- **Severity:** blocks an event (wrong board, wrong printed sheet)
- **File:line:** `src/lib/store/state.ts:274-312` (`routingInputFor` takes every entry, no `selectedDays` filter, no `daySessions`), `:647-681` (`generate` calls `route(input, { lockedGroups })` with no `sessions` and no `splitClassesAcrossWaves`); `src/app/(desk)/draw/page.tsx:242-244`; the correct per-day call is shown by `scripts/generate-draft-draw.ts:86-114`
- **Scenario:** 283 players registered across four days. "Make the draw" routes all 283 in flight order from `config.firstTeeTime` and saves all of them into the selected day's round, leaving the other days with no board. Day 1's board then holds players who registered only for days 2..4. The Draw screen hides them for display (`draw/page.tsx:79-93`), but the Print center prints every group on the loaded board with every player (`print/page.tsx:128-168`), so Day 1's start sheet lists players who are not playing Day 1. A class can also be split with day-3-only players inside a day-1 group, and no player gets an afternoon time because no `sessions` input is supplied.
- **Also:** `route` treats a player missing from `byPlayer` as "session not recorded", not "not playing this day" (`index.ts:272-294`). If the store ever passes the whole field with a per-day session map, every player who chose another day is drawn into this day's morning field with a generic warning. The engine needs `byPlayer.has(id)` as the day-membership test, and an explicit `null` value should stay the "session not recorded, drawn AM" case.
- **Smallest fix:** build the routing input from the selected day's entries only (filter on `selectedDays`, and pass each player's `daySessions[day]`), call `route` with `sessions: { byPlayer, starts: { AM: day.startTime ?? firstTeeTime, PM: <stored PM start> }, dayNumber }` and `{ splitClassesAcrossWaves: true }` if the club's fill-as-you-go is wanted. The `generate` action needs the day number, which currently lives in the store, not in `DeskState`.
- **Test that would catch it:** a `state.test.ts` case where entries select days 1 and 3 and `routingInputFor` for day 1 contains only day-1 players; a `sessions.test.ts` case distinguishing "absent from the map" from an explicit `null`; a `route` test asserting the day's labels and times.

### A3. Publishing one day replaces the event-wide publish snapshot

- **Severity:** blocks an event (multi-day public pairings and player portal)
- **File:line:** `src/lib/store/state.ts:759-768` (`buildPublished(board.draw, ...)`); `src/lib/store/state.ts:45-64` (`PublishedGroup` has no day); `src/lib/data/supabase/draw-sync.ts:78-101`; `supabase/migrations/20261022000000_versioned_publish.sql:175-196` (one snapshot, one `groups` array); `src/lib/data/public.ts:63-85`; portal start at `supabase/migrations/20261104000200_portal_group_by_player_id.sql:41-55`
- **Scenario:** Day 1 is published, then the organizer switches to Day 3 and publishes. `publish_pairings` overwrites `tournaments.published_snapshot` with Day 3's groups only. `/pairings` has no day selector (`PairingsView.tsx:35-90`), so it now lists Day 3 only while the header still shows the whole date range (`pairings/page.tsx:80-97`). A Day-1 player sees "not listed" on `/my` because the portal looks up one start in the one snapshot (`limit 1`, no day). The same happens in reverse.
- **Smallest fix:** carry `dayNumber`/`playDate` on each published group, and publish all playing days together (fetch every round's groups at publish time) or store one snapshot per day and read them together. Key and group the public list by day, not by group number.
- **Test that would catch it:** a publish test with two rounds asserting the snapshot holds both days; a portal test asserting one start per day; a `mappers.test.ts` case that two days' group number 1 do not merge.

### A4. "Take the draw's times" is day-blind and writes a batch label the database refuses

- **Severity:** blocks an event (wrong holes, or the whole batch fails)
- **File:line:** `src/app/(desk)/tee-times/page.tsx:37-43` (the screen's `selectedDay` is independent of the stored `drawDay`), `:67-69`, `:96`, `:178-249`; `src/lib/draw/tee-times.ts:18-31`; `supabase/migrations/20261104001100_registration_day_wave.sql:14-21`, `:58-63`
- **Scenario:** the loaded board is Day 1 (the only board that can load, per A1), and the operator selects the Day 3 tab on the Tee times screen. Player P is in Day 1 group 1 (hole 1) and Day 3 group 9 (hole 10). `placementsFromDraw` keeps the first group (`tee-times.ts:22`), so "Take the draw's times" writes Day 3 as `{ startHole: 1, wave: "D1-AM-A" }`. In connected mode `assign_registration_day_tee` refuses the label because `registration_days.wave` must match `^[A-Z]$` (`20261104001100:20-21`), so every row fails with "A wave is one letter"; in demo mode the adapter stores it unchanged (`adapters.ts:537-545`), and every later save of that row is refused by `waveProblem` (`page.tsx:551-553`). The button also counts placements that are not this day's (`page.tsx:96`).
- **Smallest fix:** pass the board's day into `placementsFromDraw` and ignore groups whose label names another day; store only the last segment of the label as the batch letter; take the session from the label when `entry.daySessions` has no value for that day.
- **Test that would catch it:** a new case in `src/lib/draw/tee-times.test.ts` ("a Day-3 board gives no placement to Day 1"), plus a page-level test that the Day 3 write uses the Day 3 hole.

---

## B. Findings that produce wrong output

### B1. The second batch is timed with the event's five-hour gap, not the batch interval

- **Severity:** wrong output
- **File:line:** `src/app/(desk)/tee-times/page.tsx:193-201` (passes `config.waveGapMinutes` as `intervalMinutes`); `src/lib/data/tee-time.ts:119-124`; `src/lib/demo/data.ts:85-92` (`waveGapMinutes: 300`); `docs/PLAN.md:96` (default 300); the confirmed practice is a nominal 9 minutes (`docs/spec/IGCC_Tournament_Desk.md:52`)
- **Scenario:** a new or demo event uses the default 300. An AM player in the second batch gets `06:30 + 300 = 11:30`. On the last day the afternoon also starts at 11:30, so an AM batch and the PM session are printed at the same minute. The draw itself uses the same field (`index.ts:400-409`), so the board and the screen agree with each other and both disagree with the club's nominal 9 minutes. There is no separate batch-interval setting.
- **Smallest fix:** give the batch interval its own setting (or use `config.intervalMinutes`) and leave the five-hour gap out of tee-time arithmetic; validate that a batch starts before the next session and warn otherwise.
- **Test that would catch it:** `src/lib/data/tee-time.test.ts`, case "a 300-minute gap does not put a morning batch after the afternoon start"; a `sessions.test.ts` case asserting a morning batch stays AM.

### B2. The final-day afternoon is chosen by array position, and the stored afternoon start is unused

- **Severity:** wrong output
- **File:line:** `src/lib/data/sessions.ts:10-12`, `:28-34`; `supabase/migrations/20261106000100_draw_by_playing_day.sql:12-13` (adds `tournaments.pm_first_tee_time`, never read anywhere in `src`); `docs/spec/IGCC_Tournament_Desk.md:93` (Sunday 11:30, Thursday to Saturday 12:30); `docs/draft-24th-bamboo-tee.md:214` (the draft uses 12:30 on the final day, 15 Nov)
- **Scenario:** a one-day Saturday event gets 11:30 for its afternoon because it is the last day; a four-day event ending on Saturday gets 11:30 on Saturday. The confirmed rule is weekday-based. The 24th draft uses 12:30 on its final Sunday, the code says 11:30. There is no UI field for an afternoon start, so the desk cannot correct it.
- **Smallest fix:** choose the afternoon start from the day's weekday in Asia/Manila (or from a stored per-day time) instead of `dayIndex === dayCount - 1`; read `tournaments.pm_first_tee_time` (and add a per-day field if the club wants one).
- **Test that would catch it:** `daySessions` cases for a single Saturday day (12:30) and a Sunday (11:30).

### B3. "Overwrite all" keeps a confirmation after the time changes

- **Severity:** wrong output (a time nobody reviewed is published as confirmed)
- **File:line:** `src/app/(desk)/tee-times/page.tsx:141-148` (line 147), comment at `:111-117`
- **Scenario:** P is confirmed at 06:30 on hole 1. The organizer types 12:30 and clicks "Overwrite all". The write is `{ teeTime: "12:30", startHole: 1, wave: <old>, confirmed: true }` because `Boolean(existing?.confirmed && existing.startHole)` stays true. The confirmed flag survives a time the desk never looked at, and the public page shows 12:30 as confirmed.
- **Smallest fix:** clear the confirmation when the time differs from the saved one: `confirmed: existing?.teeTime === time ? Boolean(existing.confirmed && existing.startHole) : false`.
- **Test that would catch it:** a pure `batchAssignment(existing, time)` helper tested in `tee-time.test.ts` ("a changed time drops the confirmation").

### B4. `sessionForTime` ignores the day's own opening time

- **Severity:** wrong output (Session column and AM/PM headcount)
- **File:line:** `src/lib/data/sessions.ts:54-72` (uses `daySessions` constants); consumers `src/app/(desk)/tee-times/page.tsx:677` and `src/lib/print/day-counts.ts:97-100`
- **Scenario:** the day's start is editable and stored (`tee-times/page.tsx:328-349`), and `sessionWaveTime` honours it (`tee-time.ts:116`), but `sessionForTime` does not. With a 10:00 opening, PM 12:30, and an AM player at 10:00, the gaps are 210 and 150, so the row is labelled **PM**. On the final day the midpoint is 09:00, so an AM time of 09:15 is labelled PM. `day-counts` counts the same wrong session.
- **Smallest fix:** pass the day's AM start into `sessionForTime` (and use it for the AM reference gap) instead of the constant.
- **Test that would catch it:** `sessions.test.ts`, cases "a 10:00 opening makes 10:00 the morning" and "the final-day boundary follows the real AM start".

### B5. Confirmed provisional players are always drawn in the morning

- **Severity:** wrong output
- **File:line:** `src/lib/routing/index.ts:335-367` (`looseSession = sessionOrder[0] ?? null`, no per-player session lookup)
- **Scenario:** a confirmed provisional player (missing birthdate or gender) selected the afternoon. `route` with `sessions` puts the whole Unclassified block at the AM boundary and slots it from the AM plan, so the player goes off at 06:30. The "no session" warning does not fire for them because their session is recorded.
- **Smallest fix:** group provisional players by their session and place each block at that session's boundary, using `sessionOf(p.id)` the same way as classified players.
- **Test that would catch it:** `provisional.test.ts` with `sessions` and a PM provisional, asserting the group's label and time.

### B6. A failed save leaves the unsaved board on screen, and it can then be published

- **Severity:** wrong output (players can see a board the database never stored)
- **File:line:** `src/lib/store/desk-store.tsx:576-611` (the board is applied before the queue runs), `:415-431` (a failed save only reports the error); `src/lib/data/supabase/adapters.ts:71`, `:121-127` (no rollback)
- **Scenario:** generate, then the save fails (a constraint error, or a revision conflict). The reducer already showed the new board; the queue shows "Not saved" but does not restore the old one. A publish from that screen builds the snapshot from the unsaved board. If the save failed for a reason other than the revision (so `revisionStore` is unchanged), the publish passes the revision check and stores the unsaved board.
- **Smallest fix:** keep the pre-action board and restore it when the queued save fails, and disable publish while the last save failed.
- **Test that would catch it:** a desk-store test where a rejected save restores the prior board and publish stays disabled.

### B7. A queued save reads the round when it runs, not when it was planned

- **Severity:** wrong output (timing dependent, silent)
- **File:line:** `src/lib/store/desk-store.tsx:415-431` (round read at `:428`), `src/lib/store/draw-persist.ts:10-13`, `:58`
- **Scenario:** the organizer clicks Generate on Day 1, then immediately switches the day selector to Day 3. The save job was planned with Day 1's draw, but `runDrawJob` reads `roundsRef.current[event]` at execution. If the Day 3 reload has landed, Day 1's board is written into Day 3's round and Day 3's old groups are deleted.
- **Smallest fix:** capture `roundId` in the save job when `planDrawJobs` builds it and use `job.roundId` at execution.
- **Test that would catch it:** `draw-persist.test.ts`, "a save keeps the round it was planned with when the day changes before the queue drains".

### B8. A player who did not select the day is stored on that day's board

- **Severity:** wrong output
- **File:line:** `src/lib/store/state.ts:274-312`, `:647-681`; `src/lib/store/draw-persist.ts:58`; `supabase/migrations/20261106000200_group_members_per_playing_day.sql:131-141`
- **Scenario:** the Day-1-only player is included in the generate input (A2), and `save_draw` checks only that the player is registered for the tournament, never that they selected this day. The player is written with the day's `round_id`. The Draw screen's day filter is display-only.
- **Smallest fix:** filter the saved board to the day before saving (drop player ids whose non-empty `selectedDays` excludes the day, then drop empty groups). A SQL check against `registration_days` is stronger but needs care because a missing row currently means "plays all days".
- **Test that would catch it:** `draw-persist.test.ts`, "a Day-3 save excludes a player selected for Day 1 only".

### B9. Generating another day takes the published list down

- **Severity:** wrong output
- **File:line:** `src/lib/store/state.ts:674-681` (`published: a.preserveLocks ? board.published : null`); `src/lib/store/draw-persist.ts:62-66`; `src/lib/store/desk-store.tsx:576-611`
- **Scenario:** Day 1 is published. The organizer selects Day 3 and clicks "Start over". The reducer clears the event's published snapshot and the queue unpublishes the whole event, so `/pairings` goes to "not out yet" even though Day 1's board and publish were untouched.
- **Smallest fix:** scope the takedown to the day being replaced, or require an explicit unpublish when generating a different day.
- **Test that would catch it:** `draw-persist.test.ts`, "a generate on another day does not queue an unpublish for the published day".

### B10. The player portal has one start per entry, with no day

- **Severity:** wrong output (part of A3, visible to players)
- **File:line:** `supabase/migrations/20261104000200_portal_group_by_player_id.sql:41-55` (`limit 1`, no day); `src/lib/player/portal.ts:74`, `:255-259`, `:328-341`
- **Scenario:** a player entered for days 1 and 3 gets one `start` object. Depending on which group appears first in the snapshot it can be the wrong day, and if the snapshot holds only another day the player sees "not listed" despite having a start.
- **Smallest fix:** return `starts: [{ dayNumber, hole, wave, time }]` and render one line per playing day.
- **Test that would catch it:** `portal.test.ts` with two starts in the payload.

### B11. The desk moves a whole class to the next batch, but the approved board fills as it goes

- **Severity:** wrong output (the saved board does not match the confirmed plan)
- **File:line:** `src/lib/routing/index.ts:408`, `:422` (default `false`); `src/lib/store/state.ts:665` (never sets it); the draft and its test use `true`: `scripts/generate-draft-draw.ts:104`, `src/lib/routing/sessions.test.ts:132-155`
- **Scenario:** 52 players in Class A (13 groups) and 40 in Class B (10 groups) on 18 holes. With the default the engine moves Class B whole into the next batch: the first batch holds 13 groups and leaves 5 holes empty. The approved draft expects 18 groups in the first batch and 5 in the second. The desk's Generate therefore produces a different board from the one the organizers approved.
- **Smallest fix:** pass `splitClassesAcrossWaves: true` from the desk's `generate` (or default the option to `true`), and reconcile the doc comment at `index.ts:79-83`.
- **Test that would catch it:** `sessions.test.ts`, "the default draw fills the first batch before moving a class" expecting `18` and `5` for the 52/40 field.

---

## C. Edge cases

### C1. No capacity check on the Tee times screen, and the settings helper hides a third batch

- **Severity:** edge case
- **File:line:** `src/app/(desk)/tee-times/page.tsx:100-104` (always two batches), `:125-127`; `src/lib/data/tee-time.ts:70-75` (`waveCountForField` clamps to 2); only other caller `src/app/(desk)/setup/page.tsx:414`
- **Scenario:** 160 players on one day with 18 holes and groups of 4 need 3 batches (72 per batch). The page offers only A and B and says nothing; `waveCountForField(160, 18, 4)` returns 2, and `route` emits batch C (`schedule.ts:122-138`). Players beyond the first 144 are sent off on holes already used, with no warning.
- **Smallest fix:** compute the real batch count, show a blocking notice when it exceeds the club's limit, and do not clamp the maths helper to the UI limit.
- **Test that would catch it:** `tee-time.test.ts`, "160 players on 18 holes need three batches".

### C2. `validateDraw` has no day, so a day-filtered board can wrongly block publishing

- **Severity:** edge case (will bite as soon as A2 is fixed)
- **File:line:** `src/lib/draw/validate.ts:101-110`; caller `src/app/(desk)/draw/page.tsx:114-127`; gate `src/components/draw/PublishDialog.tsx:82`
- **Scenario:** a Day-1 board that contains only Day-1 players. Player Q selected only Day 3, so Q is missing from the board and `validateDraw` emits a blocking "is ready to play but has no group", which disables publishing. Today the whole-event generate masks this; the day-filtered board makes it fire.
- **Smallest fix:** pass the day's registrations to `validateDraw`, or give it a `dayNumber` and skip the unplaced check for players who did not select that day.
- **Test that would catch it:** `validate.test.ts`, "a player who did not select this day is not unplaced".

### C3. The printed start sheet sorts day labels as strings

- **Severity:** edge case
- **File:line:** `src/lib/print/start-sheet.ts:28-34`
- **Scenario:** groups with day labels `D1-AM-A`, `D2-AM-A`, `D10-AM-A` sort as `D1, D10, D2`. The day order is wrong on paper. Session order is correct (`D1-AM-B` before `D1-PM-A`).
- **Smallest fix:** parse the day number, then the session, then the batch letter, then the hole and time.
- **Test that would catch it:** `start-sheet.test.ts` with the three labels above.

### C4. The counts sheet reads a time before the draw's own session label

- **Severity:** edge case
- **File:line:** `src/lib/print/day-counts.ts:94-102`, documented order at `:8-11`
- **Scenario:** a group labelled for the afternoon with a 06:30 time (what B1 and A4 can produce) is classified by the time first, so it is counted AM even though the draw says PM.
- **Smallest fix:** try `sessionOfWave(draw.wave)` before falling back to the time, keeping the desk's own `dayTee` first.
- **Test that would catch it:** `day-counts.test.ts`, "the draw's PM label beats a 06:30 time".

### C5. The Tee times screen counts all days, the Print center counts playing days

- **Severity:** edge case
- **File:line:** `src/app/(desk)/tee-times/page.tsx:43-51`, `:198` (all `days`) versus `src/app/(desk)/print/page.tsx:67`, `:78-96` (`playingDays`)
- **Scenario:** an event with a non-playing day after the last playing day. Day 2 is index 1 of 3 on Tee times (PM 12:30) but the last of 2 on Print (PM 11:30). The two screens disagree about the same day's afternoon.
- **Smallest fix:** use the same `playingDays` list everywhere, or derive the final day from the latest playing date.
- **Test that would catch it:** a shared helper test with a trailing non-playing day.

### C6. Day numbers are assumed to be dense and ordered

- **Severity:** edge case
- **File:line:** `src/lib/data/dates.ts:34-49` (returns stored days verbatim, numbers the fallback by index), `:61-64`; `src/lib/data/day-selection.ts:11-25` (`day > dayCount` uses a length as a day number); `src/lib/data/supabase/load-desk-state.ts:205-218` (drops non-playing days without renumbering)
- **Scenario:** the loaded day list is 1, 2, 4 because a middle day is not a playing day, so `days.length` is 3. A player selects day 4 with PM; `pruneDaySessions(selected, sessions, 3)` drops day 4, and the editor closes as if saved. In the other direction, an unsorted `dates` array makes the 11:30 afternoon apply to the wrong date.
- **Smallest fix:** pass the actual valid day numbers to `pruneDaySessions` (or test membership, not a maximum), sort stored days by `dayNumber`/date, de-duplicate, and derive "last day" from the latest date.
- **Test that would catch it:** `day-selection.test.ts` with days `[1,2,4]`; `dates.test.ts` with an unsorted date list.

### C7. Calendar: exact-slot comparison is raw string equality, and the edit preview only knows day 1's time

- **Severity:** edge case
- **File:line:** `src/lib/calendar/calendar.ts:58-68`; `src/app/(desk)/calendar/page.tsx:183-193`, `:198-216`
- **Scenario:** a `CalendarEvent` with `"06:30"` and another with `"06:30:00"` on the same course and date is reported as `same-day`, not `exact`, so the save gate allows it. Separately, the edit sheet gives only index 0 a start time, so a conflict on day 2 of an existing event is downgraded to a warning and allowed through; the database trigger then refuses it with a late error (or the double booking is saved where the trigger is absent).
- **Smallest fix:** normalise both times to `HH:MM` before comparing, and map each draft date to that existing day's start time instead of only the first.
- **Test that would catch it:** `calendar.test.ts`, "06:30 and 06:30:00 are the same slot"; a preview test with a conflicting second day.

### C8. Calendar: a date in `dates` but missing from `days` is not checked, and non-playing days are shown

- **Severity:** edge case
- **File:line:** `src/lib/calendar/calendar.ts:30-40` (prefers `days`, maps all of them), `:53-57`, `:75-78`
- **Scenario:** event A has dates 12–13 Nov but only a day row for the 12th. Event B has a day on the 13th. No conflict is reported for the 13th, the month grid does not show A on the 13th, while the list and the `.ics` export still say 12–13 Nov. A day with `isPlayingDay: false` is shown and can raise a conflict on a date the club is not playing, while the public programme and print filter it out.
- **Smallest fix:** build calendar days from the union of `dates` and playing `days`, and filter `isPlayingDay` in `calendarEvent`.
- **Test that would catch it:** `calendar.test.ts`, "flags a date in dates but missing from days" and "ignores a non-playing day".

### C9. An unnamed save deletes every day's board

- **Severity:** edge case (hardening)
- **File:line:** `supabase/migrations/20261106000100_draw_by_playing_day.sql:75-87`; `20261106000200_group_members_per_playing_day.sql:100-112`; `src/lib/store/desk-store.tsx:428` (`?? null`)
- **Scenario:** `p_round` null deletes all groups for the event and inserts the supplied board; the `set_group_round` trigger then puts it all on day 1. It is reachable when the event has no round mapping yet (a newly created event before a reload) and from the parked legacy writer (`persist.ts:224-243`). One null save destroys every saved day.
- **Smallest fix:** refuse a null `p_round` when the event already has more than one round, and make the connected desk fail loudly rather than send null. The parked writer should be brought in line or removed.
- **Test that would catch it:** a SQL test that a null round on a two-round event raises a clear error; a desk-store test that no null save is sent.

### C10. `sync_notifications` treats a player placed on one day as placed on every day

- **Severity:** edge case
- **File:line:** `supabase/migrations/20261026000000_notifications.sql:95-111` (`not exists` has no round filter)
- **Scenario:** a player is on Day 1's board only and missing from Day 3's. The "ready players have no group" alert never fires for Day 3, because one `group_members` row satisfies the check for the whole event.
- **Smallest fix:** scope the `not exists` to the round being checked (join on `round_id`).
- **Test that would catch it:** a SQL test with the player on one round only.

### C11. Switching event leaves the previous event's day selected

- **Severity:** edge case
- **File:line:** `src/lib/store/desk-store.tsx:387-391`, `:474-490`; `src/lib/store/state.ts:420-421`
- **Scenario:** on Event A Day 3, switch to Event B (which also has a Day 3). `selectTournament` does not reload, so `drawDay` is still 3 while `boards[B]` is B's day-1 board; regenerating writes B's board to B's day-1 round while the screen claims Day 3.
- **Smallest fix:** on `selectTournament`, reset `drawDay` to the new event's first day and reload.
- **Test that would catch it:** a desk-store test that switching events resets the day.

### C12. The selected day is lost on reload

- **Severity:** edge case
- **File:line:** `src/lib/store/desk-store.tsx:225-226`, `:293-305`; `src/lib/offline/cache.ts:25-31`
- **Scenario:** the organizer selects Day 3 and reloads. `drawDay` starts null, the loader picks day 1, and the screen silently shows Day 1. The offline snapshot stores no round or day.
- **Smallest fix:** persist the selected day (URL or session storage) and pass it to `loadDeskState`.
- **Test that would catch it:** a loader test that a remount requests the saved day.

### C13. A locked group from another day duplicates a hole and time on the new day's board

- **Severity:** edge case (becomes reachable when a day-filtered generate is combined with a cached board)
- **File:line:** `src/lib/routing/index.ts:231-263`, `:305`, `:370-376`, `:448-465`
- **Scenario:** a lock labelled `D3-AM-A` on hole 3 is passed to a day-4 draw. Its players are added to `lockedIds` and skipped by the day-4 field, and the D3 group is emitted unchanged on the day-4 board. `occupied` holds `D3-AM-A:3`, which cannot match the planner's `D4-AM-A:3`, so a new day-4 group is placed on hole 3 at 06:30. The day's numbering also jumps (1..4 then 17..28).
- **Smallest fix:** keep a lock only when its label prefix matches the day being drawn and its members' session; otherwise release it with a warning and do not reserve its players. Build `occupied` from the label the planner will emit, and renumber the resulting day 1..N.
- **Test that would catch it:** `locks.test.ts` or `sessions.test.ts`, "releases a lock from another day and does not duplicate its hole and time".

### C14. A two-tee start ignores the session start times

- **Severity:** edge case (`sessions` is documented for shotguns, but nothing refuses the combination)
- **File:line:** `src/lib/routing/index.ts:427-429`
- **Scenario:** `startFormat: "two_tee"`, eight AM and eight PM players, `starts: { AM: "06:30", PM: "12:30" }`. `placed` is AM then PM, but `planTwoTeeFrom` runs once from `config.firstTeeTime`, so the PM groups get 06:30 and later. The `wave` field is null, so the board cannot show AM/PM.
- **Smallest fix:** run the two-tee planner once per session with `starts[session]`, or reject `sessions` with `two_tee` and warn.
- **Test that would catch it:** `sessions.test.ts`, "two-tee with sessions starts the afternoon at 12:30".

### C15. `place()` loops forever when `holes` is not positive

- **Severity:** edge case (latent; the database allows holes 9, 18, 27 or 36 only, `20261017000000_init.sql:42`)
- **File:line:** `src/lib/routing/schedule.ts:122-139`
- **Scenario:** `planShotgunFrom([{ flightName: "A", groups: 1 }], 0, "06:30", 9)`. `orderFor` returns an empty list, `place` increments the batch index and repeats forever, so the browser tab hangs. A locked `startHole` outside the hole count can cause the same with a small hole count.
- **Smallest fix:** throw when `holes < 1` (and when a two-tee interval is not positive), and bound the two-tee loop to the number of distinct slots.
- **Test that would catch it:** `holes.test.ts`, "throws when holes is below one".

### C16. `groupSizes` with a non-positive group size crashes or drops the field

- **Severity:** edge case (latent; the database allows group_size 2..5, `20261017000000_init.sql:114`)
- **File:line:** `src/lib/routing/groups.ts:5-11`
- **Scenario:** `groupSizes(8, 0)` computes `count = Infinity` and `Array.from({ length: Infinity })` throws `RangeError`. `groupSizes(8, -1)` returns `[]`, so eight ready players disappear from the board without a warning.
- **Smallest fix:** validate that `maxSize` is an integer of at least 1 and throw a clear error.
- **Test that would catch it:** `routing.test.ts` "group sizes", with 0 and -1.

### C17. `addMinutes` silently repairs invalid times

- **Severity:** edge case (the HH:MM parsing slip the brief asks about)
- **File:line:** `src/lib/routing/schedule.ts:2-10`
- **Scenario:** `"24:00"` becomes `"00:00"`, `"06:60"` becomes `"07:00"`, `"6:3"` becomes `"06:03"`, `"-1:30"` becomes `"23:30"`, and a NaN minute count becomes `"NaN:NaN"`. Only a missing or NaN hour/minute throws. `sessions.ts:37-47` already rejects hours above 23 and minutes above 59, so the two parsers disagree.
- **Smallest fix:** validate `h` in 0..23 and `m` in 0..59, and require a finite minute count; throw otherwise.
- **Test that would catch it:** `routing.test.ts`, "adds minutes and wraps", with `"24:00"`, `"06:60"` and `"6:3"`.

### C18. Filling a batch as it goes can emit a false "plays across batches" warning

- **Severity:** edge case (only when the fill mode is enabled, which A2/B11 recommend)
- **File:line:** `src/lib/routing/schedule.ts:141-157`
- **Scenario:** the first class fills the first batch exactly (18 groups). The next class has four groups and starts the second batch. `startWave` is 0, all four are placed in batch 1, and the check `wave > startWave` is true, so the board warns that the class plays across both batches even though it does not.
- **Smallest fix:** record the batch of the first placed slot after `place()` advances, and warn only when the class's slots actually span more than one batch.
- **Test that would catch it:** `sessions.test.ts`, "a class that begins in an empty batch is not reported across batches".

---

## A player registered for two days: where they can land on the wrong day or twice

- **Saved on a day they did not choose:** A2 and B8. The generate input contains every entry, and `save_draw` never checks `registration_days`. A Day-1-only player can be stored on Day 3's board.
- **Written with the other day's hole and batch:** A4. The Tee times screen keeps the first placement per player from whatever board is loaded, then writes it to the selected day.
- **Printed on the wrong day:** A2. The Print center prints every player on the loaded board, and the loaded board can be the whole event.
- **Published or shown once, with no day:** A3 and B10. The snapshot has no day, the public list is flat, and the portal returns one start.
- **Counted twice?** No in the counts sheet: `day-counts` keys a placement by `${day}:${player}` and filters rows by `selectedDays` (`day-counts.ts:126-139`, `:156-171`), so a two-day player appears once in each day's block and not twice in one. The session attributed to them can still be wrong (B4, C4).
- **Database shape:** `group_members` unique on `(registration_id, round_id)` (`20261106000200:25-26`) is the correct shape for one group per player per day. It only works once each playing day has a round (A1).
- **Silent first-group win:** `placementsFromDraw` keeps the first group when a player appears twice (`tee-times.ts:22`). `validateDraw` reports a duplicate as blocking if both groups are on the same board (`validate.ts:59-75`), so the draw itself does not hide it; the tee-time copy does.

---

## D. Polish and documentation

### D1. A raw `HH:MM:SS` group time reaches the workbook

- **Severity:** polish
- **File:line:** `src/app/(desk)/print/page.tsx:222` (`time: row.tee_time`), consumed at `src/lib/print/day-counts.ts:239`
- **Scenario:** "Load every day" reads `groups.tee_time` untouched, so the "By group" sheet exports `06:30:00` while "By session" exports `06:30`. Every parser tolerates it; the display does not.
- **Smallest fix:** `row.tee_time.slice(0, 5)` where the print board is built.
- **Test that would catch it:** `day-counts.test.ts`, "a time with seconds renders as HH:MM".

### D2. The plan and spec still describe the old gap

- **Severity:** polish
- **File:line:** `docs/PLAN.md:337-342`; `docs/spec/IGCC_Tournament_Desk.md:54`
- **Scenario:** both say the desk does not pass a playing day to `save_draw`. It does since `b1f026e`; the blocker is the missing rounds (A1) plus the day-blind generate (A2). The stale text sends the next agent after the wrong fix.
- **Smallest fix:** rewrite the gap with the two real blockers and the steps below.

### D3. The parked legacy writer still saves without a round

- **Severity:** polish (follow-up)
- **File:line:** `src/lib/data/supabase/persist.ts:224-243`
- **Scenario:** only `legacy-supabase-store.tsx` imports it today. If it is ever re-enabled, every generate and move collapses the week to day 1 (C9).
- **Smallest fix:** give it the day's round or delete it with the legacy store.

---

## What exactly it takes to close gap 7

1. **Provision a round per playing day.** Add a migration with a backfill and a trigger on `tournament_days` (insert, update, delete) that keeps one `competition_rounds` row per playing day. Without this, no app change can name day 2.
2. **Make `generate` day-aware.** Filter `routingInputFor` to the selected day, pass each player's session, pass `dayNumber`, pass `splitClassesAcrossWaves: true` (the approved draft fills each batch as it goes), and give the `generate` action the day number (it currently lives only in the store). Decide and document how `route` tells "absent from the day" from "session not recorded": today both become the morning. The reference implementation is `scripts/generate-draft-draw.ts:86-114`.
3. **Normalise the batch label on the way to `registration_days`.** Store the last segment (`A`, `B`), derive the session from the label, and make `sessionWaveTime` read the last segment instead of expecting one letter.
4. **Make the save job carry the round id it was planned with**, and refuse a null round on the connected desk.
5. **Make publish day-aware.** Either merge all days into the snapshot (with a day on each group) or store one snapshot per day and read them together; the player portal needs one start per day.
6. **Make `validateDraw` and `sync_notifications` day-aware**, so a day-filtered board neither blocks publishing for players who chose another day nor hides a missing player on another day.
7. **Add the tests that do not exist:** `load-desk-state` day selection, `route` with a day's players and sessions, `placementsFromDraw` with day labels, publish with two days, and the portal with two starts. There is currently no `load-desk-state` test, no connected `desk-store` test, and no SQL test for `save_draw`.

## Migrations reviewed (no migration written or applied)

- `supabase/migrations/20261106000100_draw_by_playing_day.sql`: adds `tournaments.pm_first_tee_time` (default 12:30, never read in `src`), drops the old unique key on `(tournament_id, number)` and adds `unique (round_id, number)`, and replaces `save_draw` with a version that takes `p_round`. Data-wise the new column is additive; the function and constraint replacement is not reversible without care. It does **not** create the day-2..n rounds it relies on.
- `supabase/migrations/20261106000200_group_members_per_playing_day.sql`: adds `group_members.round_id`, backfills it from `groups`, sets it `not null`, replaces `unique (registration_id)` with `unique (registration_id, round_id)`, adds the foreign key and index, and recreates `save_draw`. This is a constraint change with a backfill, not purely additive.

## What I could not verify

- No test suite, typecheck, lint, build or browser run was performed (read-only audit), so all behaviour above is from source, not execution.
- The live Supabase project was not read. Whether the 24th event already has `competition_rounds` rows for days 2..n (created by hand or by an older flow) is unknown; the code does not create them.
- The exact `wave_gap_minutes` stored on the 24th event is unknown. The demo default is 300; the draft's 06:39 suggests the live event uses 9.
- The calendar database trigger's live presence was not checked; only the migration was read.

## Follow-up issues noticed outside the main scope

- `sync_notifications` per-day unplaced check (C10).
- The offline snapshot does not include rounds or days, so an offline reload cannot show the selected day (C12).
- Scoring also uses only the first round (`src/lib/data/supabase/scoring.ts:54-61`), so round 2 scoring would read day 1.
- The public pairings mapper keys groups by `group_number` alone (`mappers.ts:214, 252-269`); once a snapshot holds two days, duplicate numbers merge.

---

## Ranked list of proposed GitHub issues

1. **Create a competition round for every playing day**
   Nothing creates `competition_rounds` for days 2..n, so the draw day selector snaps back to Day 1 and every `save_draw` names Day 1. Add a backfill plus a `tournament_days` trigger and fail loudly when a requested day has no round.

2. **Draw only the selected playing day, with its AM/PM sessions**
   `routingInputFor` and `generate` route every entry with no day and no sessions, so one board holds the whole event at the first tee time. Filter by `selectedDays`, pass `sessions` and `dayNumber`, fill each batch as it goes, and treat "absent from the day's map" differently from "session not recorded".

3. **Publish every playing day, not just the loaded one**
   `buildPublished` and `publish_pairings` replace one event-wide snapshot with the current day's groups, so publishing Day 3 removes Day 1 from `/pairings` and from the player portal. Put a day on every published group and publish or read all days together.

4. **Stop "Take the draw's times" from writing another day's placement**
   `placementsFromDraw` keeps the first group for a player and the Tee times screen does not know which day's board is loaded, so Day 1's hole can be written to Day 3. Store only the batch letter as `registration_days.wave`, or the write is refused by the one-letter check.

5. **Use the batch interval, not the five-hour gap, for tee times**
   `sessionWaveTime` is called with `waveGapMinutes`, whose default is 300, so a second morning batch is timed at 11:30 and collides with the afternoon. Add a batch-interval setting and warn when a batch passes the next session's start.

6. **Make the afternoon start a per-day setting**
   `daySessions` picks 11:30 for the last array position, and `tournaments.pm_first_tee_time` is never read. A Saturday event gets Sunday's time, and the 24th draft uses 12:30 on its final Sunday. Derive it from the weekday or store it per day.

7. **Clear confirmation when a batch overwrites a confirmed time**
   "Overwrite all" keeps `confirmed: true` after changing 06:30 to 12:30, so an unchecked time is published as confirmed. Drop the flag whenever the time differs.

8. **Use the day's own opening time when labelling AM and PM**
   `sessionForTime` compares against the constant 06:30, so a day that opens at 10:00 labels its morning players PM and the final-day 09:15 case goes the same way. Pass the day's start into the function.

9. **Draw confirmed provisional players in their chosen session**
   The Unclassified block is always placed at the morning boundary, so a provisional player who chose the afternoon goes off at 06:30. Group provisional players by session like everyone else.

10. **Do not leave an unsaved board on screen or publish it**
    A failed queued save leaves the new board visible, and a later publish can send it. Restore the prior board on failure, disable publish while a save failed, and capture the round id in the save job instead of reading it at execution.

11. **Make validateDraw and the notifications day-aware**
    `validateDraw` calls a player unplaced when they chose another day, which will block publishing once boards are day-filtered; `sync_notifications` counts a player placed on one day as placed on every day. Pass the day or the day's registrations.

12. **Fix day handling in print and the calendar**
    The start sheet sorts day labels as strings (D10 before D2), the counts sheet reads a time before the draw's session, the Tee times and Print screens disagree about the last day, and `daysOfTournament` assumes dense ordered day numbers. Normalise the day, session and time before sorting and labelling.

13. **Normalise calendar start times and per-day previews**
    `findCalendarConflicts` compares raw strings, so 06:30 and 06:30:00 are only a warning, and the edit sheet gives only day 1 a start time, so a conflict on day 2 is allowed through. Normalise to HH:MM and map each draft date to its existing start time.

14. **Harden the routing engine against invalid input and stale locks**
    A zero hole count makes the planner loop forever, a non-positive group size crashes or drops the field, and invalid times are silently repaired (`24:00` becomes `00:00`). A locked group from another day also duplicates its hole and time. Throw on invalid settings, validate locked times, and release a lock whose day prefix does not match.
