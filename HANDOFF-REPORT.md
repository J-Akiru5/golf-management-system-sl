# Handoff report: issue #173, calendar grid and size

Branch: `fix/173-calendar-grid`
Worktree: `S:\Dev\golf-management-system-sl\issue-173`
Base commit: `20b3c83`

## What changed and why

The calendar month view now owns the height left inside the desk shell on desktop, so the page
itself does not scroll. The six week rows share that height equally. A busy day cell scrolls inside
its own event list, and events past the cut-off are reported by a "+n more" button that opens a
day sheet. The day sheet lists every event on that date and can open the edit sheet or create a new
event. On a phone the page scrolls normally and the list view still works.

The day grid now uses a new `--grid-line` token instead of the very light `--line`. The token has a
dark-theme value and the existing contrast test checks it at 3:1 against all three surfaces. The
shell header height moved into `--shell-header`, which both the header and the calendar height
calculation read, so the two cannot drift apart silently.

Three small commits:

1. `e1dc46d` Add a +n more cut-off helper and a visible grid line token for the calendar
2. `a9081ac` Fit the calendar month grid to the desk viewport and check it in the browser suite
3. `b15f884` Harden the calendar fit check, phone day row and print layout

## Files changed

- `src/lib/calendar/calendar.ts`: `DAY_CELL_EVENT_LIMIT`, `DayCellEvents`, `splitDayEvents`. Pure,
  no I/O, keeps input order, clamps a bad limit.
- `src/lib/calendar/calendar.test.ts`: six tests for the cut-off helper. Existing tests untouched.
- `src/app/globals.css`: `--grid-line` (`#79847c` light, `#8a948c` dark) in `:root`, the automatic
  dark block, `:root[data-theme="dark"]` and `.scheme-dark`; `--color-grid-line` mapping;
  `--shell-header: 84px`; a desktop-only rule that hides the build label on the calendar page so
  the grid gets the height.
- `src/styles/contrast.test.ts`: `grid-line` against `surface`, `surface-raised` and
  `surface-sunken` at 3:1 in both themes. No existing pair changed.
- `src/app/(desk)/calendar/page.tsx`: full-height flex layout at `lg`; six equal grid rows; cell
  event list scrolls inside the cell; "+n more" button and day sheet; compact date and chip sizes
  at `lg`; `border-grid-line` on the grid; the month header and weekday row use the grid token;
  list view gets its own internal scroll at `lg`; phone behaviour (page scroll, natural cells,
  "Today" word hidden below `sm`) kept.
- `src/components/AppShell.tsx`: header height reads `--shell-header`; `/calendar` main gets
  `lg:h-[calc(100dvh - var(--shell-header))]`, flex column and `overflow-hidden`, plus print resets
  so a printed calendar is not clipped.
- `scripts/verify-ui.mjs`: a new "calendar fills the viewport" section. It closes the edit sheet
  left open by the preceding conflict check, measures the four required sizes in light and dark,
  checks the section and last cell are on screen and the six rows are equal, checks the grid line
  at 3:1, and checks the phone month/list switch.

No migration was written or applied. No deploy, no push, no build.

## Commands run and results

Targeted during development:

- `pnpm vitest run src/lib/calendar/calendar.test.ts src/styles/contrast.test.ts src/lib/calendar/ics.test.ts`
  - 3 files passed, 125 tests passed.
- `pnpm typecheck` - clean at each checkpoint.
- `pnpm exec biome check` on the touched files - no fixes needed.
- `node --check scripts/verify-ui.mjs` - clean.

Final gate, run once at the end:

- `pnpm typecheck` - passed.
- `pnpm lint` - `Checked 450 files in 345ms. No fixes applied.`
- `pnpm test` - `Test Files 118 passed (118)`, `Tests 1129 passed (1129)`.

Browser check (dev server on port 3173, demo mode with no Supabase env, headless Chromium via the
repo's Playwright dependency):

| Size | Theme | Document scroll / viewport | Month section bottom | Last cell bottom | Row heights (px) |
| --- | --- | --- | --- | --- | --- |
| 1366x768 | light | 768 / 768 | 752 | 751 | 59.0 x6 |
| 1536x864 | light | 864 / 864 | 848 | 847 | 75.0 x6 |
| 1729x834 | light | 834 / 834 | 818 | 817 | 70.0 x6 |
| 1920x1080 | light | 1080 / 1080 | 1064 | 1063 | 111.0 x6 |
| 1366x768 | dark | 768 / 768 | 752 | 751 | 59.0 x6 |
| 1536x864 | dark | 864 / 864 | 848 | 847 | 75.0 x6 |
| 1729x834 | dark | 834 / 834 | 818 | 817 | 70.0 x6 |
| 1920x1080 | dark | 1080 / 1080 | 1064 | 1063 | 111.0 x6 |

Grid line measured from a real in-month cell at 1366x768:

- light: `rgb(121, 132, 124)` on `rgb(247, 245, 238)` = 3.56:1, width 1px.
- dark: `rgb(138, 148, 140)` on `rgb(23, 28, 25)` = 5.50:1, width 1px.

Phone at 390x844: month section visible, document scrolls (allowed on a phone), the "Today" word is
hidden so it cannot overflow the narrow cell, and the list view showed 2 event cards.

The day sheet was exercised by temporarily setting `DAY_CELL_EVENT_LIMIT` to 0 against the running
server, then restoring it to 3 (the file has no diff from the committed version): the "+1 more"
button opened the day sheet, the day sheet listed the event, and choosing it closed the day sheet
and opened the edit sheet with the right title and focus in the title field. One dialog open, no
console errors.

The refusal flow that the new `verify-ui` section follows was also replayed: the conflict check
leaves the edit sheet open, Escape closes it, and the 1366x768 measurement then reads 768/768 with
equal rows. This confirms the blocker fix in the suite.

Console errors during the calendar runs: 0.

The dev server was stopped after the checks; port 3173 is closed.

## Not verified

- The whole `pnpm verify:ui` suite was not run. Only the calendar checks were replayed in separate
  focused Playwright scripts. The other sections depend on demo data and the other shared masters,
  and the machine was under memory pressure (see Risks).
- The "+n more" state was not reached with real demo data, because the demo has no day with four
  events and the create flow gives every new event the active event's course and tee time, so a
  fourth same-day event is refused as an exact conflict. The cut-off helper is unit-tested and the
  UI was exercised by temporarily lowering the limit, but not with four real events.
- No visual screenshot review was done beyond the measured geometry and the computed colours.

## Risks

- At 1366x768 each grid row is about 59px and a cell shows one event chip before the inner scroll.
  This is the trade-off for no page scroll at the smallest required size. Taller screens show more.
- The desktop calendar hides the build label (`data-testid="app-version"`) so the grid gets its
  height. The rule uses `main:has(.calendar-page)` at `min-width: 1024px`; browsers without `:has`
  would keep the label and lose about 70px of grid height, not break the page.
- `<main>` is `overflow-hidden` on the desktop calendar. If a future notice or control is added and
  takes more height than the card can give up, it would be clipped rather than scroll the page. The
  grid card shrinks with `min-h-0`, so the current content fits.
- The day sheet sets `dayPeek` to null and opens the edit sheet in the same React update. Radix
  handled it in the browser run (day sheet closed, edit sheet opened, title focused), but the
  closing day sheet briefly re-renders with the title "Day" during its exit animation.
- The rail still uses hard-coded `top-[108px]` and `max-h-[calc(100dvh-140px)]`, which encode the
  84px header. They agree with `--shell-header` today.

## Follow-up issues noticed

1. **Seed a busy day in the demo calendar.** The demo has no day with more than one event, so the
   "+n more" sheet cannot be reached without changing the cut-off; add three or four events with
   different tee times on one day.
2. **Cover the abbreviated day list in `verify:ui`.** Add a browser check for a desktop cell with
   more events than the cut-off: the button text, the day sheet rows, and editing from it.
3. **Derive the rail offsets from `--shell-header`.** `AppShell.tsx` still uses `top-[108px]` and
   `max-h-[calc(100dvh-140px)]` next to a header that now reads the token.
4. **Keep the day sheet title while it closes.** The sheet shows "Day" for the exit animation after
   a selection; holding the last date would avoid the flash.

## Migration

None. No SQL file was added or applied.
