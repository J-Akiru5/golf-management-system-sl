# Project intent: TeeLine Golf (IGCC Tournament Desk)

Status date: 8 November 2026. Repository `golf-management-system-sl`, integration branch
`develop`, HEAD `83fa154`.

## What this is

Golf tournament management for Iloilo Golf & Country Club (IGCC), built by Syntaxure Labs. The
organizer adds players; the system routes each one to a category, tee, flight, group and start slot;
the organizer reviews, overrides and publishes; players read their pairings on a phone. The product
is multi-tenant ready (`club_id` on every table) with IGCC as the only club.

## Source of truth

Read in this order, and prefer the earlier entry when they disagree.

1. The code and tests in this repository.
2. `docs/PLAN.md` for status, gaps, roadmap and open decisions.
3. `docs/spec/IGCC_Tournament_Desk.md` for the confirmed rules and the build spec.
4. This plan for task intent, ownership and verification.

`docs/audit-scheduling-2026-11-08.md` is the evidence for the scheduling findings. GitHub issues
#174 to #184 track them.

## Verified state on 8 November 2026

- `develop` is clean and level with `origin/develop` at `83fa154`. The working tree has no product
  code changes from this initialization.
- The scheduling follow-up is merged in code: a round per playing day, a day-aware draw, publishing
  that keeps every day, per-day portal starts, a per-day afternoon start, a save that names its
  round, per-day unplaced alerts, day-aware Tee times, reload-safe day selection, and routing guards
  for impossible fields.
- **The applied state of the 8 November migration stack is contradictory.** The files are
  `20261108000100_open_round.sql`, `20261108000200_notification_single_read.sql`,
  `20261108000300_player_self_profile.sql`, `20261108000500_rounds_per_playing_day.sql`,
  `20261108000600_public_pairings_by_day.sql`, `20261108000700_portal_starts_by_day.sql`,
  `20261108000800_day_pm_start.sql`, `20261108000900_save_draw_requires_day.sql` and
  `20261108001000_notifications_per_day.sql`. The file headers and `docs/PLAN.md` say they are not
  applied. The 0.28.0 changelog reports the first six as applied by the owner on 8 November, not
  independently checked. The follow-up section records the last three as not applied. The live
  ledger has not been read from this machine because there is no linked Supabase CLI state and no
  `.env.local`. T-0001 starts by reading it; until then the per-day flow is a code path and a
  document, not a proven workflow.
- Open scheduling findings that the follow-up did not close: C13 (a locked group from another day
  can duplicate a hole and time), C14 (two-tee starts ignore AM/PM session times), C7 and C8
  (calendar conflict normalisation and sparse dates), and D3 (the parked legacy writer still saves
  without a round).
- Scoring is merged in code and `open_round` is in the unapplied `20261108000100`. The scorecard
  scan path cannot register a card until that migration is applied and the round settings are
  confirmed.

## Milestone M1: first IGCC event readiness

The milestone file is `plan/milestones/M1-first-event-readiness.md`. Task contracts:

| Task | Scope | State |
| --- | --- | --- |
| T-0001 | Reconcile the live migration ledger and apply only what is missing | Blocked on owner authorization |
| T-0002 | Verify per-day draw, save, publish and portal end to end | Blocked on T-0001 |
| T-0003 | Release stale-day locks and honour AM/PM starts in two-tee routing | Ready |
| T-0004 | Normalise calendar conflicts and sparse dates | Ready |
| T-0005 | Retire or align the parked legacy draw writer | Ready |
| T-0006 | Exercise `open_round` end to end and record the scoring setup | Blocked on T-0001 |

## Milestone M2: player experience and media storage

The milestone file is `plan/milestones/M2-player-experience-and-media.md`. These contracts come from
issues #185, #186 and #187, opened on 8 November 2026. They are queued behind M1 and do not change
an M1 rule or a live migration.

| Task | Issue | Scope | State |
| --- | --- | --- | --- |
| T-0007 | #185 | Add a dedicated public roster that filters by flight and excludes pairings and private data | Ready |
| T-0008 | #186 | Build the player scorecard view and the pure team-format engine; live player writes stay owner-gated | Ready |
| T-0009 | #187 | Generalise Cloudflare R2 storage for media and documents | Ready |

Work that is real but not yet contracted belongs in a new contract through the amendment workflow;
do not stretch an existing contract to cover it.

## Owner gates

These are not agent decisions. Stop the blocked action and continue unrelated work.

- **Applying migrations to the live Supabase project.** Owner authorization is required. The
  Supabase CLI account on the build machine has previously received a 403 on project
  `egfwfyznbndunqfqzxjx`.
- **Real IGCC course, tee and hole data.** Needs the club scorecard, Course Rating, Slope, Par and
  stroke index per tee and hole. Placeholder numbers are not safe for a real draw.
- **NGAP export.** The importer is mapping-based because no real export has been seen.
- **Accounts and access.** Rotate the two test staff accounts, add the golf pro as `organizer`,
  decide whether player sign-ups are open, and create one real player account before the event.
- **Deployment configuration.** See the note below.

## Deployment note

The repository's `vercel.json` enables deployments for `main` and `staging` and disables them for
`develop` and every other branch. That file is the rule for this repository, and the "Deploy policy" step in CI
fails if it is loosened. `plan/policy.yaml` records the same allowlist. Global rules that name other
branches do not apply here. Do not change `vercel.json`, do not deploy to test the policy, and ask
the owner before re-enabling any branch. Agents never run `vercel deploy`,
`promote`, `redeploy` or `rollback`.

## How work happens

- One task, one worktree, one branch. Claim the contract with `agentctl claim` before editing.
- `src/lib/routing` and `src/lib/draw` are pure functions. No I/O there. Add tests with every change.
- Golf rules are tournament settings, never hard-coded engine constants.
- A player who cannot be routed is `needs_review`, never given a default.
- Players see only the frozen `Published` snapshot, never the live board.
- Photos follow the internal-consent and separate public-consent rules; the private path is never
  served publicly.
- Run the contract's verification profile before submit. For code that is `unit`; for a release
  candidate or a broad change it is `full`.
- Do not weaken or delete a test to make it pass.
- Migrations are owner-gated in this repository. The policy leaves `database.dev_project_ref` and
  `database.migrate_command` unset so `agentctl db push` refuses rather than guessing a target.

## Initialization record

- `agentctl init` created `plan/milestones`, `plan/tasks`, `plan/amendments`, `plan/evidence` and
  `knowledge/decisions`.
- `pnpm install --frozen-lockfile` completed. `pnpm-workspace.yaml` records the build-script
  decision: `esbuild` may run its install script, `core-js` may not.
- `vitest.config.ts` now resolves the `@/` alias with `fileURLToPath` instead of `URL.pathname`.
  The old form produced a leading-slash, percent-encoded path on Windows and failed 49 test files
  when the checkout path contained a space, as this one does (`Teeline Golf`).
- Baseline verification results are recorded below.

### Baseline checks

Verified on 8 November 2026 against `develop` plus this initialization:

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass, exit 0 after the build-script decision |
| `pnpm typecheck` | Pass, exit 0 |
| `pnpm lint` | Pass, exit 0, 568 files checked |
| `pnpm test` | Pass, exit 0, 146 files and 1479 tests |
| `pnpm build` | **Deferred**, not run. The resource check reported red at 1.3 GB free of 15.2 GB; the protocol forbids starting a heavy build under that pressure. Re-run before a release candidate. |
