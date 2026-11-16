# Stream S4 handoff: scheduling engine and desk

Branch `focus/s4-scheduling`, worktree `S:\Dev\golf-management-system-sl\focus-s4`.
Everything below is committed locally. Nothing was pushed, merged, rebased or deployed, and no SQL was applied anywhere.

## What changed and why

### 1. Every playing day owns a round (A1 / #174)

A multi-day event had a `competition_rounds` row for day 1 only, because `open_round` is the only thing that creates one. The loader then fell back to the first round, so the day selector always snapped back to day 1 and every save named day 1.

- `supabase/migrations/20261108000200_rounds_per_playing_day.sql` (new, additive, NOT APPLIED)
  - Backfills one draft round per playing day in `tournament_days` that has none.
  - Adds a private trigger function and a trigger on `tournament_days` so a day added or changed later gets its round.
  - No table, column, constraint, policy, grant or existing function is changed, and nothing is deleted. It uses `on conflict do nothing`, so a second run is a no-op and a day whose play date is already used by another round is skipped rather than failing the statement.
- `src/lib/data/supabase/load-desk-state.ts`
  - New pure `pickRoundForDay`. Requesting day 3 either returns day 3 or throws `Day 3 has no round on file for this event. Open the draw again after the event days are saved.`
  - The named day applies only to the event the desk opens (preferred tournament, else the first open event, else the first event). Another event missing that day cannot fail the load.
- `src/lib/data/supabase/load-desk-state.test.ts` (new): requested day is returned, a missing day is null, no day keeps the first round.

### 2. The draw works on one playing day, with its sessions (A2 / #175, B5, B8, B11)

`routingInputFor` took every entry and `generate` routed the whole event at the first tee time with no sessions. One board held players from every day and nobody got an afternoon time.

- `src/lib/store/state.ts`
  - `routingInputFor(state, dayNumber)` keeps only entries whose `selectedDays` include the day (an entry with no day recorded still plays every day). It passes a `byPlayer` session map (`entry.daySessions[day]`, explicit `null` when not recorded), the day's own AM start, the day's PM start and `batchGapMinutes`.
  - `generate` takes the day and passes `splitClassesAcrossWaves: true`, which is the club's fill-as-you-go board (B11).
  - `PublishedGroup` gained optional `dayNumber`, `dayLabel`, `playDate`; `buildPublished` freezes one day and keeps the other days already published; `publish` takes the day.
- `src/lib/routing/index.ts`
  - A player missing from the day's map is not playing that day and is left out silently. An explicit `null` stays "session not recorded, drawn in the morning" and keeps the warning.
  - Confirmed provisional players are grouped in the session they chose instead of always the morning (B5).
  - A second start inside a session uses `batchGapMinutes` (the store passes `config.intervalMinutes`), never the long gap between sessions.
- `src/lib/store/draw-persist.ts`
  - A save job captures the round id when it is planned (B7).
  - The saved board drops players whose non-empty day list excludes the day, and empty groups (B8).
- `src/lib/store/desk-store.tsx`
  - Fills the day on `generate` and `publish` from the day on screen.
  - A failed queued save puts the last saved board back and sets `saveFailed`; publishing is refused until a save succeeds (B6). The restore is skipped if a newer draw action was queued after the failure.
  - `changedSincePublish` compares the day's board with that day's published copy.
- `src/lib/draw/validate.ts`: `dayNumber` and `dayMembers`, so a player who chose another day is not "ready but has no group" (C2).
- `src/app/(desk)/draw/page.tsx`: computes the day's players for validation, adds the phone action bar, and shows "All playing days" in the demo only.
- Tests: `src/lib/store/state.test.ts` (new), `sessions.test.ts`, `draw-persist.test.ts`, `validate.test.ts`.

### 3. Publishing covers every playing day (A3 / #176, B10)

Publishing day 3 used to replace the whole snapshot, taking day 1 off `/pairings` and out of the player portal.

- `src/lib/store/state.ts`: one snapshot holds every published day. Publishing day 3 updates day 3 and keeps day 1 and 2. `publishedGroupsForDay` / `publishedSignatureForDay` compare a day with its own copy.
- `src/lib/store/draw-persist.ts`: a fresh proposal on one day no longer queues an event-wide unpublish while another day is published (B9).
- `src/lib/data/types.ts`, `src/lib/data/public.ts`: `PublicPairings.days` (optional) with one section per playing day, and day fields on each group. Two days' group 1 stay apart.
- `src/components/PairingsView.tsx`: renders day sections when more than one day is present, and keys groups by day and number.
- `src/lib/data/supabase/mappers.ts`: groups are keyed by `day:number`, `days` is built from the rows, old rows without a day are day 1; snapshot groups parse the optional day fields.
- `src/lib/data/supabase/public-pairings.ts`: calls the new RPC first and falls back to `public_pairings` on a database without the migration.
- `src/lib/player/portal.ts`: `starts` (one per day) plus `start` as the first, for old clients.
- `src/lib/store/legacy-supabase-store.tsx`: type-only day fields on its `PublishedGroup`.
- Migrations (new, NOT APPLIED):
  - `20261108000300_public_pairings_by_day.sql` creates one new function, `public_pairings_by_day`, with the same columns plus `day_number` and `day_label`, and grants execute to anon and authenticated on that new function only. `public_pairings` is untouched.
  - `20261108000400_portal_starts_by_day.sql` replaces the body of `player_portal_entries` with the same signature and ACL. It adds `starts` and keeps `start` as the first element.
- Tests: `public.test.ts` (two days), `mappers.test.ts`, `portal.test.ts`.

### 4. Tee times, print and day handling (B3, B4, C5, C6, D1)

- `src/lib/data/tee-time.ts`: pure `batchAssignment`. "Overwrite all" now clears `confirmed` when the time changes (B3).
- `src/app/(desk)/tee-times/page.tsx`: uses `batchAssignment`; reads the playing-day list for tabs, index, session summary and rows.
- `src/lib/data/sessions.test.ts`: the final-day 09:15 case and a 10:00 opening are the morning. `sessionForTime` itself was already reworked in the AM/PM change; this verifies it (B4).
- `src/lib/data/dates.ts`: `playingDaysOf` (playing only, sorted, one row per day number) and stored days sorted and de-duplicated.
- `src/lib/data/day-selection.ts`: `pruneDaySessions` takes the real day numbers, so days 1, 2, 4 keep day 4.
- `src/components/desk/RegistrationDaysEditor.tsx`: passes the day numbers.
- `src/app/(desk)/print/page.tsx`: uses `playingDaysOf`, slices `HH:MM:SS` to `HH:MM`, phone thumb bar.
- `src/lib/print/day-counts.ts`: group times lose the seconds before display and session lookup.
- `src/components/draw/PublishDialog.tsx`: sticky action row and a visible close, so a phone can publish or leave without scrolling the whole preview.

## Evidence

### Typecheck

```
> golf-management-system-sl@0.27.4 typecheck S:\Dev\golf-management-system-sl\focus-s4
> tsc --noEmit
(no output, exit 0)
```

### Targeted tests

```
pnpm vitest run <the 15 files this stream touched>
Test Files  15 passed (15)
     Tests  191 passed (191)
```

### Phone and desktop measurements (Playwright, headless Chromium, demo mode)

Measured on `/draw` (before and after "Make the draw"), `/tee-times`, `/print`, `/pairings` at 390x844, 360x740, 430x932 and 1280x800.

- Horizontal overflow: none. `document.scrollWidth === window.innerWidth` and `main.scrollWidth === main.clientWidth` on every page and viewport, before and after the board was drawn.
- Before the fix, `/print` had `main.scrollWidth` 486 against 390, 360 and 430, caused by the "Day to print" select taking the width of its longest option. The select now fills the row on a phone; the page is 390/390, 360/360, 430/430.
- Tap targets on the three desk screens at phone widths: every button, input and select is at least 44px in both directions after the changes. The only remaining small targets are the event-name breadcrumb link (176x16) and, on `/print`, the inline prose link "Settings, Course & tees". Both are secondary text links, and the breadcrumb lives in the shared shell.
- Input font size on phones: zero inputs or selects under 16px on `/draw`, `/tee-times` and `/print`. The time, hole, caddie and batch fields are 16px on phones (`md:text-sm` on desktop). The confirm checkbox is 20px with a 44px label around it.
- Day tabs on `/tee-times` and print tabs are 44px tall on phones.
- The draw page's phone bar is visible at the bottom third with "Make the draw" or "Review and publish", above the desk tab bar. The tee times bar carries the batch time and "Take the draw's times". The print bar carries "Print all days" and "Print this sheet".
- Console and page errors: zero app errors in the final run. One intermittent React hydration warning was seen on `/tee-times` (3 of 16 page loads) and it is not from repository code: the client tree carries an injected `style={{caret-color:"transparent"}}` on inputs that no file sets, and the server and hydrated `main` HTML were byte-identical (245,827 characters each). Treated as dev-tooling noise. The dev server's own hot-reload websocket errors were filtered out as not app errors.
- Dev note: the page does not hydrate when opened on `127.0.0.1:3204` in this environment (Next 16 `allowedDevOrigins`), so the browser runs used `http://localhost:3204`. The layouts measured the same.

### Screenshots (gitignored, under `.tmp/ux/s4/`)

- `draw-390x844.png`, `draw-with-board-390x844.png`, and the same pair at 360x740, 430x932, 1280x800
- `tee-times-390x844.png` (and 360, 430, 1280), `print-390x844.png` (and the rest), `pairings-390x844.png` (and the rest)
- `flow-draw-390.png`: a drawn board with the phone bar
- `flow-publish-dialog-390.png`: the publish dialog with the sticky "Not yet / Publish 24 groups" row
- `flow-after-publish-390.png`: "Published" with the published list, unpublish and print actions
- `pairings-after-publish-390x844.png` (demo resets between navigations, so it shows the not-out-yet state)
- `publish-dialog-390x844.png`

## What I could not verify

- No migration was applied. The three new SQL files were reviewed by eye only. The trigger, the new public function and the replaced portal function have not run against a database.
- No Supabase project was read. The connected publish path is covered by pure tests, not by an end-to-end run against a real project.
- The multi-day public page with two day sections was not rendered in a browser: the demo has no saved rounds, so `/pairings` in demo mode never has two days. The grouping is covered by `public.test.ts`, and `PairingsView` renders the same grouping, but the pixels at 390 were not seen.
- The portal page with two starts was not rendered; only the mapper is tested.
- B6 was tested at the store level (the reducer and job plan) but not by forcing a real rejected save against Supabase.
- The hydration warning above was not fully attributed. It reproduces in roughly one page load in five and never in eight repeated `/draw` loads.

## Noticed but left

- Run `git ls-remote` before stating what is merged. This branch is only local.
- A4 / #177: `placementsFromDraw` still keeps the first group when a player appears twice, and `src/lib/draw/tee-times.ts` is still not told which day it reads. With boards now loaded per day this is much less dangerous, but the helper is unchanged. It was not in this stream's ordered list.
- B1 is only partly closed. Sessions no longer use the 300-minute session gap, they use `config.intervalMinutes` as the batch interval. There is still no separate "batch interval" setting, and the demo event's `waveGapMinutes: 300` is untouched.
- B2: the afternoon start is still chosen by array position (`daySessions`), and `tournaments.pm_first_tee_time` is still never read. A one-day Saturday event still gets 11:30.
- C1: the tee times screen still offers only two batch letters and `startCountForField` still does not warn when a field needs three.
- C3 is obsolete: the start sheet sorts by time and hole now that the wave labels are gone from a draw, so `D2` before `D10` cannot occur.
- C7, C8 (calendar), C11 (switching event keeps the day), C12 (the selected day is not persisted across reload; the offline snapshot has no rounds), C14 (two-tee with sessions), C15 (a zero hole count loops forever), C16 (`groupSizes` with 0), C17 (`addMinutes` repairs `24:00`) and C18 (false across-batches warning) are untouched.
- C9: `save_draw` still accepts a null round and would replace every day. The desk now always captures a round id, but the database guard was not added.
- C10: `sync_notifications` still counts a player placed on one day as placed on every day. Fixing it means replacing the whole function body; I did not want to copy that large function inside this session.
- D2: `docs/PLAN.md` section 7 and the spec still describe the old gap.
- D3: the parked legacy writer in `src/lib/data/supabase/persist.ts` still saves without a round.
- The draw's "Draw made" toast sits at the same height as the new phone action bar, so it covers the bar for a few seconds after a draw. The toast is existing app behaviour and was not moved.
- `src/lib/data/sessions.ts` still names sessions from an array position, so a non-playing day anywhere in the list is handled only because both screens now pass the playing-day list.

## Remote files

None. The three migrations live in `supabase/migrations` and are additive in behaviour. `20261108000400` replaces a function body with the same signature and ACL; `20261108000300` adds a new function and grants it so the signed-out public page can call it.

## What to try on your phone

Open the dev server (`pnpm dev`) and use `http://localhost:3000` or the deployed staging URL. These taps cover the changed screens:

1. `http://localhost:3000/draw` on a 390-wide phone. Tap "Make the draw" in the bottom bar. You should get a board, and the bar becomes "Review and publish".
2. On the same page, change "Day of the event" (demo says "All playing days"; a connected desk names the day). Check the board does not slide sideways.
3. `http://localhost:3000/draw` then "Review and publish". The preview scrolls and the "Not yet" and "Publish N groups" row stays pinned at the bottom. Publish and check the page shows "Published".
4. `http://localhost:3000/tee-times`. Switch between Day 1 and Day 2 with the 44px day tabs, then use the bottom bar's "Take the draw's times (N)".
5. `http://localhost:3000/tee-times`, on Day 1, type a batch time, tap "Set ... without a time", then tick one row's checkbox. The checkbox has a 44px target and a changed batch time drops an old confirmation.
6. `http://localhost:3000/print`. Change "Day to print" to Day 4 and check the line says `AM 06:30 · PM 11:30`. The page must not scroll sideways.
7. `http://localhost:3000/print`, then "Print all days" from the bottom bar. Cancel the print dialog. Each day should be one start sheet.
8. `http://localhost:3000/pairings` after publishing from `/draw` (connected desk). A multi-day event should show one section per day, each with its own group 1, and the player portal should show one start per day.
