# P1 handoff: pairings you can read at a glance

Branch `focus/p1-pairings`, worktree `focus-p1`. Everything below is committed on the branch;
this report is not committed.

## What changed and why

### `/pairings` and the signed-in player's pairings view (`src/components/PairingsView.tsx`)

The list now reads in the order a golfer asks the question:

1. A big tee time (26px, 24px in compact), first on every card.
2. A hole badge next to it, "Hole 10" or "Tee 1" depending on the event's start format.
3. The players, each in their own row in comfortable mode.
4. The flight, as a quiet chip at the foot of the card.

A group with no stored time shows "Time to be confirmed" instead of a made-up hour, and sits in a
last section of its day.

- Groups are sorted by time, then by group number.
- Each day is split into AM and PM sections by the group's own time. Each section has a heading
  ("Day 1 · AM", or "AM session" for a one-day event) that sticks directly under the toolbar, so a
  long list always says where the reader is. The toolbar height is measured with a ResizeObserver
  and fed to CSS as `--p-toolbar-h`, so the heading never hides under it when chips or the flight
  filter appear.
- Multi-day events get 44px day chips above the list. The choice is stored in
  `localStorage` (`teeline.pairings.day`) and restored on the next visit. A one-day event shows no
  chips. Clicking a chip shows only that day, unless a search is running: a search covers every day,
  so "when does my buddy tee off?" is answered even when the buddy plays tomorrow.
- Search ignores case, accents and punctuation and matches words in any order
  (`bautista, benjamin` finds Benjamin Bautista). It shows a live count ("1 group", "3 groups"),
  a 44px clear button, and highlights the matched player inside the card.
- Find me scrolls to the signed-in player's group and flashes it. For an anonymous reader it focuses
  the search field instead, because there is no name to match.
- Comfortable / Compact density is a two-option pressed-button group, stored in
  `localStorage` (`teeline.pairings.density`). Compact runs the players inline with middle dots and
  moves the flight into the top row, so six whole groups fit on a 390x844 screen.
- On a phone the action bar (Find me, Print) appears above the tab bar once the reader scrolls into
  the list; at the top of the page it stays out of the way so the first card is not covered. A
  Find me button also sits beside the search field.
- Desktop: the sticky toolbar collapses to one row and the cards become three columns on a 1440-ish
  width (two at 900-1200), with no dead width.
- Print: the toolbar, chips, density control, clear button and action bar are hidden; section
  headings become static; cards keep `break-inside: avoid`. Existing print rules were not edited;
  the new rules live in the appended P1 block.

### Demo data (`src/app/(public)/pairings/DemoPairings.tsx`)

The no-Supabase build now shows a believable two-day event: 30 groups (Day 1: 18, 10 AM + 8 PM;
Day 2: 12, 8 AM + 4 PM), group numbers restart each day, 59 unique fictional players on Day 1, and
Antonio Alcantara in the Day 1 06:40 group on hole 10 so Find me has a group to find. A matching
two-day programme feeds the tee-times and player sections, so the page does not disagree with
itself. The header was compacted for phones (smaller logo, 25px title, tighter padding).

### Loading skeleton (`src/app/(public)/pairings/loading.tsx`)

Reshaped to the new toolbar and time-first card, so the page does not jump when the draw arrives.

### Translations (`src/lib/i18n/dictionaries/{en,tl,hil}.ts`)

15 new `pairings.*` keys in a `// P1 pairings keys` block at the end of each `pairings` object:
day chip label, session headings, group count, clear, list spacing, comfortable/compact, "Time to
be confirmed", empty day and the search hint. Same placeholders in all three locales. The coverage
test passes.

### Styles (`src/app/globals.css`)

One appended block, `/* ---------- P1 pairings (phone first) ---------- */`. Tokens only, no
hard-coded colour outside the print block. Nothing above it was modified.

## Files

- `src/components/PairingsView.tsx` (rewritten)
- `src/app/(public)/pairings/page.tsx` (compact header, same component call)
- `src/app/(public)/pairings/DemoPairings.tsx` (two-day sample data, compact header, sample reader)
- `src/app/(public)/pairings/loading.tsx` (skeleton matches the new layout)
- `src/lib/i18n/dictionaries/en.ts`, `tl.ts`, `hil.ts` (P1 keys)
- `src/app/globals.css` (P1 block at the end)

## Evidence (measured, not estimated)

Playwright run against `http://localhost:3301/pairings` in demo mode, Chromium, no Supabase env.

| Viewport | Horizontal overflow | Tap targets < 44x44 | Input font | Toolbar | Compact groups fully visible | Console errors | Page errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 390x844 (primary) | none (scrollWidth 390 = innerWidth 390) | none | 16px | 159px | 6 | 0 | 0 |
| 360x740 | none (360 = 360) | none | 16px | 159px | 4 | 0 | 0 |
| 430x932 | none (430 = 430) | none | 16px | 159px | 7 | 0 | 0 |
| 1280x800 | none (1280 = 1280) | none | 16px | one row | 3-column grid | 0 | 0 |

Other measured behaviour:

- Comfortable card heights: 243px for three players, 292px for four. Compact: 65-85px (a long
  four-name group wraps to a third line and reaches 122px on a 360px phone).
- Search: `bautista, benjamin` returned "1 group", one highlighted player, clear button visible.
- Find me: query set to "Antonio Alcantara", scrolled to `Day 1 · AM`, card flashed, own group
  marked.
- Day chips: 44px tall; Day 2 showed "Day 2 · AM" and "Day 2 · PM" with 12 groups; after reload the
  Day 2 chip was still selected and `localStorage` held `2`.
- Density: after reload with `teeline.pairings.density=compact`, the root carried `is-compact` and
  the Compact button was pressed.
- Print media emulation: `.p-toolbar`, `.p-chips` and `.p-actions` compute `display: none`, and the
  session heading computes `position: static`.
- Dark theme: setting `data-theme="dark"` gives `--surface: #171c19`, card background
  `rgb(32, 40, 35)`, time text `rgb(238, 241, 236)`.
- Demo data check: 59 players on Day 1, 59 unique, no duplicates; AM times 06:30-08:00 then PM
  12:30-13:40, in order.
- `pnpm vitest run src/lib/i18n src/components src/lib/data`: 42 files, 470 tests passed.
- `pnpm typecheck`: see the last lines below (pasted after the final run).

Screenshots are in `.tmp/ux/p1/`:

- `390x844-comfortable.png`, `390x844-compact.png`, `390x844-search2.png`, `390x844-findme.png`,
  `390x844-day2.png`, `390x844-dark2.png`, `390x844-print.png`
- `360x740-*.png`, `430x932-*.png`, `1280x800-comfortable.png`, `1280x800-toolbar.png`
- `report.json` holds the full measurement output.

## What I could not verify

- Connected Supabase mode: this worktree has no Supabase environment, so every check ran on the demo
  fixture. The connected path uses the same component and the same published snapshot shape, but a
  real multi-day snapshot was not read.
- Offline and slow-network beats: the page already has `PlayerOfflineNotice` and `/offline`; I did
  not throttle the network or cut it to see the banner over this list.
- iOS Safari itself: Chromium with a 390x844 viewport is the proxy. The 16px input and safe-area
  padding are in place, but the dynamic toolbar behaviour was not observed on a real iPhone.
- Screen reader output: `aria-live` on the count, `aria-pressed` on chips and density, and labelled
  controls are in place. I did not run VoiceOver or TalkBack.
- The empty "Time to be confirmed" section: the demo has a time for every group, so that branch is
  code-reviewed, not seen on screen.

## Noticed but left alone

- `ProgrammeView`'s own tee-times day chips do not remember the chosen day; only the pairings chips
  do. That is a separate screen and was outside the P1 scope.
- The desk's publish preview passes `searchable={false}`, so it shows the cards without a toolbar.
  That is deliberate, but it means the preview has no density control.
- Old `wave*` identifiers and copy remain elsewhere in the codebase; the P1 screen never uses the
  word. Removing them is another stream's job.
- The page header still carries the programme jump links (Pairings / Tee times / Players). They are
  useful but take one 44px row above the list; a future pass could collapse them into the toolbar.

## What to try on your phone

Open the preview build at `/pairings` (local demo: `http://localhost:3301/pairings`).

1. Land on the page. Without scrolling you should see the first group's time ("6:30 AM") and its
   hole badge ("Hole 1"). The session heading says "DAY 1 · AM".
2. Tap the search field and type `cruz bernadette`. The count changes to "1 group", the group
   appears, and Bernadette Cruz is highlighted inside it. Tap the X to clear.
3. Tap **Find me** beside the search field. The page jumps to the 6:40 AM group on hole 10, flashes
   it, and marks it "YOUR GROUP" with "YOU" beside Antonio Alcantara.
4. Tap **Day 2** in the chips. The headings become "DAY 2 · AM" and "DAY 2 · PM" and the list shows
   12 groups. Reload the page: Day 2 is still selected.
5. Tap **Compact**. Six whole groups fit on the screen. Reload: it is still compact. Tap
   **Comfortable** to go back.
6. Scroll down the list. The Find me / Print bar slides in above the tab bar, and the "DAY 1 · AM"
   heading stays pinned under the toolbar.
7. Scroll back up and tap **Print**. The preview should show only the header, the day/session
   heading and the cards: no search, no chips, no action bar.
8. Switch the language in the header to Tagalog or Hiligaynon. The chips, count, density labels,
   session headings and the empty "no groups" message should all change.
