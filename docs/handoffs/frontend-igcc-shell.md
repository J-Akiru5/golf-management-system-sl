# Handoff: Phase 1 frontend shell (IGCC Tournament Desk)

Written 18 Oct 2026 on `feat/igcc-tournament-desk-shell`. This note is for the owner (Jeff) and for
the next agent: what this branch built, what is deliberately demo-only, and what is still blocked on
the club or on Supabase.

## Where this work lives

- **Worktree:** `S:\Dev\Next.js\golf-management-system-sl-shell`
- **Branch:** `feat/igcc-tournament-desk-shell`
- **Base:** `develop` at `6d49b6c` (the merge of `feat/clubhouse-ui`)
- **Merged:** 18 Oct 2026, directly into `develop` at the owner's instruction, on top of PR #5
  (`feat/supabase-data`). See "Merge into develop" below for what was kept and what is parked.
- Other worktrees were left untouched: the main checkout (`feat/clubhouse-ui`),
  `golf-management-system-sl-data` (`feat/supabase-data`, another agent's work) and
  `recursing-wilbur-710068`. A `golf-management-system-sl-teeline` worktree appeared while this work
  was running (`feature/teeline-golf-rebrand`); it was not opened or changed either.
- Nothing else was pushed: the merge commit is the only change on `develop` from this work.

## Merge into develop (18 Oct 2026)

`develop` had moved ahead with PR #5 (the Supabase data layer). A plain merge was **not** clean:

- `src/lib/store/desk-store.tsx`: both branches changed it. The Supabase branch kept the earlier
  `Desk` contract and added load/persist; this branch replaced the store with the session store the
  new screens use.
- `src/lib/data/registrations.ts`: both branches added a file with that name, different purposes.
- `README.md`: both sides changed it (auto-merged, then corrected by hand).
- `src/lib/demo/data.ts`: only this branch changed it, but the Supabase branch consumes
  `DeskPlayer` and `makeDemoPlayers` from it, which this branch had replaced.

Resolution: **the shell is the app; the Supabase layer is preserved, not dropped.**

- `src/lib/store/desk-store.tsx` is the shell's session store.
- The Supabase store moved intact to `src/lib/store/legacy-supabase-store.tsx`, still compiling and
  still covered by `src/lib/store/desk-store.test.ts`.
- The Supabase repositories and mappers moved intact to `src/lib/data/supabase/` (their relative
  imports unchanged; external ones repointed at the legacy store).
- `src/lib/demo/data.ts` keeps the old `DeskPlayer` and `makeDemoPlayers()` under a clearly marked
  legacy section, with `DEMO_CONFIG.date` left at the old demo date so the parked store's test still
  passes. The shell's Bamboo Tee event overrides the date to its own first day.
- The sign-in guard, login page, auth actions, Supabase clients, migration and docs are kept as
  merged. The proxy now also guards `/tournaments`, `/register` and `/print`.

**Consequence, stated plainly:** with `NEXT_PUBLIC_SUPABASE_URL` set, the sign-in guard and login
page work, but the desk screens still read and write local demo data. The shell shows a banner that
says exactly that. Wiring the data layer behind `src/lib/data/adapters.ts` is the next database task
(PLAN section 8, step 1).

## The club's member handicap listing (15 May 2024)

The club supplied a DotGolf "MEMBER HANDICAP LISTING as at Wed 15 May 2024": Name, Course Handicap
White, Course Handicap Blue, Handicap Index®. Handling decision:

- It is **real member personal data**, so it was not added to the repository, the demo seed or any
  test. The repo keeps fictional players only (AGENTS.md rule).
- It is a usable import source once the desk is wired to Supabase: map `Name` to the name column and
  `Handicap Index®` to the index column, and set the effective date to `2024-05-15` (or the date
  printed on the sheet). Do **not** map the two Course Handicap columns to the index.
- The sheet is a 2024 snapshot. Every record from it is older than the current Bamboo Tee cut-off,
  so the desk will flag the whole field as stale by design. Ask the club for a fresh export before
  the real event.
- The White and Blue course-handicap columns imply two tees, but they are not Course Rating, Slope
  or Par. The real tee and hole data is still pending from the club.

## Supabase CLI and migrations (checked 18 Oct 2026)

- Supabase CLI `2.117.0` is installed on this machine.
- This repository has no `supabase/config.toml` and no linked project (`supabase/.temp` holds only
  the CLI cache), so `supabase db push` would refuse or target nothing. The data-layer handoff says
  the same: provision the project and link it first, then apply, then regenerate
  `src/lib/supabase/types.ts`.
- Because of that, no migration was applied from this branch. The exact commands for the owner:
  1. `supabase login`
  2. `supabase link --project-ref <ref>` (from the repo root, with the database password)
  3. `supabase db push` (applies `20261017000000_init.sql` and `20261018000000_supabase_data_layer.sql`)
  4. `supabase gen types typescript --linked > src/lib/supabase/types.ts`
  5. Provision data: club, course, tees, holes, tournament, categories, flights, an Auth user and
     that user's `club_members` row with `display_name` and a role.
- The Vercel environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
  Production) only point the app at the project; they do not apply the schema.

## Verification after the merge

- `pnpm typecheck` passes on the merged tree; `pnpm build` passes with 16 routes plus the proxy.
- `pnpm test` passes: 17 files, 214 cases (the shell's 190 plus the data layer's 24).
- `biome check` passes for the files touched in the merge.
- The parked Supabase modules still compile and their tests still pass unchanged.

## What the shell does now

Screens (all local session data, no server):

- **Overview (control room)**: event card, demo registration count, attention list (blocking issues,
  over-limit, review, re-freeze, deferred imports, pending payments), quick actions, readiness,
  divisions, Handicap Index histogram, session activity, open questions.
- **Tournaments**: two demo events (Bamboo Tee sample, empty Monthly Medal), switch the working
  event, create a demo event, clear the selection for the no-tournament state.
- **Players**: directory search and filters (status, category, gender, home course), add player with
  photo consent; profile shows handicap history with the frozen marker, registration facts, private
  details, poster generator.
- **Registration desk**: player search or new player, member/guest role, sponsor question, per-day
  tee-time preferences (Day 4 flagged), shirt sizes, schema-driven extra fields, payment recorded by
  hand, confirmation summary with "no server persistence", eligibility review.
- **Handicap imports**: CSV, column mapping (NGAP ID, index, date, plus birthdate/contact when the
  file has them), match and merge queue with link / create / keep separate / defer decisions,
  confidence and conflicts, apply, deferred rows, import history.
- **Draw**: proposal, move with a reason, lock, re-run keeping locks, override list, routing
  explanation per player (frozen index and record date, category, tee, course-handicap preview,
  eligibility, flight, group and start), publish preview.
- **Print center**: start sheet, pairings, scorecard shell with placeholder handicap dots and print
  CSS for A4/Letter.
- **Settings**: editable setup wizard with live readiness checks (name, dates and cut-off, course and
  tees as pending blocks, categories, flights, start and groups, registration fields).
- **Player view**: public pairings built through an allow-list projection (name, flight, hole, time).

Boundaries and rules:

- `src/lib/data/types.ts` holds the domain types, all with `club_id`.
- `src/lib/data/adapters.ts` holds the mock adapters (PlayerRepository, TournamentRepository,
  RegistrationRepository, HandicapImportAdapter, PairingsRouter). Supabase versions go beside it.
- `src/lib/data/frozen.ts` is the cut-off rule: latest NGAP record on or before the cut-off, frozen
  onto the registration; a later import never moves it, the desk offers a re-freeze.
- `route()` takes locked groups: a re-run keeps their players and slots, releases a lock that no
  longer makes sense with the reason, and warns when a locked slot splits a flight across waves.
- The interface always shows "Demo shell · local session data". Payment status is manual and
  unverified; the app never computes an official WHS index.

## Verification run on this branch

- `pnpm typecheck` passes.
- `pnpm test` passes: 11 files, 190 test cases (routing 26 including 5 lock-aware, NGAP 25, draw 15,
  demo seed 6, cut-off freeze 8, merge queue 9, public projection 2, config checks 4, poster 4, and
  100 generated contrast cases).
- `pnpm build` passes; all 14 routes render.
- `next start` was smoke-tested over HTTP and driven in a real browser (no console errors anywhere):
  - Overview: attention list, quick actions, event counts, open questions.
  - Players: 91 rows, search and filters, add player.
  - Registration desk: form validation refused a save until the sponsor answer was given, then the
    save produced the confirmation, the "no server persistence" notice and the eligibility review.
  - Import: the sample file produced 5 ready-to-link rows, 1 new player, 2 decisions, 1 repeated
    line skipped and 1 unreadable row; decisions applied wrote 8 records; the desk then showed five
    "Re-freeze" flags and the re-freeze moved Antonio Alcantara from a 2026-10-15 index to the
    imported 2026-11-01 one.
  - Draw: make the draw, lock a group, re-run with locks kept (same players, same slot), move a
    player (blocked into a full group, allowed into a group with room) which added the "Manual"
    pill and the override entry.
  - Print center: start sheet with 25 groups, scorecard shell with the placeholder dots and note.
  - Tournaments: two events, theme switch (auto to light), clear selection then the designed
    no-tournament state on the draw page.
- **Not run:** browser end-to-end automation (the checks above were one-off, not a committed
  suite), printing on real paper, any Supabase, NGAP, mail or payment integration, and no test on
  the club's tablet.
- `pnpm lint` (`biome check .`) reports formatting errors **on the base commit too**: this Windows
  checkout has `core.autocrlf=true`, so tracked files are CRLF while Biome expects LF. The 37 files
  changed on this branch were formatted and pass `biome check` individually; the CRLF noise from
  untouched files is pre-existing and needs a repo-wide decision (a `.gitattributes`, or a fresh
  LF checkout).

## Deliberately not done (blocked or out of scope)

- No Supabase connection, auth, RLS or persistence. A refresh resets everything.
- No live NGAP import, no `.xlsx`, no official handicap calculation.
- Real IGCC Course Rating, Slope, Par and stroke index are pending; the tee values are read-only
  sample data and are labelled as such.
- No payment processing or verification; no mail is sent.
- No public publishing: the player view is a local preview.
- Phase 2 (scores, results, tie-breaks) and Phase 3 (self-registration, payments, messaging,
  multi-club) are untouched.

## Open questions for the organizer

1. The event name ("Bamboo Tee" is a sample title) and the real event dates and cut-off.
2. Day 4 "11:30PM Tee Off" exactly as supplied; is that the intended time?
3. Flights on index (current assumption) or course handicap.
4. Tees for Regular, Senior and Ladies; Super Senior = Silver is the only confirmed mapping.
5. Partial groups: even split with groups never below 3 (current assumption).
6. Order inside a flight: by handicap (current assumption).
7. Photos: organizer screens only for now.
8. Which day counts for age on a multi-day event (first day for now).
