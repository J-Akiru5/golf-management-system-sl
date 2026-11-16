# HANDOFF REPORT — STREAM S2 (player app)

Branch: `focus/s2-player` · Worktree: `S:\Dev\golf-management-system-sl\focus-s2` · Port used: 3202
Status: implementation complete, committed locally, typecheck and the focused tests pass. Not pushed.

## 1. What changed, per screen

### `/my` (player home)
- New hero (`src/components/player/PlayerHomeHero.tsx`): day, AM/PM session, tee time in large type,
  start hole or tee, flight, the other players in the group, and a live countdown in Manila time
  ("Starts in 1h 30m", "Starting now", then "Your group has teed off"). It stops at the tee time.
- Day chips appear for multi-day events. Only the day the published snapshot belongs to carries a
  start; other days say plainly that their start is not out yet. The chosen day is remembered in
  `localStorage`.
- Quick actions: Add to calendar (a real `.ics` data URL, no SDK), Share my start (Web Share or
  clipboard), Directions (course map), Scorecard. When the draw is out, a gold "Add to calendar"
  stays fixed above the tab bar once the hero's own actions scroll away.
- Not-published state explains what is missing and offers the pairings in one tap.
- The claim card now leads with the account-email link; the NGAP and birthdate route is a
  disclosure underneath, so the number never reads as a gate.
- Loading skeleton shaped like the hero and entry cards (`/my/loading.tsx`).
- Demo build (no Supabase env) shows a clearly labelled sample player with a start 90 minutes from
  now so the countdown, calendar and group card can be used on a phone.

### Bottom tab bar
- Four destinations: Home, Pairings, Board, Me. Card left the bar (it is one tap from the home
  quick actions and the tile grid), so labels stay large at 360px.
- 56px + safe-area bar, clear active state, labels translated (Tagalog/Hiligaynon: "Ako" for Me),
  `data-onboard="tab-bar"` and `data-onboard="tab-home|tab-pairings|tab-board|tab-me"`.

### `/pairings` and the programme
- Pairings now come first on the page, then tee times by day, then the player directory, then rules.
- Sticky search toolbar: 16px search, flight filter, Find me, Print, and the larger-type control in a
  compact two-row toolbar. It stays at the top of the viewport while the list scrolls.
- Find me sets the search to the signed-in player's name, clears the flight filter, scrolls their
  group into view and highlights it. With no signed-in name it focuses the search; it never fakes a
  match. A known name that is not on the list gets a calm "ask the desk" line.
- Own group: gold bar and surface, "Your group" badge, "You" on the player's row.
- Group card: time first at 24px, hole/tee and flight pills, player count, names in 52px rows.
- Day chips in the programme are 44px, scroll sideways, support arrow/Home/End keys, and keep
  `role="tablist"`.
- Print behaviour retained; the toolbar and skeleton are `no-print`.
- Loading skeleton shaped like the real header and group cards.
- Empty state links home; failed state has a real "Try again" reload.
- Sign-in frame: single column, 16px fields, correct `inputmode`/`autocomplete`/`enterkeyhint`,
  localized Show/Hide password, plain error sentences, and a 48px submit that sticks above the home
  indicator while the form scrolls. Errors sit in the same block, directly above the button.
- The `(auth)` layout now provides the language context, so the sign-in frame reads in the saved
  language.

### `/my/board`, `/my/card`, `/my/course`, `/my/profile`
- Board: 64px rows, 70px slot including the gap, larger name/points type, the "You" tag kept outside
  the truncating name, round pills in one scrollable 44px row, empty state with a pairings link,
  board-shaped skeleton.
- Card: sticky hole column and header cell with an opaque token background, `border-separate` so
  Safari pins cells, one "swipe sideways" hint, header facts reflow at 360px, card-shaped skeleton.
- Course: 18 hole chips at 44px, selected hole shown on the map plus a gold confirmation row, chips
  labelled "Hole N" for screen readers.
- Me: read-only facts the club holds (NGAP, events entered, photo consent), language row with
  `data-onboard="profile-language"`, larger-type row, sign-out at 44px. Unlinked accounts now get a
  real Me page (language, type size, sign-out, a link back to linking) instead of a redirect.
- Demo build shows a sample published card and board, labelled as sample data.

### Offline
- The existing `/offline` page and `OfflinePlayerView` now show the last saved start ("Hole 10 ·
  6:30 AM") above the entry, next to the existing "Showing what was on screen at 5:02 AM. Not
  connected." line, so the tee time and the age of the copy are the first two things seen.

## 2. Files

New:
- `src/lib/player/tee-time.ts` (+ test), `src/lib/player/calendar.ts` (+ test),
  `src/lib/player/group.ts` (+ test), `src/lib/player/demo.ts`
- `src/components/player/PlayerHomeHero.tsx`, `src/components/player/TextSizeToggle.tsx`
- `src/app/(player)/my/loading.tsx`, `my/board/loading.tsx`, `my/card/loading.tsx`
- `src/app/(auth)/layout.tsx`, `src/app/(public)/pairings/loading.tsx`

Changed (main): `src/app/(player)/my/page.tsx`, `(player)/layout.tsx`, all four player screens,
`src/components/PairingsView.tsx`, `src/components/public/ProgrammeView.tsx`,
`src/app/(public)/pairings/{page,DemoPairings}.tsx`, `src/components/MobileTabBar.tsx`,
`src/lib/ui/mobile-nav.ts` (+ test), `src/components/player/{PortalView,LiveBoard,ScorecardBreakdown,
PlayerMap,OfflinePlayerView}.tsx`, `src/components/auth/{AuthShell,PasswordField}.tsx`,
`src/app/(auth)/login/page.tsx`, `src/app/globals.css`, and the three dictionaries.

Commits on this branch (not pushed):
`ff7571c` words, `87b635e` sign-in, `bface10` home + tab bar, `e52e8e9` pairings/programme,
`609c076` board/card/course/Me, `7164f48` polish after phone checks.

## 3. Evidence (measured, not guessed)

Harness: `.tmp/ux/s2/check.mjs` (HeadlessChromium 156 through `@playwright/test`), 7 routes ×
4 viewports = 28 loads. Run against `http://localhost:3202`. The dev server must be reached as
`localhost`; `127.0.0.1` is treated as a cross-origin dev host and blocks the HMR/dev resource, which
made an earlier run look unhydrated.

- Horizontal overflow: **0** on every route at **390×844, 360×740, 430×932 and 1280×800**
  (`documentElement.scrollWidth === innerWidth`).
- Console errors: **0**. Page errors: **0**. (The earlier `127.0.0.1` run's only console output was
  the blocked HMR WebSocket, a dev-host artefact.)
- Tap targets under 44×44: only the sign-in **checkbox input** (18×18) — its wrapping label row is
  44px tall and is the actual tap target. Everything else measured ≥44×44.
- Inputs under 16px: only the checkbox (font-size irrelevant). All text fields are 16px on phones.
- Tab bar: **57px** measured including its 1px border (56px + safe area), labels Home/Pairings/Board/Me,
  active item correct after client-side navigation.
- Countdown rendered and running: **"Starts in 1h 30m"** (tick every 30s, stops at the tee time).
- Add to calendar produced a real download: **`bamboo-tee-sample-2026-11-08.ics`**. The pure builder
  is covered by 5 tests (Manila offset, 4h block, midnight rollover, escaping, stable UID).
- Day chips: 2 chips, switching to Day 2 changes the card to "The start for this day is not out
  yet", and the choice survives a reload (**Remembered: true**).
- Sticky pairings toolbar: `top = 0` after scrolling 900px.
- Larger text: `data-textsize="large"` after one tap, **no overflow** while large.
- Pairings search: 6 groups → 1 group for "alcantara". Find me focuses the search when signed out.
- Language: choosing Tagalog refreshed the player tab to **"Ako"** (dedicated run, cookie `desk-lang=tl`).
- Offline snapshot seeded in IndexedDB: banner **"Showing what was on screen at 5:02 AM. Not
  connected."**, last saved start **"Hole 10 · 6:30 AM"**, zero console errors.
- Board rows: 64px (70px slot); 7 rows visible at 390×844 in the sample board.
- Typecheck: `tsc --noEmit` passes (last run after formatting). Focused tests:
  `pnpm vitest run src/lib/i18n src/lib/player src/lib/ui/mobile-nav.test.ts` → **68 passed / 10 files**.

  ```
  > golf-management-system-sl@0.27.4 typecheck
  > tsc --noEmit

  (no errors printed)

  Test Files  10 passed (10)
       Tests  68 passed (68)
  ```

Screenshots (all in `.tmp/ux/s2/`, gitignored):
- Every screen at 390: `home-390.png`, `pairings-390.png`, `board-390.png`, `card-390.png`,
  `course-390.png`, `profile-390.png`, `login-390.png`; `*-390-full.png` for the whole page.
- 360 and 430 for every route; 1280 desktop for every route.
- Interactions: `home-390-day2.png`, `home-390-day2-reload.png`, `home-390-short-sticky.png`,
  `pairings-390-scrolled.png`, `pairings-390-filtered.png`, `pairings-390-large-text.png`,
  `profile-390-tagalog-final.png`, `board-data-390.png`, `card-data-390.png`, `course-data-390.png`,
  `offline-390-snapshot.png`.
- Dark theme: `home-dark.png`, `pairings-dark.png`, `card-dark.png`, `profile-dark.png`,
  `login-dark.png` (no overflow, zero console errors).
- Measurement dump: `.tmp/ux/s2/report.json`.

## 4. What I could not verify

- **Signed-in Supabase behaviour**: the own-group highlight, the Find me jump when the player's name
  is known, the real `player_portal_entries` read, group-mate matching against a real snapshot, and
  the auth-guarded pages. The dev run had no Supabase env and no accounts. The code paths are
  written and typechecked, but the demo build always has `you = null`.
- **A physical phone**: safe-area insets, iOS keyboard overlap (the sign-in button is sticky, but the
  open-keyboard case is reasoned, not observed), and iOS date/select rendering.
- **Paper print** of the pairings and the service-worker offline reload (the worker is off in
  `next dev` by design).
- **Loading and error states** were not photographed; the skeletons and error branches exist and were
  read, but forcing a slow/failed server render was out of scope.
- The signed-in "Find me" path was exercised only in the "no name" and "filter" forms.

## 5. Noticed but left alone

- The native language `<select>` in the dark header still paints as a light system control in light
  mode. It is high contrast and readable, and it matches the pattern already used in the player band.
- Sign-up, forgot-password and reset-password body copy is still English; only the shared frame and
  the sign-in page were localized. Those pages inherit the improved mobile shell.
- The player profile has no edit form: this build has no player-write server action. It now says
  what the club holds instead of pretending an edit could save.
- The scorecard keeps all eight columns and scrolls sideways with the hole column pinned. Fitting
  them all in 390px would make the numbers too small to read in the sun.
- `/offline`'s page shell is English (it is a static fallback outside the i18n providers). The age
  and the saved start are still shown clearly.
- The demo build shows labelled sample data on `/my`, `/my/board`, `/my/card`, `/my/profile` and
  `/pairings` (`src/lib/player/demo.ts`). It is not a real draw. A connected build never imports it.
- `player.start.hole` still contains the `{wave}` placeholder in the dictionary; the new hero does not
  use it. Removing the old string is a separate cleanup.
- "Scorecard" appears both as a home quick action and as an app tile; that is deliberate redundancy,
  not two destinations.

## 6. What to try on your phone

Start at the club's player app (or the dev build). Each line is one tap or one small gesture.

1. **`/my`** — look at the hero: day, AM/PM, tee time, hole, flight and the group. Wait a minute; the
   countdown moves. (Demo data shows a sample start about 90 minutes ahead.)
2. **`/my`** — tap **Day 2** in the chips. The card says that day's start is not out yet. Reload
   `/my`; it opens on Day 2 again.
3. **`/my`** — tap **Add to calendar**. Open the downloaded `.ics`; the event lands at the tee time in
   Manila time.
4. **`/pairings`** — scroll. The search, Find me, Print and T controls stay at the top. Type part of a
   name; the list narrows to that group. Tap **T**; the page grows without sideways scrolling.
5. **`/my/board`** — check your row: gold surface, "YOU" tag, 64px tall, rank and points readable
   without scrolling sideways.
6. **`/my/card`** — swipe the table sideways. The hole number column stays put; the swipe hint says so
   above the first card.
7. **`/my/profile`** — switch **Language** to Tagalog or Hiligaynon; the whole frame and the Me tab
   change (Me becomes "Ako"). Tap **Larger text**.
8. **`/login`** — focus the email field (it will not zoom on iOS), tap **Show** on the password, then
   try a wrong password: one short sentence, and the button stays in thumb reach.

Offline check: open `/my` once online, then open `/offline`. It should name the time the copy was
saved ("Showing what was on screen at 6:42 AM. Not connected.") and show the last saved start above
the entry.
