# Brief: enter and save a pick-up (X) through the desk (step 3c)

You are a builder. Work only in this worktree (branch `agent/pickup-ui`). Do not push, merge, deploy,
apply a migration or touch any other branch. Read `AGENTS.md` first and follow it. Then read
`docs/spec/IGCC_Tournament_Desk.md`, section "Scoring as worked on the card, confirmed 12 November
2026", and `docs/tasks/2026-11-13-batch-scan-verify.md` (step 3).

## Why

On the paper card a player who cannot score a point picks up and the scorer writes an X. The hole
scores 0 points, counts as played and has no stroke count; on Day 1, 28 of 36 cards had one. The two
earlier slices are already on `develop`: the scoring engine under `src/lib/scoring` understands a
pick-up (`CardEntry.pickedUp`, `parseCardEntry` and `readCardValues` read `X` or `x`,
`summariseScorecard` returns `pickups`, `deriveCanonicalHoleScores` carries `CanonicalHole.pickedUp`,
`Resolution.pickedUp`), and a database migration `20261113000200_pickup_scores.sql` is written but
**not applied**. This slice lets a person type or tap an X on the desk and carries it through the
data layer. Nothing else is in scope. The owner decided on 13 November that a pick-up simply equals 0
points and no penalty is recorded in the app.

The migration is not applied, so the code must work with the database both before and after it.
Therefore: **a card with no pick-up must send the same payload as today, byte for byte** (add
`picked_up` to an entry only when it is true, add `pickedUp` to a canonical row only when it is true),
and the reads that already use `select("*")` stay as they are. Never add `picked_up` to an explicit
column list.

## Scope

Only these files (and tests beside them):

- `src/components/scoring/ScorecardHoleGrid.tsx`, `ScorecardWorkspace.tsx`, `ScoresDesk.tsx`
- `src/lib/data/scoring.ts` (types and the in-memory demo repository),
  `src/lib/data/supabase/scoring.ts`
- `src/lib/supabase/generated-types.ts`: add `picked_up: boolean` to the Row, Insert (optional) and
  Update (optional) types of `scorecard_entries`, `hole_resolutions` and `approved_hole_scores`, by
  hand, because the migration is not applied and cannot be regenerated. Change nothing else there.
- one new pure helper `src/lib/scoring/cell-input.ts` with `cell-input.test.ts`

Do not edit the engine files under `src/lib/scoring` other than adding that helper, any SQL file, the
public or player code, or `scripts/verify-ui.mjs`. If you need a change elsewhere, stop and say so.

## What to build

1. **Cell input** (`cell-input.ts`, pure): `normalizeCellInput(raw: string): string`. Trim; an empty
   string stays empty; digits only, at most two of them; a single `x` or `X` becomes `"X"`; anything
   else (letters, `XX`, `-`, `0` alone is kept as typed so the engine can reject it as it does today)
   is cleaned to the longest valid prefix or empty. Document the rule in a comment and test it:
   `"4"`, `"12"`, `"x"`, `" X "`, `"XX"`, `"4x"`, `"x4"`, `""`, `"abc"`.
2. **Grid** (`ScorecardHoleGrid.tsx`): the score input becomes `type="text"` with `inputMode="numeric"`
   (a phone shows the number pad; a desk keyboard can type X), and its `onChange` passes the value
   through `normalizeCellInput`. Keep the id `hole-N`, the aria-label, Enter-to-next, the scan-state
   classes and the heights (44px below `lg`, 36px at `lg`). Add one table row under Score labelled
   `X` (with a visually hidden " (pick-up)") holding one toggle button per hole: `aria-pressed` is true
   when the cell holds `X`, pressing it sets the cell to `X`, pressing it again clears the cell. The
   button is at least 44px high below `lg` and 36px at `lg`, uses existing tokens (`bg-surface-sunken`,
   `border-line`, `text-ink`, the primary tone for pressed) and has the aria-label
   `Hole N pick-up`. A cell showing `X` shows 0 in the points row.
3. **Summary** (`ScorecardWorkspace.tsx`): where the card shows the strokes total, show the pick-up
   count next to it in the same form the public card uses (for example `74 (+2 pick-ups)`; read
   `src/lib/player/paper-scorecard.ts` for its wording and match it). Points in the footer already come
   from `summariseScorecard`.
4. **Submit** (`ScoresDesk.tsx`): build the submitted entries from `readCardValues`/`parseCardEntry`,
   not from `Number(strokes[hole])`. An X becomes `{ strokes: null, pickedUp: true }`, a number as
   today. `cardSignature` and `checkCardSubmission` already understand pick-ups. The written total
   already skips a card with a pick-up.
5. **Resolving a conflict** (`ScoresDesk.tsx`, the resolution form): add a way to settle a hole as a
   pick-up (a labelled checkbox or a second button, plain wording, at least 44px below `lg`). When
   chosen the score field is not required, `strokes` is sent as `0` and `pickedUp: true`.
   `ResolveHoleInput` gains `pickedUp?: boolean`. The reason is still required.
6. **Data layer, Supabase** (`src/lib/data/supabase/scoring.ts`):
   - Read: an entry's `pickedUp` is `entry.picked_up === true ? true : undefined` (keep the key off
     the object when false, so existing tests that compare whole objects still pass). Same for a
     resolution (`strokes` is 0 for a pick-up).
   - `submitCard`: add `picked_up: true` to an entry's JSON only when `entry.pickedUp === true`.
   - `proposalRows`: include a canonical hole with `pickedUp === true` as
     `{ hole, strokes: 0, pickedUp: true, verification, provenance }`; other rows unchanged (no
     `pickedUp` key). `ProposalRow` gains `pickedUp?: boolean`.
   - `resolveHole`: with `input.pickedUp`, send `p_strokes: 0` and build the temporary `Resolution` as
     `{ strokes: 0, pickedUp: true }`; `previousStrokes` stays the number before, or null if the
     previous canonical hole was a pick-up.
7. **Data layer, in-memory demo repository** (`src/lib/data/scoring.ts`): the same behaviour.
   `resolveHole` with `pickedUp` skips the stroke range check and stores `{ strokes: 0, pickedUp:
   true }`; everything else as now. Demo mode is how the browser checks run, so a card with an X must
   submit, approve and show 0 points there.

## Tests (required, Vitest)

Add to the existing test files in the style they already use (the fake Supabase client in
`src/lib/data/scoring.test.ts` and `supabase/scoring-day.test.ts`):

- `normalizeCellInput` cases above.
- Supabase submit: a pick-up entry sends `picked_up: true` and null strokes; a card with no pick-up
  sends exactly the old JSON (assert with `toEqual` on the whole entry objects, no `picked_up` key).
- Supabase read: a row with `picked_up: true` reads as `pickedUp: true`; a row without the field
  reads as before.
- `proposalRows` through `approveCard`: a verified pick-up hole is sent as `strokes: 0, pickedUp:
  true`; an ordinary hole is unchanged.
- `resolveHole` with `pickedUp` sends `p_strokes: 0`; without it, unchanged.
- In-memory repository: submit a card with an X, approve it, see 0 points for that hole and the hole
  counted; resolve a number-versus-X conflict as a pick-up.
- Do not weaken or delete any existing test.

## Rules to respect

- Strict TypeScript with `noUncheckedIndexedAccess`, no `any`, no new dependency, no inline hex
  colours, no external fonts. Use the tokens and classes already in `src/app/globals.css`.
- Never guess data: a blank cell stays blank, it is never turned into an X or a par.
- Plain language in code comments and labels, no em-dash pile-ups, no marketing words.
- Do not run `pnpm check:ui` (it starts a dev server and other work is running); the orchestrator
  runs it. In your report list the parts of `scripts/verify-ui.mjs` that could be affected (the grid
  inputs are now `type="text"`, there is a new table row, and the sticky bar moved), so they can be
  checked.

## Done means

```bash
pnpm typecheck && pnpm lint && pnpm test
```

All three must pass; report the actual output. If lint reports formatting only, run
`pnpm exec biome check --write src` on the files you changed and run the three again. Commit with one
plain subject line and stop. Do not push. In your final message list the files changed, the tests
added, every judgment call, and anything outside the scope you found (for example places that still
assume a score is a number).
