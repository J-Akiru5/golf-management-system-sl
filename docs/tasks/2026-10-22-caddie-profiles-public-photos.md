# Task: caddie profiles, public player photos, player editing and audit visibility

**Task ID:** `2026-10-22-caddie-profiles-public-photos`
**Branch:** `feat/caddie-profiles-public-photos`
**Worktree:** `S:\Dev\Next.js\golf-management-system-sl-caddie-photos`
**Base:** `origin/develop` `69c1f35` (release 0.23.1)
**Owner request:** caddie profiles; player photos beside names on the flight schedule, public
pairings/matching and a leaderboard; admin editing of player details; every action logged.

## Owner decision this depends on

The project rule was "photos only where consent is recorded; never on public pages". The owner has
now asked for consented player photos on public pages. The implementation therefore adds a **separate
public-display consent**:

- `photo_consent_at` remains the internal use consent (check-in, desk profile, posters).
- `photo_public_consent_at` is required before any photo is copied to the public bucket or returned by
  a public projection.
- Existing internal consent does **not** become public consent automatically. Players must opt in.
- Withdrawal removes the public copy and clears the public path. The private original remains subject
  to the existing consent.
- `AGENTS.md`, the spec, `docs/PLAN.md` and the privacy copy are updated to the new rule.

No private original is ever served publicly, and a public page never receives a player's private
path, contact, birthdate or handicap.

## Workstreams

1. **Database (one additive migration, next free version after `20261038000000`)**
   - `players.photo_public_path`, `players.photo_public_consent_at`.
   - Public bucket `player-photos-public`, public read, staff write, path `{club_id}/{player_id}/…`.
   - `caddies` profile table and `caddie_assignments` anchored to `registration_days` (not groups,
     because `save_draw` replaces groups).
   - Audit triggers on caddies and assignments; `updated_at` triggers.
   - RLS: caddies read all staff, manage owner/organizer; assignments read all staff, write staff;
     audit already owner/organizer read.
   - `public_pairings` returns `player_id` and a public photo path only when public consent is on.
     Older published snapshots without ids remain names-only.
   - `publish_pairings` stores `playerIds` alongside names.
   - `build_round_snapshot` adds `playerId` to gross and net rows.
   - New `public_published_rounds()` and `public_player_photos(uuid[])` functions for the public
     leaderboard and its photos.
   - Guarded `assign_caddie` function.

2. **Player editing and photos**
   - Fix the live adapter: `players.update` must persist photo fields; `players.add` must upload the
     image before writing a consent timestamp.
   - Add a full edit sheet on the player profile for name, nickname, birthdate, gender, contact,
     email, home course, NGAP/WHS and membership.
   - Add the public-display consent checkbox, upload the public derivative, and remove it on
     withdrawal.
   - Admin-only UI gate for edit/delete; the database remains the enforcement.

3. **Caddie profiles**
   - `/caddies` list, add/edit sheet, active state, contact and notes.
   - Caddie select on `/tee-times` per player/day; one active caddie per registration day and one
     active player per caddie per day.
   - Audit every create/edit/assignment.

4. **Public and printed photos**
   - Start sheet (the flight schedule) shows a small avatar beside each name.
   - `/pairings` shows avatars only for public-consented photos, with initials otherwise.
   - New `/leaderboard` page lists published rounds and shows the gross/net board with avatars.
   - Print scorecards can follow the start-sheet pattern; print CSS keeps the image small and
     grayscale-safe.

5. **Audit visibility**
   - `/audit` owner/organizer page with date, actor, action, entity, record, changed columns and batch
     id; paged and filterable.
   - No audit UI for the desk; the database RLS already restricts reads to owner/organizer.

6. **Tests and docs**
   - Photo eligibility/redaction, public photo URL, public pairings mapping, start-sheet avatars.
   - Caddie assignment validation and audit trigger.
   - Player edit validation and photo persistence/withdrawal with a fake client.
   - Public leaderboard snapshot mapping.
   - Update `AGENTS.md`, spec/PLAN/privacy, task record and CHANGELOG (0.24.0 MINOR, migration).

## Acceptance criteria

1. A player photo selected at the desk is stored, survives a reload and is signed for staff only.
2. No public surface shows a photo without `photo_public_consent_at`; withdrawal removes it.
3. Start sheet, `/pairings` and `/leaderboard` show a small avatar beside the name where allowed.
4. A caddie can be created, edited and assigned to a player's day; the assignment survives a draw
   re-run and is audited.
5. An admin can edit all agreed player fields; the before/after column names are in `audit_log`; a
   desk account cannot use the edit/delete controls, and the API refuses where RLS says so.
6. Typecheck, lint, tests and build pass; the migration is written and not applied without owner
   approval.

## Current evidence and gaps from reconnaissance

- The live adapter never writes `photo_path`/`photo_consent_at`; photos are session-only. The parked
  `persist.ts` path is unused.
- Public pairings and results carry names only; no player id or public photo path.
- There is no public leaderboard/results page.
- There is no caddie table; only a demo "Caddie request" registration field.
- Player create exists; core fields cannot be edited after creation.
- `audit_log` triggers exist for players, memberships, days and registrations, but there is no reader
  UI and no caddie/assignment coverage.
- `save_draw` replaces groups, so caddie assignments must not reference `group_id`.

## Checks to run

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- Browser checks for `/tee-times`, `/caddies`, `/audit`, `/leaderboard` and `/pairings`.
- SQL verification in a branch project before applying the migration; production application is a
  separate owner-approved step.

## Verification record (22 Oct 2026)

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Pass |
| `pnpm lint` | Pass |
| `pnpm test` | Pass, 79 files / 786 tests |
| `pnpm build` | Pass, Next.js production build; `/caddies`, `/audit` static, `/leaderboard` dynamic |
| Demo browser checks | Pass, 13/13 in `scripts/verify-caddie-photos-ui.mjs` (`/caddies`, player editor, caddie assignment, `/audit`, `/leaderboard`, `/pairings`; no console errors) |
| Existing browser suite | Pass, 90/90 in `pnpm verify:ui`; no console errors |
| Migration syntax | Formatted/parsed by `sql-formatter`; not executed against PostgreSQL |
| Production migration | **Not applied**; no production evidence claimed |
| Connected staff click-through | Not possible in this session; preview deployments are protected |

## Applying the migration (owner)

1. Take a backup or confirm the project's point-in-time recovery window.
2. Run `supabase/migrations/20261039000000_caddies_public_photos.sql` in the Supabase SQL editor on
   the intended project. The script is additive and has a self-check at the end.
3. Verify:
   - `players.photo_public_path` and `players.photo_public_consent_at` exist.
   - `caddies` and `caddie_assignments` exist, with RLS enabled.
   - `storage.buckets` has `player-photos-public` with `public = true`.
   - `public_pairings`, `public_published_rounds`, `public_player_photos`, `assign_caddie` and
     `set_player_membership` exist and have the intended grants.
   - `public_pairings` returns `player_id` and `photo_path`, and a photo path is null unless
     `photo_public_consent_at` is set.
4. Deploy the code that expects these columns only after the migration is recorded.
5. Republish the current pairings/round so new snapshots carry player ids and can show photos. Older
   snapshots remain names-only and are intentionally safe.

Rollback: the migration adds objects only. The code can be rolled back independently. Removing the
public bucket or setting it private turns public photos off immediately; do not delete player data.

## Blockers / handoff

- Real production course/tee data and the roster import remain separate owner actions.
- The migration must be reviewed and applied by the owner; this branch does not apply it.
- No deployment to `main` is part of this task.
- Connected browser checks need a staff account and a non-protected environment.

## Remote state at handoff

- Branch `feat/caddie-profiles-public-photos` was pushed to `origin` at commit `58e74ab` (this record
  then adds one docs commit; use the branch head).
- Pull request: https://github.com/J-Akiru5/golf-management-system-sl/pull/95 (base `develop`, open).
- Nothing was merged into `develop` or `main`.
- No tag was created. The owner creates and pushes `v0.24.0` only after review and merge.
- No Vercel deployment was triggered. The branch is deployment-ineligible under `vercel.json`.
- `VERSION` and `package.json` are both `0.24.0`; `CHANGELOG.md` has the 0.24.0 section.
- `node scripts/release-check.mjs --tag v0.24.0` could not run because this repository does not
  contain that script. Do not tag until the owner's release check is satisfied.
