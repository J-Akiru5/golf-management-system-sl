# Brief: scan inbox data layer, no screens (step 4, data side)

You are a builder. Work only in this worktree (branch `agent/scan-inbox-data`). Do not push, merge,
deploy, apply a migration or touch any other branch. Read `AGENTS.md` first and follow it. Then read
`docs/tasks/2026-11-13-batch-scan-verify.md` (decisions D1 to D8, the flow and step 4),
`supabase/migrations/20261113000100_scorecard_scans.sql` (the table, the state rules and the seven
functions) and everything in `src/lib/scoring/inbox` (`types.ts`, `state.ts`, `readiness.ts`,
`markers.ts`, `batch.ts`, `suggest.ts`) plus `src/lib/scoring/match`.

## Why

The scan inbox holds photographed cards that are not scorecards yet. Its rules are pure functions and
its SQL is written but **not applied** (the owner approves the migration by name; nothing here may
be applied to any database). This slice adds the data layer the future screens will call. No screen
is built here.

## Scope

New files, with tests beside them:

- `src/lib/data/scan-inbox.ts`: the `ScanInboxRepository` interface, its input and view types, and
  `createDemoScanInboxRepository(...)`, an in-memory implementation that follows the same state rules
  by calling `applyScanEvent` from `src/lib/scoring/inbox`, so demo mode can run the whole flow.
- `src/lib/data/supabase/scan-inbox.ts`: `createSupabaseScanInboxRepository(...)`, calling the seven
  functions of the unapplied migration through the Supabase client (`create_scorecard_scan`,
  `record_scan_reading`, `match_scorecard_scan`, `confirm_scorecard_scan`,
  `set_aside_scorecard_scan`, `restore_scorecard_scan`, `attach_scan_card`) and reading
  `public.scorecard_scans` with `select("*")`.
- `src/lib/data/scan-inbox.test.ts` and `src/lib/data/supabase/scan-inbox.test.ts` in the style of
  `src/lib/data/scoring.test.ts` (the fake Supabase client).

Also edit, by hand, `src/lib/supabase/generated-types.ts`: add the `scorecard_scans` table (Row,
Insert, Update, Relationships) and the seven functions (Args and Returns), matching the migration
exactly, because the migration is not applied and the types cannot be regenerated. Change nothing
else there.

Register the repository where the scoring repository is created **only if that is a small addition**
(a few lines in the same factory or provider). Do not wire it into any screen. Do not touch
`ScoresDesk.tsx`, `ScorecardWorkspace.tsx`, `ScorecardHoleGrid.tsx`, any SQL file, the engine files
under `src/lib/scoring` (read them, call them, do not edit them), `scripts/verify-ui.mjs` or the
pick-up code. If you need a change elsewhere, stop and say so.

## What the repository does

All methods take the tournament id and day number the way `src/lib/data/scoring.ts` does, return a
fresh inbox view after a write, and throw an `Error` with a plain message when a step is refused.
Read `src/lib/data/scoring.ts` for the conventions (view shape, error wording, how `club_id` and the
round are resolved) and copy them.

- `list(tournamentId, day)`: the inbox rows for the round as `ScanRecord`s (see
  `src/lib/scoring/inbox/types.ts`), newest first, including a computed readiness (`scanReadiness`)
  and, for a scan that has a reading, up to four suggestions from `suggestForScan` using the round's
  players (take them from the scoring view the same way `scoring.ts` does; do not add a new query).
- `upload(tournamentId, files, day)`: each file is `{ path, sha256, mime, bytes }`, already uploaded
  to storage by the caller. Use `planBatchUpload` to drop duplicate photos in the batch and photos
  already in the inbox, then call `create_scorecard_scan` for each new one. Return which were added
  and which were skipped as duplicates, with the reason in words.
- `recordReading(tournamentId, scanId, reading, day)`: `record_scan_reading` with the reader's name,
  written total, holes (a pick-up as `strokes: 0` and `picked_up: true`, the shape the migration
  documents) and the candidate list from `suggestForScan`.
- `match(tournamentId, scanId, playerId, day)`, `clearMatch`, `confirm(tournamentId, scanId, markerId,
  day)`, `setAside(tournamentId, scanId, reason, day)`, `restore(tournamentId, scanId, day)`,
  `attachCard(tournamentId, scanId, cardId, day)`: one method per function, each checking the move
  first with `applyScanEvent` so the demo and the real implementation refuse the same moves for the
  same reasons. `clearMatch` is the `matched -> read` move, which the migration does through
  `match_scorecard_scan` with a null player; read the migration to see exactly how.
- `assignMarker(tournamentId, scanId, day)`: pure read helper using `markerCandidates`: returns the
  assigned marker id or the reason none was assigned. D6: the marker is the player from the other team
  in the group, assigned by the app, and the desk can change it through `confirm`. With several
  candidates take the first in group order; fill nothing when the order is unknown. This is a
  suggestion; it must not write.

A scan never becomes a scorecard here: `attachCard` only links a card the desk created through the
existing `submitCard`. No method approves anything.

## Tests (required, Vitest)

- Demo repository: upload with a duplicate photo in the batch and one already in the inbox; record a
  reading; match, confirm with a marker, attach a card; set aside from `read` and restore (returns to
  `read` when a reading exists, to `uploaded` when not); a refused move (for example confirm on an
  `uploaded` scan, or any change after `card_created`) throws with the state rule's message; the
  assigned marker for one, several and zero other-team candidates and for an unknown group order.
- Supabase repository, with the fake client: each method calls exactly the right function with the
  right argument names and no extra keys; `list` maps rows to `ScanRecord` with nulls, never
  `undefined`; a function error becomes a plain-language `Error`; `upload` sends nothing for a
  duplicate.
- Do not weaken or delete any existing test.

## Rules to respect

- Strict TypeScript with `noUncheckedIndexedAccess`, no `any`, no new dependency. Plain language in
  messages and comments, no em-dash pile-ups, no marketing words.
- Never guess data: no default player, no default marker, no invented reading.
- No clock in pure code: pass timestamps in, as `src/lib/scoring/inbox` does.
- The migration is not applied, so nothing here runs against a real project. Say so in the file
  header comment of `supabase/scan-inbox.ts`.
- Do not run `pnpm build` or `pnpm check:ui`.

## Done means

```bash
pnpm typecheck && pnpm lint && pnpm test
```

All three must pass; report the actual output. If lint reports formatting only, run
`pnpm exec biome check --write src` on the files you changed and run the three again. Commit with one
plain subject line and stop. Do not push. In your final message list the files changed, the tests
added, every judgment call, and anything outside the scope you found.
