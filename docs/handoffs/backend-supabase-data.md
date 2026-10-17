# Handoff prompt: backend (Supabase data layer)

Written 17 Oct 2026 alongside the frontend redesign on `feat/clubhouse-ui`. Paste everything inside
the fence below into the backend agent's session.

````text
TASK: Replace the in-memory demo store with Supabase (auth, reads, writes) for the IGCC tournament
desk, in your own git worktree, without touching the frontend redesign that is running in parallel.

SESSION SETUP
Repo: J-Akiru5/golf-management-system-sl (local checkout: S:\Dev\Next.js\golf-management-system-sl).
Base branch: `develop`. Never `main` (it does not exist yet). Never push to `develop` directly.

You work in a DEDICATED WORKTREE, not in the main checkout. Another agent is redesigning the UI in
the main checkout on branch `feat/clubhouse-ui`, and its files must not change under it.

1. From the main checkout, inspect first:
     git fetch --all --prune
     git branch -a
     git worktree list
     git status
   - If a worktree for `feat/supabase-data` already exists, `cd` into it and resume. Do not create
     a second one.
   - If `origin/feat/supabase-data` exists but no local worktree, create the worktree from it.
   - Otherwise create it fresh from the latest develop:
       git worktree add -b feat/supabase-data ../golf-management-system-sl-data origin/develop
2. `cd ../golf-management-system-sl-data`, run `pnpm install`, then
   `pnpm typecheck && pnpm lint && pnpm test` to confirm a green baseline before changing anything.
3. Check whether the frontend branch has landed yet:
     git ls-remote origin feat/clubhouse-ui
     git log --oneline origin/develop -5
   If `feat/clubhouse-ui` has been merged into develop, rebase onto `origin/develop` before you
   start. If not, carry on and rebase before you open your PR (see "Staying in sync").
4. State the branch and worktree you are using as a fact in your plan; do not ask Jeff to pick.
   This task is multi-file and touches auth, so it lands as a dedicated branch + PR into
   `develop`, no auto-merge. Jeff merges.

CONTEXT
Golf tournament desk for Iloilo Golf & Country Club (IGCC), built by Syntaxure Labs. Read, in
order: AGENTS.md -> docs/PLAN.md -> docs/spec/IGCC_Tournament_Desk.md -> the code you change.
If the plan and the code disagree, trust the code and tell Jeff.

Today every screen reads `useDesk()` from `src/lib/store/desk-store.tsx`, an in-memory reducer
seeded from `src/lib/demo/data.ts`. A page refresh resets everything. PLAN.md section 8 step 1
("Database connection") is this task. The schema already exists in
`supabase/migrations/20261017000000_init.sql` (14 tables, RLS on all, `is_club_member()`,
`public_pairings()` security-definer function, private `player-photos` bucket). It has been tested
on a throwaway Postgres 16 but NEVER applied to a real Supabase project.

The routing engine (`src/lib/routing`) and draw checks (`src/lib/draw`) are pure functions with
101 passing tests. They stay pure: no I/O inside them, ever.

THE CONTRACT WITH THE FRONTEND (read twice)
The UI redesign and your data work meet at exactly one seam: the `Desk` value returned by
`useDesk()` and the types it exposes (`DeskPlayer`, `DrawGroup`, `Published`, `PublishedGroup`,
`Registration`, `TournamentConfig`). The redesigned screens consume that and nothing else.

- KEEP every existing field and action of `Desk` with the same name and meaning:
  `state.{name, config, players, draw, drawWarnings, published, importedCount}`, `registrations`,
  `regById`, `unplaced`, `isPublished`, `changedSincePublish`, `playerById`,
  `names.{category, flight, tee}`, `classify`, and `dispatch` with the action types
  `addPlayer | removePlayer | updatePlayer | setConfig | applyImport | generate | move | lock |
  publish | unpublish`. Screens call these today and will keep calling them.
- ADDING fields is fine and expected. Add these, all optional so the demo still compiles:
    status: "loading" | "ready" | "error";  error?: string | null;
    member?: { displayName: string; role: "owner" | "organizer" | "desk" } | null;
    lastSavedAt?: string | null;   // ISO; drives the "Last saved 2:14 PM" label
    saving?: boolean;
  Writes may become async internally; `dispatch` keeps its signature (fire and forget, optimistic
  update, roll back and set `error` on failure).
- RENAMING or REMOVING any existing field, action or exported type: stop and ask Jeff first.
- Demo mode must keep working with no env vars set: if `NEXT_PUBLIC_SUPABASE_URL` is missing,
  `DeskProvider` falls back to the current in-memory demo exactly as today. The redesign is being
  built and reviewed against demo data.

FILE OWNERSHIP (prevents merge conflicts between the two branches)
You own and may edit:
  src/lib/store/**            (desk-store internals; keep the contract above)
  src/lib/supabase/**         (new: browser and server clients, typed with generated DB types)
  src/lib/data/**             (new: repository functions per table, mappers DB row <-> app type)
  src/lib/auth/**             (new: session helpers, server actions for sign-in / sign-out)
  src/proxy.ts                (Next.js 16 renamed middleware to proxy; check
                               node_modules/next/dist/docs before writing it)
  src/app/auth/**             (route handlers only, e.g. the auth callback; no UI)
  supabase/**                 (new migrations only, after Jeff approves; never edit the init file)
  .env.example, README.md "Run" section
  src/lib/demo/**             (only to keep demo mode working)
  tests for all of the above
You do NOT edit (the frontend branch owns them):
  src/app/**/page.tsx, src/app/**/layout.tsx, src/app/globals.css, src/components/**,
  public/**, components.json, any Tailwind or shadcn config, src/lib/course/**, src/lib/ui/**
Exception: you need a login screen. Create `src/app/(auth)/login/page.tsx` as a thin page that
renders a server-action form with plain semantic markup and no custom styling (label, email,
password or magic-link button, error text). The frontend agent will restyle it after both
branches merge. Tell Jeff in your report that it is unstyled on purpose.
`package.json` / `pnpm-lock.yaml` are shared: add your dependencies in ONE commit
(`@supabase/ssr` and nothing else unless you ask). On a lockfile conflict during rebase, take
develop's lockfile and re-run `pnpm install`; never hand-edit the lockfile.

SCOPE
J-Akiru5/golf-management-system-sl, worktree ../golf-management-system-sl-data, branch
feat/supabase-data. Next.js 16 App Router, React 19, strict TypeScript (noUncheckedIndexedAccess),
supabase-js (no Prisma), Biome, Vitest, pnpm.

STEPS
1. Workspace: do SESSION SETUP above. Record the green baseline test count.
2. Plan check: restate your approach in 2-3 sentences (branch + worktree included, as a fact) and
   list any schema change you think you need. Wait for Jeff's go-ahead on the schema list.
3. Clients: `src/lib/supabase/client.ts` (browser) and `server.ts` (server components / actions)
   using `@supabase/ssr` cookies. Read `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` only; the service role key never reaches the browser bundle and
   is not needed by the app at all (club and membership rows are created during onboarding).
   Update `.env.example` with names only, no values.
4. Types: generate DB types (`supabase gen types typescript`) into `src/lib/supabase/types.ts`
   if a project is linked; if not, write them by hand from the migration and say so.
5. Auth: organizer sign-in (email magic link or password; ask Jeff which before building),
   sign-out, session refresh in `src/proxy.ts`, and a guard so the desk routes require a
   `club_members` row. The public pairings route `/pairings` stays public and reads only through
   `public.public_pairings(tournament_id)`.
6. Repositories in `src/lib/data/`: players, handicap_records, tournaments (+ categories,
   flights, tees, holes for setup), registrations (with `frozen_index`), groups + group_members,
   and the published snapshot. Every query is scoped by `club_id`; rely on RLS, do not bypass it.
   Pure mapper functions (row -> `DeskPlayer`, etc.) get unit tests.
7. Store swap: inside `DeskProvider`, load the active tournament for the member's club, map rows
   into the existing `DeskState`, and turn each action into a repository write with an optimistic
   update. `generate` still calls the pure `route()`; persist its groups. `publish` writes the
   frozen snapshot; players never read the live board. Keep the demo fallback when env vars are
   absent.
8. Photos: upload to the private `player-photos` bucket under `{club_id}/`, signed URLs for the
   desk only, and only when `photoConsent` is true. Never on `/pairings`.
9. Tests: mapper tests, a test that the demo fallback still produces the same `Desk` shape, and
   keep all 101 existing tests green. Do not weaken or delete a test.
10. Staying in sync: before opening the PR, `git fetch` and check whether `feat/clubhouse-ui` has
    merged into develop. If it has, `git rebase origin/develop`, re-run
    `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, and fix only on your side of the
    ownership line. If a redesigned screen fails to compile because of your change, fix the data
    side, not the screen, and tell Jeff.
11. Report, push the branch, open a PR into `develop` (no auto-merge). Do not merge.

FRONTEND REQUESTS (do NOT build without Jeff's yes; each needs a schema or rule decision)
The redesigned control room has panels that currently show honest empty states because no data
exists for them. List these in your plan and ask Jeff which, if any, belong in this task:
- Activity log ("Carmela Reyes -> Hole 12A, moved by Pro shop"): needs an `activity` table.
- Hole map coordinates per course (where each hole's pin sits on the course image): needs
  columns on `holes` or a `course_layouts` table. Today the frontend ships static JSON for one
  illustrated placeholder hole in `src/lib/course/`.
- Member display name and role for the top bar: may fit in `club_members`; check the migration.
- Player history for the clubhouse spotlight (rounds, scoring average, member since, club
  record): Phase 2 territory; probably "not now".

CONSTRAINTS
SESSION GROUND RULES
- Before writing any code, inspect the repo (`git fetch --all`, `git branch -a`,
  `git worktree list`, `git status`) to find an in-flight branch or worktree for this task and
  any conflicting work, then use the dedicated worktree described above and state it. Do not
  ask Jeff to pick the branch strategy.
- Before any critical or irreversible decision, stop and ask Jeff first instead of guessing:
  applying a migration to any real Supabase project, creating a Supabase project, any schema or
  RLS change, the sign-in method, changing a confirmed golf rule (PLAN.md section 3), renaming or
  removing anything in the `Desk` contract, deleting data or branches, adding infrastructure.
  A wrong guess costs him more time than a question.
- Restate in 2-3 sentences how you plan to approach this, including the worktree and branch you
  decided on (as a fact), and confirm it matches what Jeff intended before writing code.
- After Jeff gives feedback on that direction check, do not just apply it literally: if his
  feedback points to a better way to get what he wants, propose it and explain the tradeoff.
- When done, generate a rich standalone HTML docs report (spec below) and save it to `docs/`.

Project rules (AGENTS.md, non-negotiable):
- Golf rules are tournament settings; never hard-code them.
- Never guess data. A player who cannot be routed is `needs_review`, not given a default.
- Players only see the frozen Published snapshot, never the live board.
- Photos only where consent is recorded. Never on public pages.
- Tee numbers in demo and tests are placeholders; do not present them as IGCC's real ratings.
- No external font or script calls.
- Run `pnpm typecheck && pnpm lint && pnpm test` before every commit.
- Plain language in docs and commits. No marketing words.
- Do not touch files on the frontend side of the ownership line. Do not modify or delete the
  main checkout or the `feat/clubhouse-ui` branch. Do not remove your worktree; Jeff does that
  after merging.
- No secrets in commits, logs or the report. `.env.local` stays untracked.

OUTPUT
- Branch `feat/supabase-data` pushed, PR open into `develop`, not merged.
- `docs/supabase-data-layer-<YYYY-MM-DD>.html`: a single standalone HTML file, no build step,
  bundled system fonts only (no external calls). Base it on `docs/_templates/report-template.html`
  if that file exists; otherwise use a calm dark layout (charcoal background #171c19, ivory text
  #eef0ea, gold accent #e0bc65, forest #183f30) to match the club's design system. Contents, in
  order: one-paragraph summary; worktree and branch used and why (one line); the `Desk` contract
  as delivered (fields added, nothing removed); files touched grouped by folder; every question
  asked of Jeff mid-task and what he decided; schema changes (if any, with the migration name);
  what is still demo-only; how to run it locally; what is next.
- A short final message: PR link, test count before and after, anything the frontend agent must
  know after the rebase.
````
