# Stream S4b handoff: scheduling follow-up

Branch `focus/s4b-scheduling`, worktree `S:\Dev\golf-management-system-sl\focus-s4b`.
Everything below is committed locally on this branch. Nothing was pushed, merged, rebased or deployed. No SQL was applied anywhere. The dev server on port 3214 was stopped.

## Findings closed

| Finding | What changed |
| --- | --- |
| B2 / #177 | The afternoon start is read from stored settings: the day's own `tournament_days.pm_start_time`, then the event's `tournaments.pm_first_tee_time`, then the fixed 12:30, and 11:30 only on the last playing day when nothing is stored. Day numbers are keyed by number, so days 1, 2, 4 work. The Tee times screen edits the day's own afternoon start. |
| A4 | `placementsFromDraw` takes the playing day and ignores groups that name another day. The Tee times screen accepts a board only when the desk's loaded day matches the tab, and says so otherwise. It writes only the one-letter batch to `registration_days.wave`, never a label such as `D1-AM-A`. The Session column is the desk's recorded session, then the draw label, then the time. |
| C1 | The screen computes `startCountForField`, names every start time with its batch letter, and shows a warning when the field needs a third start. Nothing is capped at two. |
| C15 | A shotgun start with zero, negative or non-integer holes throws. A search that can never find a free slot throws instead of looping. Two-tee planning refuses a bad interval and a fully occupied cycle. |
| C16 | `groupSizes` throws for a group size that is not a whole number of at least 1. |
| C17 | `addMinutes` refuses `24:00`, `06:60`, `6:3`, unreadable text and a non-whole minute count instead of repairing them. |
| C18 | A class that merely begins in the next empty start is no longer reported as playing across starts. |
| C12 | The desk remembers the playing day in `localStorage` (event id + day number) and asks the loader for it on the first load. A remembered day that the event no longer plays falls back to the first round instead of failing the load. Pure helpers and 14 tests. |
| C11 | Switching event keeps the day only when the new event plays it; otherwise its first playing day opens. |
| C9 | New migration `20261108000900_save_draw_requires_day.sql` refuses a null round once an event has more than one round. |
| C10 | New migration `20261108001000_notifications_per_day.sql` counts a ready player as unplaced per playing day they selected, not once for the whole event. |
| D2 | `docs/PLAN.md` section 7 gap 7 and the spec's "Known limit" paragraph now describe the real state. CHANGELOG has a scheduling follow-up section. |

## New migrations (additive, NOT applied)

- `supabase/migrations/20261108000800_day_pm_start.sql` adds one nullable column,
  `tournament_days.pm_start_time time`. No policy, grant, trigger, data or existing-object change.
  Safe to re-run (`if not exists`). **Additive and unapplied.**
- `supabase/migrations/20261108000900_save_draw_requires_day.sql` replaces only the body of
  `save_draw`. Same signature, same ACL, still `security definer` with `set search_path = ''`.
  It refuses an unnamed save when the event has more than one round. **Additive in behaviour and
  unapplied.**
- `supabase/migrations/20261108001000_notifications_per_day.sql` replaces only the body of
  `sync_notifications`. Same signature and ACL, same `security definer` / `search_path`. The
  unplaced check now walks the player's selected days and their rounds. **Additive in behaviour and
  unapplied.**

The earlier S4 migrations (`20261108000500_rounds_per_playing_day.sql`,
`20261108000600_public_pairings_by_day.sql`, `20261108000700_portal_starts_by_day.sql`) are still
unapplied too. A real multi-day save needs `20261108000500` before the desk can name days 2..n.

## What changed, per screen and helper

### Tee times (`src/app/(desk)/tee-times/page.tsx`)

- Opens on the day whose board the desk loaded (`drawDay`), not always day 1. The local day tabs
  still let the operator read another day; when that day differs from the loaded board the screen
  says so and disables the draw copy.
- Session times come from `sessionsForDay` with the day's stored start and afternoon start, the
  event's afternoon start and the true last playing day (by date). The subtitle marks each time
  `(stored)` or `(default)`.
- New "Afternoon start (PM)" field and "Save PM start" button, with the same per-day draft pattern
  as the morning field. Empty clears it back to the event's time.
- "Take the draw's times" writes `wave: placed.batch ?? null`; the button counts only this day's
  placements.
- Third-start warning and a full start-time/letter list under the batch panel.
- Session column and `TeeRow` use the new `sessionForRow` helper.
- The sticky phone bar is unchanged and still holds the batch time and the primary action. Its
  `aria-label` and 44px height are unchanged.

### Draw/tee-time helpers

- `src/lib/draw/tee-times.ts`: `parseBatchLabel`, day-aware `placementsFromDraw`, `sessionForRow`,
  `batchLetters`, optional `batch`/`session` on `DrawPlacement`.
- `src/lib/data/sessions.ts`: `sessionsForDay`, `sessionSummaryOf`, `sessionForTimeIn`, optional
  `source` on `DaySession`, optional `sessions` input on `daySessionBadge`. Old helpers still work.
- `src/lib/data/dates.ts`: `lastPlayingDayNumber` and `isFinalPlayingDay`, by latest play date.
- `src/lib/data/tee-time.ts` was not changed; its existing helpers were enough.

### Store and data plumbing

- `src/lib/routing/types.ts`: optional `pmFirstTeeTime`.
- `src/lib/data/types.ts`: optional `TournamentDay.pmStartTime`.
- `src/lib/supabase/types.ts`: optional `pm_first_tee_time` and `pm_start_time` row/insert fields.
- `src/lib/data/supabase/domain.ts`: maps `pmFirstTeeTime`.
- `src/lib/data/supabase/load-desk-state.ts`: optional `pm_start_time` read (tolerates a database
  without the column), and `fallbackToFirstDay` with exported `pickRoundForLoad`.
- `src/lib/store/state.ts`: `routingInputFor` builds the day's sessions with `sessionsForDay`;
  new `setDayPmStart` action and reducer case.
- `src/lib/data/adapters.ts` and `src/lib/data/supabase/adapters.ts`: `setDayPmStart`.
- `src/lib/store/day-preference.ts` (new) and `desk-store.tsx`: remembered day, restore on first
  load, event-switch rule, defensive reset after a load.

### Routing guards

`src/lib/routing/schedule.ts` and `src/lib/routing/groups.ts` (details in the table above).

## Evidence

### Typecheck

```
> golf-management-system-sl@0.27.4 typecheck S:\Dev\golf-management-system-sl\focus-s4b
> tsc --noEmit
(no output, exit 0)
```

### Targeted tests

```
pnpm vitest run src/lib/data/sessions.test.ts src/lib/data/dates.test.ts \
  src/lib/data/tee-time.test.ts src/lib/draw/tee-times.test.ts \
  src/lib/store/state.test.ts src/lib/store/day-preference.test.ts \
  src/lib/data/supabase/load-desk-state.test.ts src/lib/routing \
  src/lib/data/adapters.test.ts src/lib/data/supabase/adapters.test.ts

Test Files  16 passed (16)
     Tests  195 passed (195)
```

The routing folder alone is 7 files / 66 tests. The new pure tests are in `sessions.test.ts`,
`dates.test.ts`, `tee-times.test.ts`, `state.test.ts`, `load-desk-state.test.ts`,
`day-preference.test.ts`, `routing.test.ts`, `holes.test.ts` and `sessions.test.ts` (routing).

### Phone and desktop measurements (Playwright, headless Chromium, demo mode, port 3214)

`/tee-times` was loaded at 390x844 (primary), 360x740, 430x932 and 1280x800, before and after a day
tab change, and again after a draw.

- Horizontal overflow: none. `document.scrollWidth === window.innerWidth` and
  `main.scrollWidth === main.clientWidth` in all 8 measured views (390/390, 360/360, 430/430,
  1280/1280).
- Tap targets at phone widths: every button, input and select on the screen is at least 44px in
  both directions, except the shared shell's Open menu button (39x44 at 390, 34x44 at 360; 44x44 at
  430) and the known secondary text links: the event breadcrumb (176x22), the inline "Change the
  event times in Settings" link (208x17) and the empty `/admin` wordmark link in the header
  (183x37). None of those files belong to this stream.
- The confirm checkbox is 20x20 with a 44x44 label, so its thumb target is 44px.
- Input font size on phones: zero time/number/select/textarea inputs under 16px. Checkboxes carry a
  14px computed font but are not text fields.
- Sticky primary action: the phone bar sits at top 707 / bottom 768 in a 844-high viewport, above the
  76px mobile tab bar. It holds the batch time and "Take the draw's times (N)".
- Flow after "Make the draw": 89 placements offered, the button reads
  "Take the draw's times (89)", pressing it reports "Took the draw's start time and hole for 89
  players; 1 on this day has no group yet", and the board does not overflow. (The demo draw is
  event-wide, so 89 of 90 day-1 players have a group; the missing one is not in the demo draw.)
- Saving an afternoon start in the demo updates the header to `AM 06:30 (stored) · PM 13:15
  (stored)` and says "Saved. This day's afternoon starts at 13:15."
- Console and page errors: zero in every measured view. The dev server printed the known React
  hydration warning about an injected `style={{caret-color:"transparent"}}` on inputs; no repository
  file sets that attribute and S4 saw the same dev-tooling noise.

### Screenshots (gitignored, under `.tmp/ux/s4b/`)

- `tee-times-390x844.png`, `tee-times-360x740.png`, `tee-times-430x932.png`, `tee-times-1280x800.png`
- `tee-times-day2-*.png` for the same four sizes
- `flow-draw-390.png`, `flow-tee-times-after-draw-390.png`, `flow-tee-times-after-take-390.png`,
  `flow-tee-times-pm-saved-390.png`, `flow-tee-times-after-reload-390.png`
- `measurements.json` and `flow.json` with the raw numbers

## What I could not verify

- No migration was applied. The three new SQL files and the S4 files were read by eye only; none of
  the SQL ran against a database.
- No Supabase project was read. The day restore across a reload, the event-switch rule and the
  strict/fallback loader path are covered by pure tests, not by a connected end-to-end run. In demo
  mode the load effect returns early, so a reload always opens day 1; only the connected desk can
  restore the remembered day.
- The day-mismatch warning cannot be produced in demo mode: the demo board is event-wide and
  `drawDay` is null, so the screen accepts it. The filtering is covered by
  `src/lib/draw/tee-times.test.ts` ("takes only the selected day's groups when the board names days").
- The third-start warning needs a field of 145+ players with 18 holes and groups of 4. The demo day
  has 90, so only the 1-2 start wording was seen in the browser; the count itself is unit-tested
  (`startCountForField(145, 18, 4) === 3`).
- The database check that `registration_days.wave` is one letter was not exercised; the page now
  writes the one-letter `batch` from the label, and `tee-time.test.ts` / `tee-times.test.ts` cover
  the shape.
- `pnpm lint`, the full `pnpm test` and `pnpm build` were not run, per the session rules.

## Noticed but left

- The Tee times day tabs are a view filter, not the desk's selected day. Switching a tab does not
  reload the desk's board, on purpose: before `20261108000500` is applied, asking the loader for a
  day with no round is a hard error, and a tab click must not take the whole desk down. The screen
  explains the mismatch instead. Once every playing day has a round, the tabs can call
  `setDrawDay`.
- The Tee times day tabs are not remembered; only the desk's selected day (the Draw screen's
  selector) is. That is the day C12 asked about.
- `writeTournament` in `src/lib/data/supabase/adapters.ts` still does not write
  `pm_first_tee_time`. Nothing in the UI edits the event-level afternoon start today; the database
  default 12:30 stands until a Settings field is added.
- B1 is only partly closed: the second start uses `config.intervalMinutes` (the batch interval), but
  there is still no separate batch-interval setting and the demo event keeps `waveGapMinutes: 300`.
- Still open from the audit: C7 and C8 (calendar time normalisation and dates missing from `days`),
  C13 (a locked group from another day can duplicate a hole), C14 (two-tee start ignores AM/PM),
  and D3 (the parked legacy writer `src/lib/data/supabase/persist.ts` saves without a round).
- The shared shell's Open menu button is 39px wide at 390 and 34px at 360. It is in
  `src/components/AppShell.tsx`, outside this stream's files.
- On a day with no stored start the subtitle says `(stored)` for the morning because the event's
  first tee time is passed as that day's start. The hint under the field says the event time is in
  use, so the label is not claiming a per-day record, but the word could be clearer.

## What to try on your phone

Use the dev server (`pnpm dev`) at `http://localhost:3000`, or the staging URL.

1. `http://localhost:3000/tee-times` at 390 wide. The day tabs run across the screen without the
   page sliding sideways, and the bottom bar shows the batch time and "Take the draw's times".
2. On the same page, set "Afternoon start (PM)" to 13:30 and tap "Save PM start". The header changes
   to `PM 13:30` and says "Saved". Leave it empty and save to go back to the event's time.
3. `http://localhost:3000/draw`, tap "Make the draw" in the phone bar, then More → Tee times. The bar
   says "Take the draw's times (N)"; tap it. The Session column fills and the notice says how many
   were saved.
4. On `/tee-times`, tap Day 2. In connected mode, if the desk's loaded board is Day 1, the warn
   notice tells you to open the Draw screen on Day 2 rather than writing Day 1's holes.
5. On `/draw`, switch the day selector to Day 3 and reload the page (connected desk). It should
   reopen on Day 3 instead of day 1.
6. On `/tee-times`, tick one player's confirmation checkbox. The 44px label makes it easy to hit,
   and a changed batch time drops the tick so it must be confirmed again.
7. On `/tee-times` with a big day (145+ players on 18 holes, groups of 4), check the warning names
   three start times and batches A, B, C.
8. On `/print`, the day still shows its AM and PM times; the afternoon now follows the day's stored
   value once the desk has set one.
