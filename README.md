# TeeLine Golf

Premium golf-club and tournament management by Syntaxure Labs. TeeLine brings player records,
handicap-aware tournament workflows, draw review, and published pairings into one clear experience.

Stack: Next.js, Supabase (supabase-js, SQL migrations), pnpm, Biome, Vitest. Hosted on Vercel.

**Project plan:** [`docs/PLAN.md`](docs/PLAN.md) (status, gaps, roadmap, decisions) ·
**Runbook:** [`docs/RUNBOOK.md`](docs/RUNBOOK.md) (deploy, roll back, run the day offline) ·
**Acceptance test:** [`docs/UAT_RUN_SHEET.md`](docs/UAT_RUN_SHEET.md) (the organizer's walkthrough) ·
**Build spec:** [`docs/spec/IGCC_Tournament_Desk.md`](docs/spec/IGCC_Tournament_Desk.md) ·
**Agents:** [`AGENTS.md`](AGENTS.md)

## Status

| Part | State |
| --- | --- |
| Routing engine (`src/lib/routing`) | Built, pure, lock-aware re-runs: 26 unit tests |
| Draw checks (`src/lib/draw`) | Built: blocking / warning / info checks and move rules, 15 tests |
| Database schema (`supabase/migrations`) | Built and reviewed in code (two migrations); checked on Postgres 16; **never applied to a real project** |
| Supabase data layer (`src/lib/data/supabase`, `src/lib/auth`, `src/lib/supabase`) | Built: auth guard, club-scoped repositories, frozen public snapshot, optimistic writes. **Merged but not yet wired to the shell store** |
| Organizer screens (`src/app`) | Built on demo data held in memory: overview, tournaments, players and player profiles with poster generator, registration desk, handicap imports with a match/merge queue, draw control room, print center, setup wizard, course and holes, clubhouse display, player-facing pairings. A page refresh resets everything |
| NGAP import logic (`src/lib/ngap`) | Built for CSV: parse, column mapping, a reviewable match/merge queue, and the strict plan. 25 tests. Excel (.xlsx) not supported yet. No database writes |
| Data boundary (`src/lib/data`) | Domain types with `club_id`, frozen-index cut-off rule, mock adapters (PlayerRepository, TournamentRepository, RegistrationRepository, HandicapImportAdapter, PairingsRouter) and a public allow-list projection |
| Score encoding, results | Phase 2 |

Whole suite: 17 test files, 214 tests passing (`pnpm test`).

## Run

```bash
pnpm install
pnpm dev
pnpm typecheck && pnpm lint && pnpm test
pnpm build
```

With no `NEXT_PUBLIC_SUPABASE_URL`, the app runs on deterministic in-memory demo data and refresh
resets changes. To connect Supabase, copy `.env.example` to `.env.local` and set
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Set `NEXT_PUBLIC_SITE_URL` to the
deployed domain so player-facing share links (the public entry link) point there rather than at
localhost. The app uses email/password sign-in; it does not use a service-role key.

For desk work without a Supabase project, the local dev server has one fixed development staff
account: sign in at `/login` as `staff@gmail.com` with the password in
[`docs/STAFF_ACCESS.md`](docs/STAFF_ACCESS.md). The app lands on `/admin` and the account chip
shows the desk role. The account exists only in development with no Supabase URL; a production
build or a configured project ignores it.

**The shell is not wired to Supabase yet.** With Supabase configured, the sign-in guard and the
login page are active, but the desk screens still read and write local demo data. The Supabase data
layer is merged and parked at `src/lib/data/supabase` plus `src/lib/store/legacy-supabase-store.tsx`;
wiring it into the shell store is the next database task (see `docs/handoffs/frontend-igcc-shell.md`).

The Supabase project is provisioned separately. The `golf-management-system` project
(`egfwfyznbndunqfqzxjx`, ap-southeast-1) already has both migrations applied and the club row
seeded, with `player-photos` created as a private bucket and RLS verified against the anon key.
Still to do before the desk can run on real data: create an Auth user and its `club_members` row
with a display name and role, add the course and tee rows, and wire the data layer to the shell
(see below). The migrations are applied through the CLI: `supabase link --project-ref` then
`supabase db push --include-seed`. Nothing in the app uses a service-role key.

## Routing engine

`route(input, options?)` in `src/lib/routing/index.ts` is a pure function with no database or network access.

1. Age on tournament day plus gender picks the category (one tee per category).
2. Course handicap = Index x (Slope / 113) + (Course Rating - Par), times the allowance, rounded once.
3. An NGAP index above the maximum (30) is marked `ineligible`. Missing index, no matching
   category, or overlapping or missing flight ranges are marked `needs_review`. Nothing is guessed.
4. Players in a flight are sorted by handicap and split into even groups of up to 4.
5. Shotgun: one group per hole per wave. A flight is never split across waves, except a flight with
   more groups than holes, which is split and flagged.
6. Two-tee start: groups alternate hole 1 and hole 10, one pair per interval.
7. Locked groups are passed back in as `options.lockedGroups`: their players and slots are kept,
   the rest is re-proposed around them, and a lock that no longer makes sense (a player left the
   field, changed flight, or the group is over size) is released with the reason in the warnings.

## Database

Every table has `club_id` and row-level security through `public.is_club_member(club_id)`. Composite
foreign keys `(id, club_id)` stop a row in one club from pointing at another club's data. Visitors
read published pairings through `public.public_pairings(tournament_id)`, which returns names, flight,
hole and time only. Player photos live in the private `player-photos` bucket under `{club_id}/`.

Clubs and memberships are created with the service role during onboarding, not from the app.

## This shell is a demo, on purpose

Everything on screen is local demo data in the browser session: fictional players, sample events,
placeholder tee ratings, and a sample NGAP file written by us. The app never computes an official WHS
index; it reads what an import supplies. Payment status is recorded by hand and stays pending until
someone verifies it outside this tool. There is no live NGAP connection, no mail, no bank and no
publishing service.

A Supabase data layer exists (email/password auth, club-scoped repositories, a frozen published
snapshot for the public pairings RPC). It was merged into `develop` as a foundation and is not yet
wired to the shell's store: with Supabase configured you can sign in, but the desk still shows local
demo data. The Supabase implementation lives in `src/lib/data/supabase` and
`src/lib/store/legacy-supabase-store.tsx`; it was written against the earlier store contract and
stays untouched until the wiring task. The project itself has both migrations and the club row
applied; no player, registration or event data has been written to it.

The shell's own boundary lives in `src/lib/data`: domain types with `club_id`, the cut-off freeze
rule, the public allow-list projection, and mock adapters for `PlayerRepository`,
`TournamentRepository`, `RegistrationRepository`, `HandicapImportAdapter` and `PairingsRouter`. The
Supabase wiring replaces the mock implementations behind those interfaces.

## Before the first real event

- Enter IGCC's real Course Rating, Slope, Par and stroke index for every tee. The test data uses
  placeholder numbers.
- Confirm the open questions (event name, dates and cut-off, Day 4 "11:30PM Tee Off", tees per
  category, flight basis, group ordering, partial groups). The setup review panel lists them live.
- Add a consent line before taking player photos (Data Privacy Act of 2012).

## NGAP import

`parseCsv` reads the file, `suggestMapping` proposes which column is which, `buildMergeQueue`
returns the review queue the organizer decides, and `buildImportPlan` remains the strict version
(clean rows only). Rules:

- The queue shows every row with its candidates and a confidence label. Signals are the NGAP ID
  first, then name (any word order), then birthdate and contact when the file carries them.
- Decisions are link to an existing player, create a new player record, keep separate, or defer.
  Nothing is merged silently, and a link with more than one candidate must name the player.
- A name that matches two players, or a file ID that disagrees with the record, needs a decision
  and is an error in the strict plan.
- A plus handicap such as `+2.3` is stored as `-2.3`. `NH`, `N/A` and blanks mean no handicap.
- Slash dates follow the format the organizer picks (month/day or day/month). They are never guessed.
- A golfer listed twice keeps the newest line and shows a warning. A row with a conflict is a
  question, not a repeated line, so it stays in the queue.
- Applying writes handicap records dated as supplied. The event freezes the latest record on or
  before the cut-off onto each registration, and the desk offers a re-freeze when a later import
  overtakes a frozen index.

## Brand and screens

**TeeLine Golf** is the approved product direction. Trademark clearance has not been established.
The fairway-and-flag vector mark is a faithful redraw of the supplied identity reference; it is not
an extracted original vector. Light, reverse, monochrome, symbol, and app-icon SVGs are in
`public/brand`. The IGCC crest remains a separate club asset. Colours are forest green, warm ivory
and restrained gold. Gold is a fill with dark ink on top or the darker `--gold-ink` for text, never a
low-contrast line on ivory. Buttons and inputs are at least 44px tall.

The reusable design tokens in `src/app/globals.css` define forest, ivory, charcoal, gold, semantic
status colors, spacing, radii, motion, and surfaces. Geist and Manrope are used for the interface,
with Cormorant Garamond for editorial headings and Bebas Neue for selected numerical display. Fonts
are bundled through `@fontsource`; there are no external font or script calls. Theme is Auto, Ivory,
or Charcoal and is remembered per browser.

`src/styles/contrast.test.ts` checks text, status, border, and focus token contrast in both themes.

| Route | Screen |
| --- | --- |
| `/` | Public TeeLine Golf landing page |
| `/admin` | Tournament control room: illustrated course map with hole pins, event card, attention list, quick actions, readiness, divisions, Handicap Index histogram, session activity, open questions |
| `/tournaments` | The demo events: dates, cut-off, entries, draw state; set the working event, start a new demo event, clear the selection to see the empty state |
| `/players` | Directory: search by name, nickname, NGAP ID or home course; filters for status, category, gender and home course; add a player with photo consent |
| `/players/[id]` | Profile: Handicap Index and playing handicap shown apart with the working, handicap history with the frozen marker, registration facts, private details, photo with consent, poster generator |
| `/register` | Registration desk: find a player or start a new one, member/guest role, sponsor question, per-day tee-time preferences (Day 4 flagged), shirt sizes, extra event fields, payment recorded by hand, eligibility review after saving |
| `/import` | NGAP CSV upload, column check, match and merge queue with decisions, apply, deferred rows, import history |
| `/draw` | Readiness tiles, checks, flight board, player pool, details panel with the routing explanation, override reasons, lock, re-run keeping locks, publishing preview |
| `/print` | Print center: start sheet, pairings, scorecard shell with placeholder dots, print CSS for A4/Letter |
| `/setup` | Settings and configuration: basics, course and tees (pending blocks), cut-off and handicap rules, categories, flights, start and groups, registration fields, live readiness checks |
| `/course` | Hole 1 illustration with anchors; not IGCC's real hole |
| `/spotlight` | Clubhouse display for the TV, single player or rotation |
| `/pairings` | Player view: names, hole and time only, search, print. Built through the public allow-list projection |

### Draw rules

- **Moving.** Drag by the grip handle (mouse), or press Move then Move here (keyboard, touch). Every
  group shows whether it would accept the player, and why not, before anything changes. The cards
  keep their size during a move so nothing shifts under the cursor. Drag uses the browser's built-in
  drag and drop, which has no touch support, so touch devices use Move. Escape cancels.
- **Checks.** *Must fix* blocks publishing: a player in two groups, a group over the limit, a ready
  player with no group, an ineligible or unreviewed player in a group. *Check* needs a tick before
  publishing: groups under the minimum, empty groups, players from another flight, mixed categories.
  *Note* is information.
- **States.** Draft, Published, and Published with changes not yet published. Publishing freezes a
  copy; the player view reads that copy, so edits on the board never reach players until the
  organizer publishes again. "Saved" is not a state yet because nothing is persisted.
- **Locks.** Locked groups cannot give or receive players, and the board says so. A re-run of the
  proposal keeps every locked group's players and start slot exactly where they are; a lock that no
  longer makes sense (a player left the field, changed flight, or the group is over size) is
  released and the reason is shown.
- **Overrides.** Every hand move and every lock records the reason chosen above the board, and the
  session's overrides are listed under the board. The router never does this by itself.
- **Start over** throws away moves, overrides and locks, and takes the published list down.
  **Re-run proposal (keeps locks)** leaves the published list up; the board then shows "Published,
  with changes not yet published" until the organizer publishes again.
- **Why a player landed there.** The details panel shows the routing steps: frozen index and its
  record date, age and category, tee, the course-handicap preview (sample ratings), eligibility,
  flight, group and start, plus any override.

### Posters

Drawn on a canvas from the player's record, so the preview and the PNG are the same pixels. Two
layouts (Championship 1080x1350, Player card 1080x1080), dark and light looks, up to three facts,
photo zoom and position. Only facts that exist are offered. A photo is used only if the player's
consent was recorded. A public player list is now part of the `/pairings` programme (name, home club,
frozen index, category and flight); it never carries contact details, birthdate, gender or a photo.
