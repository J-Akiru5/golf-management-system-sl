# Staff app (stream S1): handoff report

Branch: `focus/s1-staff`. Worktree: `S:\Dev\golf-management-system-sl\focus-s1`.
Everything is committed locally in five commits. Nothing was pushed, merged, deployed or written to a database.

## What changed, screen by screen

### Today (`/staff`)

- The first screen now answers the day's first question above the fold: the playing day and date, the
  session it is now (when the day is today), `arrived of total` with a progress bar, and the time at
  the club or the first tee. The next group follows, then four big actions.
- Replaced the old "Next wave: group" copy with "First up"/"Next up". No user-visible "wave" remains in
  the staff app.
- When there is no draw, it says "The draw is not out yet" instead of pretending every group has teed
  off.
- Added a sticky bottom primary action ("Check in players (n)" or "Open the tee sheet") above the tab
  bar. The four action cards fit on a 390x844 screen.
- Skeletons while the desk loads, a retry block on a failed read, and an empty state that offers the
  walk-up route.

### Schedule (`/staff/schedule`) - the main goal

- Day pills across the top and an AM/PM session switch under them (All day, AM session, PM session)
  with group counts per session, using the pure helpers in `src/lib/data/sessions.ts`.
- Group cards in tee order: large time, group, flight, start hole, `arrived/total` pill and one chip per
  player with a tick. The group about to tee off is outlined and carries a gold "Next up" marker.
- "Jump to now" is a fixed bottom action above the tab bar. It scrolls to the group at the current
  Manila minute, to the first group before play, or to the last group after play; the line under it
  says which one applies. Motion is disabled under `prefers-reduced-motion`.
- Search finds a player, group, flight, hole or clock time. Matching player chips are outlined; when
  one group matches, a "Jump to group" button appears in the sticky search area.
- No draw: "No confirmed start times for this day yet. The organizers publish the pairings first..."
  A day with an empty draw has its own state. A session with no groups offers "Show all day".
- Kept the DOM light for a 280+ player day: one card per group (not per player row), `content-visibility:
  auto` with `contain-intrinsic-size` on group cards and on the arrivals rows.
- Removed the "AM n / PM n" notice and moved the secondary Edit pairings/Print links below the tee
  sheet so the first group is visible without scrolling.

### Group page (`/staff/schedule/[id]`)

- Compact back link, group number, and one fact line (time, hole, flight, player count, AM/PM session).
- The whole roster row is the arrival control: 68px, optimistic tick and "Arrived 6:12 AM", "Saving...",
  and on a failed write the row rolls back with a plain error and Retry. A success toast offers Undo;
  Undo calls the same check-in with `false` and confirms.
- A separate 44x44 info button opens a bottom sheet with handicap index (NH when none), phone as a
  `tel:` link, group/tee/hole/session, arrival time and who marked it, and card status when available.
- Claim for the scorer: the sticky primary writes the claim and opens the score sheet; "Scan a card"
  opens it on the scan tab. When this phone already claims the group it shows the claim banner, changes
  the primary to "Open the score sheet", and offers "Stop scoring".
- Skeleton, empty roster copy and the calm card-state notice are all in place.

### Players (`/staff/players`)

- Sticky search and filter chips under the header, 64-72px rows, a 48px Arrive button per row, and a
  live "n players on this list" line. `data-onboard="arrivals-list"` on the list and
  `data-onboard="arrive-button"` on each Arrive button.
- Six skeleton rows while loading, a retry block that keeps visible rows, and a per-filter empty state
  with the action that helps (clear search, show everyone, open Not arrived, add a walk-up).
- The old right drawer is now a bottom sheet: status, index, group link, flight, tee time, hole,
  session, phone, arrival time, arrived-by, days, the manager-only move control and the withdraw
  confirm with the existing undo banner.
- Rows show `Group n`, `6:30 AM` and `AM session`, so a time is never shown without its session.

### Score (`/staff/score`, `/staff/groups/[id]/score`)

- The picker puts the phone's claimed group first as a gold "Continue scoring group n" card; every
  other group follows in tee order. Skeleton, empty and retry states added.
- The group sheet has a compact hole band (the first player is visible at 390x844), player names that
  wrap to a second line instead of truncating to "ANTONIO BAU...", and the primary Next hole / Review
  the cards action in a fixed bottom bar with `data-onboard="score-entry"`.
- Round-loading skeleton, inline "Saving...", an `aria-live` success line, and a "not saved, nothing
  queued" error with Retry. No scoring rule, data call or write path changed.

### Walk-up (`/staff/add`)

- The primary "Add the walk-up" is now a sticky bottom action, still a real form submit. Fields have
  real labels, correct `type`/`inputMode`/`autoComplete`/`enterKeyHint`, and 17px text. The directory
  search has its own label and does not submit the form on Enter.
- Errors render next to the sticky action and keep everything typed. Day chips use the same short date
  as the day pills. Empty directory result offers the guest path.
- Adds a loading skeleton and a desk-error retry.

### Pairings and print (`/staff/pairings`, `/staff/print`)

- Pairings: 16px selects (no iOS zoom), search hints, and loading/error states. No draw logic changed.
- Print: the print action is a fixed bottom bar above the tab bar, hidden from the printed page; the A4
  preview is its own labelled sideways-scroll region with a short hint. Loading/error states added.

### Staff shell and access

- Header is compact (56px + safe area), with a 44x44 account button (`data-onboard="account-sheet"`)
  instead of the old "Full desk" link.
- Account sheet: who you are, role, event in view with dates, switch event, what the role can do, sign
  out (connected only), the demo banner, and the version label. A desk role is told what it can do and
  that owners/organizers move players and publish; the control is explained, not silently hidden.
- Expired or ended session: when a connected desk reports the sign-in error with no member and no
  access problem, a calm bottom sheet says what stopped and offers "Sign in again" with
  `?next=<current path>`, plus "Keep looking at this screen". The screen underneath stays as it was.
- Offline: a calm banner under the header with the saved-at time and Try again, using the desk's own
  `offline`/`cachedAt`. The page content stays visible.
- Demo mode: a gold strip under the header and a prominent notice in the account sheet.
- The staff app now has its own toast viewport above the tab bar (and above a fixed action bar when one
  is present), because the shared toast sat on top of the tab bar. It supports an Undo action.
- No auth guard, role permission, RLS or redirect-helper change. I did **not** change where a signed-in
  staff member lands, so staff still land on `/admin`; doing that would also change the desktop. If the
  owner wants phones to land on `/staff`, it is one line in `landingFor` in `src/lib/auth/routes.ts`
  and belongs in a separate change.

## Files

New:
- `src/lib/staff/schedule.ts`, `src/lib/staff/schedule.test.ts`
- `src/components/staff/AccountSheet.tsx`, `BottomSheet.tsx`, `DayBar.tsx`, `RosterRow.tsx`,
  `SignInSheet.tsx`, `StaffLoading.tsx`, `StaffToast.tsx`, `use-now.ts`
- `src/components/staff/players.module.css`, `roster.module.css`, `score-ui.module.css`

Changed:
- `src/app/(staff)/staff/page.tsx`, `add/page.tsx`, `pairings/page.tsx`, `players/page.tsx`,
  `print/page.tsx`, `schedule/page.tsx`, `schedule/[id]/page.tsx`, `score/page.tsx`
- `src/components/staff/StaffShell.tsx`, `staff.module.css`, `day-context.tsx`, `DayPills.tsx`,
  `ArriveButton.tsx`, `GroupScore.tsx`
- `src/lib/staff/rows.ts` (frozen index on a row; flight name fallback)

No migration, no dependency, no new asset.

## Evidence

`pnpm typecheck` passes (final run, no output beyond the script header). Targeted tests:
`pnpm vitest run src/lib/staff` -> 7 files, 57 tests passed.

Headless Chromium through `@playwright/test`, demo mode. The scripted measurements checked page
horizontal overflow (`scrollWidth > innerWidth`), visible interactive targets under 44x44 CSS px,
text inputs under 16px, and console/page errors.

| Screen | 390x844 | 360x740 | 430x932 |
| --- | --- | --- | --- |
| Today | overflow 0, small 0, errors 0 | same | same |
| Players | 0 / 0 / 0 | same | same |
| Schedule | 0 / 0 / 0 | same | same |
| Group | 0 / 0 / 0 | same | same |
| Score group | 0 / 0 / 0 | same | same |
| Score picker | 0 / 0 / 0 | same | same |
| Add walk-up | 0 / 0 / 0 | same | same |
| Pairings | 0 / 0 / 0 | same | same |
| Print | 0 / 0 / 0 | same | same |

Also measured:
- Tab bar: 61px, bottom at 844/740/932 exactly; four labels end at 836/732/924, not clipped.
- Shell `min-height` computes to 844px (100dvh in the 390x844 viewport).
- Schedule with a populated demo draw: 25 group cards, one "Next up" marker, one "Jump to now"
  control; clicking it scrolled 438-517px and put the marked card at the top.
- Group arrival: toast appears 17px above the fixed action bar (toast bottom 634, action bar top 651),
  and the Undo toast restored `aria-pressed` from true to false.
- Account sheet: 597px tall at 390x844, 44x44 close button, contains the demo notice, event, switch
  event, role copy and version. Switching event changed the header to the other event; the sheet closed.
- AMPM switch: "PM session" shows the empty state (`0 groups`, "No groups in the PM session") and "All
  day" restores 25.
- No-draw state (plain demo, no demo-draw flag): schedule says "No confirmed start times for this day
  yet", Today says "The draw is not out yet", both with 0 overflow.
- Desktop 1280x800 schedule: no overflow; the tab bar stays, with items centered to the 760px column.

Screenshots (all under `.tmp/ux/s1/`, gitignored):
- Per screen at 390/360/430 plus `-full`: `today-*.png`, `players-*.png`, `schedule-*.png`,
  `group-*.png`, `score-group-*.png`, `score-picker-*.png`, `add-*.png`, `pairings-*.png`,
  `print-*.png`
- States: `schedule-nodraw-390.png`, `today-nodraw-390.png`, `schedule-pm-390.png`,
  `schedule-jump-390.png`, `schedule-search-390.png`, `account-sheet-390.png`,
  `player-sheet-390.png`, `group-arrived-390.png`, `group-sheet-390.png`
- Desktop: `schedule-1280.png`
- Raw measurements: `report-final.json`, `report-today.json`, `interactions-final.json`

Screenshot note: the populated tee sheet screenshots were taken with `NEXT_PUBLIC_AVP_DEMO=1`, the
repo's existing demo-draw fixture. Plain demo mode has no draw; the no-draw screenshots above are from
plain demo mode. No source file was changed to enable either.

Onboarding anchors left stable for the first-run tour: `day-pills`, `arrivals-list`, `arrive-button`,
`next-up`, `jump-to-now`, `score-entry`, `account-sheet`.

## What I could not verify

- The Supabase-connected states: the expired-session sheet, the offline banner with a saved-at time, a
  real failed check-in, and the desk-role view of manager-only controls. Demo mode has no session,
  network or second role. The code paths are there and typecheck passes, but they were not exercised.
- A physical iPhone: safe-area insets are 0 in headless Chrome, and iOS keyboard behaviour was not
  tested. The CSS uses `env(safe-area-inset-*)` and `100dvh`.
- 280+ players. The demo has 90 players across 25 groups. The schedule renders per group and the lists
  use `content-visibility`, but the 280-player timing was not measured.
- The browser print dialog on a phone (the preview and the sticky action are laid out; the OS dialog
  was not opened).

## Noticed but left

- The day pills are a horizontal scroller. At 360/390 a third pill is partly visible on purpose; the
  next day is one swipe away.
- The demo-draw fixture's flight ids (`r-a`) do not match the demo flight rules, so many demo cards say
  "Flight not set". Real data resolves to Class A/B/C/D. The fallback avoids showing a bare dash.
- The print preview scrolls sideways inside its own region because the sheet is A4; the page itself does
  not scroll sideways.
- Pairings has no single primary button because it saves as you edit; the controls are 44px+ and the
  reason field is labelled.
- The score picker no longer jumps straight into the claimed sheet; it shows a gold "Continue scoring"
  card first, so the volunteer can see and switch groups.
- `docs/STAFF_APP.md` still describes Score as the claimed group's sheet; it is now the picker with the
  claimed group first. Docs were outside this stream's ownership.

## What to try on your phone (390x844)

1. `/staff/schedule` - tap "PM session", see the empty state, then "All day". The counts on the chips
   change with the list.
2. `/staff/schedule` - tap "Jump to now". Before the event it shows the first group and says so; on a
   playing day it goes to the group teeing next.
3. `/staff/schedule` - type `santos` or `7` in the search. The list narrows, matching names are
   outlined, and a single match offers "Jump to group".
4. `/staff/schedule/g-1-1` - tap a player row to mark them arrived, then tap Undo in the toast. Tap the
   small info button beside a name for index and phone.
5. `/staff/schedule/g-1-1` - tap "I am scoring this group", then use + and - and "Next hole". The
   action stays above the tab bar.
6. `/staff` - tap the account circle (top right). Check the role, the event in view, Switch event, the
   demo notice and the version label.
7. `/staff/players` - search a name, switch filters, tap a name for the detail sheet, then withdraw from
   the day and undo it from the banner.
8. `/staff/add` - choose "New guest", fill the fields, and use the sticky "Add the walk-up" without
   scrolling to the bottom.
