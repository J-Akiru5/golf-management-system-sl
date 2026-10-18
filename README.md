# TeeLine Golf

Premium golf-club and tournament management by Syntaxure Labs. TeeLine brings player records,
handicap-aware tournament workflows, draw review, and published pairings into one clear experience.

Stack: Next.js, Supabase (supabase-js, SQL migrations), pnpm, Biome, Vitest. Hosted on Vercel.

**Project plan:** [`docs/PLAN.md`](docs/PLAN.md) (status, gaps, roadmap, decisions) ·
**Build spec:** [`docs/spec/IGCC_Tournament_Desk.md`](docs/spec/IGCC_Tournament_Desk.md) ·
**Agents:** [`AGENTS.md`](AGENTS.md)

## Status

| Part | State |
| --- | --- |
| Routing engine (`src/lib/routing`) | Built, 21 unit tests |
| Draw checks (`src/lib/draw`) | Built: blocking / warning / info checks and move rules, 15 tests |
| Database schema (`supabase/migrations`) | Built; checked on Postgres 16 for club isolation, cross-club references, flight overlap, public pairings |
| Organizer screens (`src/app`) | Built on demo data held in memory: overview, players and player profiles with poster generator, handicap import, draw control room, setup, player-facing pairings. Not connected to the database; a page refresh resets everything |
| NGAP import logic (`src/lib/ngap`) | Built for CSV, 16 tests. Column mapping is chosen in the UI, so a real sample file only sets the defaults. Excel (.xlsx) not supported yet. No UI or database writes yet |
| Score encoding, results | Phase 2 |

## Run

```bash
pnpm install
pnpm test        # routing engine tests
pnpm typecheck
pnpm lint
pnpm dev
```

The current screens use in-memory demo data and reset on refresh. Supabase schema files exist, but
the app is not connected to Supabase and has no sign-in flow. Do not use the demo data for a real
event. Backend access, role checks, and persistence remain follow-up work.

## Routing engine

`route(input)` in `src/lib/routing/index.ts` is a pure function with no database or network access.

1. Age on tournament day plus gender picks the category (one tee per category).
2. Course handicap = Index x (Slope / 113) + (Course Rating - Par), times the allowance, rounded once.
3. An NGAP index above the maximum (30) is marked `ineligible`. Missing index, no matching
   category, or overlapping or missing flight ranges are marked `needs_review`. Nothing is guessed.
4. Players in a flight are sorted by handicap and split into even groups of up to 4.
5. Shotgun: one group per hole per wave. A flight is never split across waves, except a flight with
   more groups than holes, which is split and flagged. Wave start = first tee time + wave gap.
6. Two-tee start: groups alternate hole 1 and hole 10, one pair per interval.

## Database

Every table has `club_id` and row-level security through `public.is_club_member(club_id)`. Composite
foreign keys `(id, club_id)` stop a row in one club from pointing at another club's data. Visitors
read published pairings through `public.public_pairings(tournament_id)`, which returns names, flight,
hole and time only. Player photos live in the private `player-photos` bucket under `{club_id}/`.

Clubs and memberships are created with the service role during onboarding, not from the app.

## Before the first real event

- Enter IGCC's real Course Rating, Slope, Par and stroke index for every tee. The test data uses
  placeholder numbers.
- Confirm the open questions in the build spec (tees per category, flight basis, group ordering).
- Add a consent line before taking player photos (Data Privacy Act of 2012).

## NGAP import

`parseCsv` reads the file, `suggestMapping` proposes which column is which, and `buildImportPlan`
returns a plan the organizer reviews before anything is saved. Rules:

- Match by NGAP ID first, then by exact name in any word order. An ambiguous name, or a name match
  whose NGAP ID disagrees with the one on file, is an error. It is never guessed.
- A plus handicap such as `+2.3` is stored as `-2.3`. `NH`, `N/A` and blanks mean no handicap.
- Slash dates follow the format the organizer picks (month/day or day/month). They are never guessed.
- A golfer listed twice keeps the newest line and shows a warning.

## Brand and screens

**TeeLine Golf** is the approved product direction. Trademark clearance has not been established.
The fairway-and-flag vector mark is a faithful redraw of the supplied identity reference; it is not
an extracted original vector. Light, reverse, monochrome, symbol, and app-icon SVGs are in
`public/brand`. The IGCC crest remains a separate club asset.

The reusable design tokens in `src/app/globals.css` define forest, ivory, charcoal, gold, semantic
status colors, spacing, radii, motion, and surfaces. Geist and Manrope are used for the interface,
with Cormorant Garamond for editorial headings and Bebas Neue for selected numerical display. Fonts
are bundled through `@fontsource`; there are no external font or script calls. Theme is Auto, Ivory,
or Charcoal and is remembered per browser.

`src/styles/contrast.test.ts` checks text, status, border, and focus token contrast in both themes.

| Route | Screen |
| --- | --- |
| `/` | Public TeeLine Golf landing page |
| `/admin` | Existing tournament control room (demo preview; no sign-in yet) |
| `/players` | Search, filter, add a player with live "where will they land" preview and optional photo with consent |
| `/players/[id]` | Profile: Handicap Index and playing handicap shown apart with the working, this tournament, photo with consent, poster generator. Scoring record and past tournaments show empty states, never estimates |
| `/import` | NGAP CSV upload, column check, review of what changes, apply |
| `/draw` | Readiness tiles, checks, flight board, player pool, details panel. Drag a player or use Move. Publishing goes through a preview dialog |
| `/setup` | Start format, times, limits, allowance; categories, flights and tees (read-only for now) |
| `/course` | Illustrated course and hole views; artwork and tee ratings are placeholders |
| `/spotlight` | Organizer preview for the clubhouse player display |
| `/spotlight/[id]` | Full-screen player display |
| `/pairings` | Player view: names, hole and time only, search, print |

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
- **Locks.** Locked groups cannot give or receive players, and the board says so.
- Re-running the draw replaces everything, locks included, and takes the published list down.
  Keeping locked groups across a re-run is not built yet.

### Posters

Drawn on a canvas from the player's record, so the preview and the PNG are the same pixels. Two
layouts (Championship 1080x1350, Player card 1080x1080), dark and light looks, up to three facts,
photo zoom and position. Only facts that exist are offered. A photo is used only if the player's
consent was recorded. Public player profiles are not built; posters are shared by the organizer.
