# golf-management-system-sl

Tournament management for **Iloilo Golf & Country Club**, built by Syntaxure Labs. Registration,
NGAP handicap, categories, flights, and auto-routed groups and start times (shotgun in waves, or
two-tee start). The organizer reviews and overrides every proposal before publishing.

Stack: Next.js, Supabase (supabase-js, SQL migrations), pnpm, Biome, Vitest. Hosted on Vercel.

## Status

| Part | State |
| --- | --- |
| Routing engine (`src/lib/routing`) | Built, 21 unit tests |
| Database schema (`supabase/migrations`) | Built; checked on Postgres 16 for club isolation, cross-club references, flight overlap, public pairings |
| Organizer screens (`src/app`) | Built on demo data held in memory: overview, players with photo step, handicap import, draw board, setup, player-facing pairings. Not connected to the database; a page refresh resets everything |
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

Copy `.env.example` to `.env.local` and fill in the Supabase values to connect a project.

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

Working product name: **Starter** (the starter sends each group off the tee). The name is not cleared
for trademark use. Colors are blazer navy and brass, type is Newsreader for headings and Atkinson
Hyperlegible for the interface, which was designed for low vision and suits older players. Fonts are
bundled through `@fontsource`, so no external font service is called. Light and dark themes follow the
device setting. Buttons and inputs are at least 44px tall.

| Route | Screen |
| --- | --- |
| `/` | Overview: counts and the five steps to a published draw |
| `/players` | Search, filter, add a player with live "where will they land" preview and optional photo with consent |
| `/import` | NGAP CSV upload, column check, review of what changes, apply |
| `/draw` | Make the draw, move players (pick, then choose a group), lock groups, publish |
| `/setup` | Start format, times, limits, allowance; categories, flights and tees (read-only for now) |
| `/pairings` | Player view: names, hole and time only, search, print |

Moving a player uses pick-then-place instead of drag and drop, so it works the same with a mouse, a
finger or a keyboard. Locked groups cannot be changed. Re-running the draw replaces everything, locks
included; keeping locked groups across a re-run is not built yet.
