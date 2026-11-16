# P2 print sheet: handoff

Branch `focus/p2-print`, two commits on top of `4795af3`:

- `0ebfdad` Plan printed start sheets by day and AM/PM session, with page counts and labels
- `bfd789c` Print the starter sheet, hole grid and notice board by day and session, with a printable public pairings page

Not committed, by instruction: this report, `.tmp/ux/p2/` screenshots and PDFs, and `.env.local` (deleted).

## What changed and why

### Desk Print center (`src/app/(desk)/print/page.tsx`)

- One sheet per playing day and AM/PM session, never one day's groups on another day's paper. The
  split comes from `src/lib/print/sheets.ts`, not from the selected tab.
- The first screen now starts with the paper choice: Start sheet (A4 portrait table), Hole grid
  (A4 landscape), Poster (A4 portrait notice board). Day and session controls follow, then the live
  preview of the actual paper.
- The preview is the sheet, not a table of contents. It carries the club, event, day/date/session,
  format, "Published version N · date, time" (or "Not published · working draft"), page x of y, and
  a footer with TeeLine Golf and the same version line.
- Start sheet rows are ordered by tee time: time, hole/tee, group with flight, players with index,
  playing handicap and tee, and a narrow Arrived box. Rows never split; the header row repeats on
  every page. Seven four-player groups fit an A4 page after the inline player facts were tightened.
- Hole grid: A4 landscape, nine rows, holes 1 to 9 left and 10 to 18 right, A and B cells per hole,
  group number, time and names, 9pt names and 12pt group numbers so it stays on one landscape page
  per session. A third group on a hole is listed in a footnote rather than dropped.
- Poster: A4 portrait, two columns on paper and one on a phone preview, event 26pt, group line 14pt,
  names only (no handicaps), one session per page so two days never mix.
- "Print all days" still loads every day once through Supabase, but now renders the same paper
  components. The phone bar stays sticky above the tab bar and is not printed.
- Removed the old sideways-scroll staff copy and the unused old start-sheet component from the desk
  path.

### Staff print page (`src/app/(staff)/staff/print/page.tsx`)

- Same four paper choices: Start sheet, Hole grid, Poster, Scorecards. The staff day and the staff
  session filter decide which sheets appear; a day's AM and PM never share a page.
- The start sheet is the same table component as the desk, so the starter and the organizer print
  the same paper. The field and group checkboxes still control what is included.
- Grid printing adds a page-scoped `@page { size: A4 landscape }`, so the browser dialog starts in
  landscape for that sheet and portrait for the others. No named `@page` is used, because a named
  page leaves blank pages when the page name changes.

### Public pairings print (`src/app/globals.css`, `PairingsPrintFooter.tsx`)

- New additive `/* P2 print */` block at the end of `globals.css` (315 lines, no existing rule
  changed): A4 portrait, hides the site chrome, tab bar, sticky search toolbar, language/help,
  buttons, day chips, player directory, tee-times board and rules. Shows the event header, date,
  start format, version stamp and the pairings as a two-column notice-board sheet with 13pt times,
  12pt hole labels, 10pt names and black borders.
- The event title needed a `@layer base` colour override because `!text-on-forest` is an important
  utility and important declarations reverse layer order. Without it the title printed cream on
  white.
- `PairingsPrintFooter` is a print-only QR block added inside `#pairings` on both the server page and
  `DemoPairings`, without changing P1's component structure. It prints the event name, "Scan for the
  live pairings" (EN/TL/HIL), the URL and a 28mm QR code. Screen: `display: none`.
- Per-day `break-before: page` applies only when P1 renders the multi-day section wrapper; a
  single-day event is one sheet.

### Pure helpers (`src/lib/print/sheets.ts`, 16 tests)

- Day order by the number in the label, so D2 sorts before D10, then day number, then date.
- Last playing day from the latest playing date, not the length of the list, so a trailing
  non-playing day cannot move the final-day 11:30 PM cut.
- `splitIntoSessions` returns one sheet per day and session, AM before PM, and keeps an unreadable
  time as "No tee time" instead of guessing.
- `paginate`, `pageLabel`, `versionLine`, `holeGridRows`, `posterColumns`, `formatLine`.
- `D1` prints as `Day 1`; dates print as `Fri 13 Nov` in UTC so a calendar date never shifts.

### Shared paper components

- `StartSheetTable.tsx` and `print.module.css` additions: the starter table with Arrived boxes.
- `P2Sheets.tsx` and `p2-sheets.module.css`: landscape hole grid and notice-board poster.
- `PairingsPrintFooter.tsx`: the QR footer.
- Removed a broken `:global(nextjs-portal)` rule from `print.module.css`; Next 16's CSS-module
  loader rejected it and every page importing the print styles returned 500. Replaced with a plain
  `nextjs-portal` print rule in `globals.css`.

## Evidence

Environment: demo mode, dev server `pnpm exec next dev --webpack -p 3302`, headless Chromium from
the repo's `@playwright/test`, `NEXT_PUBLIC_AVP_DEMO=1` only for the test run (deleted afterwards).
The demo fixture has one day, so the two-day evidence came from a throwaway `/p2-harness` route that
was deleted after the run; it fed 2 days × 2 sessions × 13 groups through the same components.

Layout measurements (every value read from the DOM, not estimated):

| Page | 390×844 | 360×740 | 430×932 | 1280×800 |
| --- | --- | --- | --- | --- |
| `/print` | no overflow (`scrollWidth 390`) | no overflow (`360`) | no overflow (`430`) | no overflow |
| `/staff/print` | no overflow | no overflow | no overflow | not checked |
| `/pairings` | no overflow | no overflow | no overflow | not checked |

- Text inputs and selects measured 16px or more on `/print` and the harness. The staff page's 20px
  controls are native checkboxes inside 48px labels, not text inputs.
- Tap targets under 44px on `/print`: 5, all shell/chrome (1×1 skip link, 39×44 help button,
  breadcrumb and inline text links). The sheet-type buttons are 64px high, the selects 44px.
- `/staff/print`: 28 native checkboxes at 20×20 inside 48px label rows, listed as a known deviation
  from the strict 44×44 reading.
- `/pairings`: one 110×17 footer text link.
- Console/page errors in the final run: none from the app. The 32 captured errors are all
  `ws://127.0.0.1:3302/_next/hmr` handshake failures caused by Next dev blocking a cross-origin
  dev resource for `127.0.0.1`; production has no HMR socket.
- Print emulation on `/pairings`: `.public-head` shown, toolbar hidden, tab bar hidden, first group
  shown, `.groups` computed as two 632px columns, QR footer shown, first time `6:30 AM`.

Real PDFs (`page.pdf`, A4, `preferCSSPageSize`, Chromium; two-day harness):

| PDF | Pages |
| --- | --- |
| `start-sheet-two-days.pdf` (4 session sheets) | 8 |
| `hole-grid-two-days.pdf` (4 session sheets) | 10, before the final grid compaction |
| `poster-two-days.pdf` (4 session sheets) | 4 |
| `public-pairings.pdf` | 1 |

After the last grid change (9pt names, tighter cells), one session's grid measured 181mm on the
194mm landscape page and produced 2 pages in a single-sheet check; the 10-page all-day figure was
not re-measured end to end. The extra page is a page-flow/blank-page issue, not overflow: the sheet
content itself fits. Treat grid page count as unverified until someone prints it from the desk.

Screenshots (`.tmp/ux/p2/`):

- `desk-print-390x844.png`, `desk-print-360x740.png`, `desk-print-430x932.png`,
  `desk-print-1280x800.png`
- `staff-print-390x844.png`, `staff-print-360x740.png`, `staff-print-430x932.png`
- `public-pairings-390x844.png`, `public-pairings-360x740.png`, `public-pairings-430x932.png`
- `desk-top-390.png`, `desk-preview-390.png` (readable phone close-ups)
- `start-sheet-two-days-print-emulation.png`, `hole-grid-two-days-print-emulation.png`,
  `poster-two-days-print-emulation.png`, `public-pairings-print-emulation.png`
- `report.json` (the raw measurements)

Checks run:

- `pnpm typecheck`: passed, no output after the script line.
- `pnpm vitest run src/lib/print`: 5 files, 55 tests passed.

## What I could not verify

- A real club printer, real A4 paper and real landscape forcing from Safari/iOS. The PDF is the
  evidence available here.
- The two-day event through the live database. The demo fixture is one day without day numbers, and
  `loadEveryDay` needs Supabase. The harness proved the components; the desk's data load is
  unchanged from before.
- Multi-day `break-before` from P1's markup only appears when `pairings.days.length > 1`, which the
  demo public page does not produce.
- The grid's all-day page count after the last compaction (see above).
- The staff print page at 1280px (mobile is the target and was measured).

## Noticed but left

- `src/lib/print/start-sheet.ts` still sorts only by time/hole/number; the old `StartSheet` component
  and `PairingsSheet` still use it. My new sheets use the new day-aware helpers. The old component is
  still used by the pairings tab and scorecards path.
- Staff checkboxes are 20×20 native inputs inside a 48px label. Making them 44×44 would look odd; the
  label is the target. Flagged rather than changed.
- The desk cut a two-day harness with 13 groups per session into two pages per session (7+6). A
  real session of 18 groups will be three pages, which is correct and numbered.
- The demo fixture's flight ids do not exist in `DEMO_FLIGHTS`, so the demo prints "—" for flight in
  some groups. That is pre-existing demo data, not a print bug.
- The public pairings page has no published-version stamp in demo mode, so the print QR footer is
  the only version aid there; the desk and staff sheets always print the version line.
- `nextjs-portal` is now hidden in print globally.

## What to try on your phone (390 wide)

1. `http://<dev-host>:3302/print` — the Sheet buttons are the first control. Tap **Start sheet**,
   then **Day 1** and **PM only**, and check the paper changes to the PM session.
2. On the same page scroll to the preview: times are 6:30 AM, holes read `Hole 3`, players show
   `Index` and `PH`, and the Arrived column has a box on every row.
3. Tap **Hole grid**. The preview becomes the landscape A4 grid, holes 1 to 9 left and 10 to 18
   right, with A/B cells.
4. Tap **Poster**. Names only, no handicaps, two columns on paper, one column on the phone.
5. Tap **Print start sheet** in the sticky bar. In the print dialog choose A4; the header should say
   `Day 1 · Thu 12 Nov · AM` and `Page 1 of 2`.
6. `http://<dev-host>:3302/staff/print` — choose **Start sheet**, tick a group off, and print. The
   sticky button says how many groups are selected.
7. `http://<dev-host>:3302/pairings` — open the browser menu and choose Print. The site header and
   tab bar are gone, pairings are two columns, and the QR code to the live list prints at the foot.
8. `http://<dev-host>:3302/pairings` on screen — the QR block is invisible on the phone, as it
   should be; it only appears on paper.
