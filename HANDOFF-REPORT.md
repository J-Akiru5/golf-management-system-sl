# Handoff report: issue #170, player names on /scores open the player record

Branch `fix/170-scoring-player-links`, worktree `S:\Dev\golf-management-system-sl\issue-170`.
Two local commits, nothing pushed, nothing merged, no database touched.

## What changed and why

A player's name on `/scores` was plain text, so the desk could read a name but not open the
record. That hurt most where a card has to be checked against the player's handicap or
registration, and the same gap existed in the Cards table, the results tables and the conflict
list. Every name that identifies a player is now a link to `/players/[id]`, which is the route the
registration desk already uses (`/players/${id}`).

- **Cards table:** the player column and the "Marked by" column (the marker is a player too).
- **Correction notice:** "Correcting revision N for <name>".
- **Enter a card:** the selected player's name in the handicap summary is a link. The player and
  marker pickers are text fields, so each gets its own small "Open <name>'s profile" link under
  it. Choosing a player still only changes the selection; it never navigates.
- **Scan a card:** the selected player's name gets the same "Open ... profile" link under the
  picker. Nothing in the scan flow changed.
- **Gross and Net Stableford:** the player column in both boards.
- **Conflicts:** the player name in each card conflict, with the hole label kept beside it.

Supporting pieces:

- `src/lib/data/player-profile.ts`: pure functions `playerProfileHref(playerId)` (the route, with
  the id percent-encoded) and `canOpenPlayerProfile(role)`. `/players` is a staff route
  (`STAFF_PREFIXES` in `src/lib/auth/routes.ts`), so the link is only painted where the account can
  actually open it. The three states match `RoleGate`: `undefined` is demo (link live), `null` is
  signed in with no membership row (no link), a real role is checked against `DESK_ROLES`.
- `src/components/scoring/PlayerLink.tsx`: renders the name as a Next.js `Link` (same tab) with the
  established name-link style (`font-bold text-ink no-underline hover:underline`) and the global
  `:focus-visible` ring, or as the same bold text when the role cannot open profiles. No new
  colours, tokens or external assets.
- Keyboard and themes: the link is a real anchor, so Tab reaches it and the shared
  `:focus-visible` rule paints the ring. The name uses `--ink`, which is theme-scoped.
- `CHANGELOG.md`: an `Unreleased / Fixed` entry for #170.

No migration was added. Nothing about card entry, approval, reconciliation or the scan flow was
changed.

## Files

New:

- `src/lib/data/player-profile.ts`
- `src/lib/data/player-profile.test.ts` (5 tests)
- `src/components/scoring/PlayerLink.tsx`

Modified:

- `src/app/(desk)/scores/page.tsx`
- `src/components/scoring/HandicapSummary.tsx` (the name is now the profile link; the old separate
  "Open player record" link was removed so there is one link per name)
- `src/components/scoring/ScorecardScan.tsx` (optional `role` prop, link under the picker only)
- `scripts/verify-ui.mjs` (new `/scores player links` section)
- `CHANGELOG.md`

Commits:

- `0db591f` Link player names on the scores screen to the player record
- `2c19dc2` Check the scores player links in the browser suite

## Commands and results

Gate, run once on the final tree:

```
pnpm typecheck   -> tsc --noEmit, no output (clean)
pnpm lint        -> Checked 457 files in 679ms. No fixes applied.
pnpm test        -> Test Files  121 passed (121)
                    Tests  1192 passed (1192)
                    Duration  12.56s
```

Targeted during the work:

```
pnpm vitest run src/lib/data/player-profile.test.ts   -> 5 passed
pnpm vitest run src/lib/data/player-profile.test.ts src/lib/data/scoring.test.ts -> 24 passed
```

Browser evidence (headless Chromium from the repo's `@playwright/test`, demo mode with no Supabase
env, dev server on port 3170, viewport 1590x950). The script drove the real card form: two cards for
the same player, different markers, one hole apart, then approved both. It finished with
`26 passed, 0 failed` and `console errors: 0`. Observed:

```
PASS  Enter a card: a separate profile link is offered for the selected player
PASS  Handicap summary: the selected player's name is a link
PASS  Scan a card: the selected player's name is a link
PASS  picker link points at the profile route  /players/demo-p1
PASS  choosing a player in the picker does not navigate away  http://localhost:3170/scores
PASS  Cards table: player name  (2) /players/demo-p1
PASS  Cards table: marked-by name  (2) /players/demo-p3
PASS  Gross Stableford: player name  (1) /players/demo-p1
PASS  Net Stableford: player name  (1) /players/demo-p1
PASS  Conflicts: player name  (1) /players/demo-p1
focused: {"text":"SAMPLE PLAYER A","isLink":true,"href":"/players/demo-p1",
  "matchesFocusVisible":true,"outlineStyle":"solid","outlineWidth":"2px",
  "outlineColor":"rgb(7, 61, 46)","outlineOffset":"2px"}
PASS  Tab reaches the player link  /players/demo-p1
PASS  the link paints the shared focus ring  solid 2px rgb(7, 61, 46)
PASS  the handicap summary name stays underlined  underline
PASS  Scan a card: the player field still lines up with Card type  0.0px
light  color rgb(32, 37, 34) on rgb(247, 245, 238), no underline
dark   color rgb(238, 241, 236) on rgb(23, 28, 25), no underline
PASS  clicking SAMPLE PLAYER A lands on /players/demo-p1
PASS  a real player id opens the profile page  ANTONIO ALCANTARA
console errors: 0
26 passed, 0 failed
```

The new `verify-ui` section was also run on its own against the same server:
`9 passed, 0 failed`, `console errors: 0`. The full `pnpm verify:ui` suite was not run end to end;
it is not part of `pnpm test` and it needs the server up. The orchestrator may run it.

The dev server on port 3170 was stopped afterwards.

## What I could not verify, and risks

- **Demo sample ids do not resolve to a record.** The demo scoring round seeds its own four sample
  players (`demo-p1`..`demo-p4`) which are not rows in the demo player directory, so in demo mode
  clicking a name lands on `/players/demo-p1` and the profile page shows its "Player not found"
  state. The URL, the route and the profile component are correct; `/players/p1` (a real demo
  directory id) renders "ANTONIO ALCANTARA". In a connected build `playerId` comes from
  `registration.player_id`, so the link resolves. Filed as a follow-up below.
- **Connected mode was not exercised.** No Supabase environment is configured here, so the
  role-gated path (`member` with a real role, and `member === null`) was reasoned from the code and
  covered by the unit tests, not by a signed-in browser run. There is no test staff account in this
  worktree.
- **The link is not underlined at rest** in tables; it underlines on hover, matching the
  registration desk's name links. If the owner wants the affordance visible without hover, that is
  a one-class change in `PlayerLink.tsx`.
- **Finalization blocker text** still prints player names inside engine-built message strings. Those
  names are not links. Restructuring `src/lib/scoring/standings.ts` messages was out of scope and
  would change pure engine output plus its tests.

## Follow-up issues noticed

1. **Demo scoring round should use demo directory players** — `buildDemoScoringSeed()` seeds
   `demo-p1`..`demo-p4`, which are not rows in the demo directory, so profile links from the sample
   `/scores` round land on "Player not found"; map the sample round onto four real demo players.
2. **Link player names in the finalization blockers** — `FinalizationBlocker.message` carries the
   player name as text; the blocker already has `playerId`, so the page could render the name as a
   link without changing the engine's wording.
3. **The demo card flow has no seed cards** — checking the Cards table, boards or conflicts in the
   demo needs two manually entered and approved cards; a seeded demo card set would make screens
   easier to review and would let the browser suite skip the entry steps.
