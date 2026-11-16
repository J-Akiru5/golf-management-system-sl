# Brief: scan inbox logic (step 4b, pure TypeScript only)

You are a builder. Work only in this worktree (branch `agent/scan-inbox-logic`). Do not push, merge,
deploy, apply a migration or touch any other branch. Read `AGENTS.md` first and follow it. Then read
`docs/tasks/2026-11-13-batch-scan-verify.md` (step 4 and the decisions D1 to D8), and the code you
will build on: `src/lib/scoring/match/match-player.ts` (the name matcher: `matchPlayers`,
`CardReading`, `RoundPlayer`, `MatchCandidate`) and `src/lib/scoring/scan/types.ts` (what the card
reader returns today).

## Why

The owner scans a batch of paper cards. Each image becomes a **scan** that is not yet a scorecard.
The system reads it and suggests players; the desk picks the player, picks the marker and confirms;
then a card is created. A parallel builder is writing the SQL table `scorecard_scans` and its
functions; the state machine below is the contract between the two, so follow it exactly. Owner
decisions (13 Nov): the system suggests and the desk confirms (D2); the marker is a player from
another team in the same group, picked by the desk (D6); confirming is the approval step (D7).

## Scope

New folder `src/lib/scoring/inbox/` and its tests, nothing else. Files: `types.ts`, `state.ts`,
`readiness.ts`, `markers.ts`, `batch.ts`, `suggest.ts`, `index.ts` and one `*.test.ts` per module.
Pure functions: no I/O, no React, no Supabase, no `Date.now()` (take the time as an argument). Import
from `../match` for the matcher types. Do not edit any existing file. If you find a change is needed
outside the folder, stop and say so in your report.

## The state machine (the contract)

States: `uploaded`, `read`, `matched`, `confirmed`, `card_created`, `set_aside`.

```
uploaded -> read -> matched -> confirmed -> card_created
read -> read (re-read)            matched -> matched (other player)     matched -> read (clear)
confirmed -> matched (reopen: match again)
uploaded|read|matched|confirmed -> set_aside -> read|uploaded (restore: read if a reading exists)
card_created is final.
```

Facts that must hold for each state (the SQL enforces the same):

- `uploaded`: no reading, player, marker, confirmation or card.
- `read`: has a reading (a name or holes) and a read time; no player, marker, confirmation or card.
- `matched`: has a player; no confirmation, no card. The marker may not be set yet.
- `confirmed`: player, marker, `confirmedBy` and `confirmedAt` set; no card. Player is not the marker.
- `card_created`: player, marker, `confirmedBy` and `scorecardId` set.
- `set_aside`: reason (3 or more characters after trim), `setAsideBy`, `setAsideAt`; no card.

## Parts

1. **`types.ts`**: `ScanState`, `ScanReading` (`engine`, `engineVersion`, `name`, `writtenTotal`,
   `holes: {hole, strokes: number | null, pickedUp?: boolean, confidence: number | null}[]`, `readAt`),
   `ScanSuggestion` (`playerId`, `score`, `reasons`; copy the fields of `MatchCandidate`), `ScanRecord`
   (id, roundId, state, image `{path, sha256, mime, bytes}`, `reading: ScanReading | null`,
   `suggestions: ScanSuggestion[]`, `playerId`, `markerId`, `confirmedBy`, `confirmedAt`,
   `scorecardId`, `setAside: {reason, by, at} | null`), and the event type below. Use `null`, not
   `undefined`, for "not set".
2. **`state.ts`**: `applyScanEvent(scan, event): { ok: true; scan: ScanRecord } | { ok: false; code; message }`.
   Events: `record_reading`, `match` (player id or `null`), `confirm` (marker id, `by`, `at`),
   `set_aside` (`reason`, `by`, `at`), `restore`, `attach_card` (card id and the card's player id).
   Every transition not in the diagram returns `ok: false` with a stable `code` (for example
   `not_allowed_from_state`, `marker_is_player`, `reason_too_short`, `card_player_mismatch`) and a
   plain-language message for the desk. It never mutates its input and never throws. `match` clears
   marker and confirmation, as in the SQL.
3. **`readiness.ts`**: `scanReadiness(scan)` returns `{ canConfirm: boolean; canCreateCard: boolean;
   blockers: ScanBlocker[]; warnings: ScanWarning[] }`. A blocker has a code and a plain message:
   no player picked, no marker picked, marker is the player, no image, scan set aside or already a
   card. A warning does not block: the picked player already has a card (pass `playersWithCards` as
   an argument), the written total was not read, some holes were read at low confidence (take the
   threshold as an argument, default 0.6 as a named exported constant), the reader name and the
   picked player's name differ strongly. Do not hard-code golf rules.
4. **`markers.ts`**: `markerCandidates(playerId, players)` where each player is `{ playerId, name,
   group: string | null, teamId: string | null }`. Per D6 the candidates are the players in the same
   group as `playerId`, excluding the player, and excluding players known to be on the same team.
   Rules: if the player has no group, return `{ candidates: [], reason: "no_group" }`; if the player
   or a candidate has no team, **keep** the candidate and mark it `teamKnown: false` (never guess a
   team); only drop someone when both teams are known and equal. Return plain-language reason text.
   Order: known other-team first, then unknown-team, each by name.
5. **`suggest.ts`**: `suggestForScan(reading, players, options?)` maps a `ScanReading` to a
   `CardReading` (name only; tee, handicap and group are not read today and must stay absent), calls
   `matchPlayers`, and returns `ScanSuggestion[]`. If the reading has no name it returns `[]`. It never
   picks a player.
6. **`batch.ts`**: `planBatchUpload(files, existing)` where `files` are `{ name, sha256 }` and
   `existing` is a list of sha256 values already in the inbox. Returns `{ toCreate, duplicates }`:
   a file whose hash is in `existing`, or repeats an earlier file in the same batch, is a duplicate
   (say which earlier file or "already in the inbox"). Keep the input order. Hashes compare
   case-insensitively and must be 64 hex characters; a bad hash goes to a third list `invalid`.
7. **`index.ts`**: re-export the public API.

## Tests (required, Vitest)

At least these, each as its own `it`:

- every legal transition in the diagram, and an illegal one from each state;
- `confirm` with marker equal to player fails; `confirm` from `read` fails; `attach_card` with a card
  for another player fails; `card_created` accepts nothing but is not an error to read;
- `set_aside` with a 2-character reason fails; `restore` goes to `read` when a reading exists and to
  `uploaded` otherwise;
- `match` with a new player clears marker and confirmation; `match` with `null` returns to `read`;
- `applyScanEvent` does not change its input (deep-freeze the input in the test);
- readiness: each blocker, each warning, and a clean scan with none; duplicate-card warning uses
  `playersWithCards`;
- markers: same group other team first; same team dropped only when both teams are known; unknown
  team kept and flagged; no group gives an empty list with `no_group`; the player is never a
  candidate;
- `suggestForScan`: the Day 1 misreads "Wormley" for GORMLEY and "Um" for LIM each return the right
  player first; an empty name returns `[]`;
- `planBatchUpload`: duplicate in the batch, duplicate against existing, mixed-case hash, bad hash.

## Rules to respect

- Strict TypeScript with `noUncheckedIndexedAccess`, no `any`, no new dependencies.
- Never guess data: a missing team, group, total or reading stays missing; do not default it.
- Do not weaken or delete any existing test. Plain language in comments and messages, no em-dash
  pile-ups, no marketing words.

## Done means

```bash
pnpm typecheck && pnpm lint && pnpm test
```

All three must pass; report the actual output. If lint reports formatting only, run
`pnpm exec biome check --write src/lib/scoring/inbox` and run the three again. Commit with one plain
subject line and stop. Do not push. In your final message list the files, the tests added, every
judgment call, and anything outside the folder that also needs changing (the data layer, the
generated types and the screens are separate steps).
