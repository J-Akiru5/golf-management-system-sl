# Brief: pick-up in the scoring engine (step 3a, pure TypeScript only)

You are a builder. Work only in this worktree (branch `agent/pickup-engine`). Do not push, merge,
deploy, apply migrations or touch any other branch. Read `AGENTS.md` first and follow it. Read
`docs/spec/IGCC_Tournament_Desk.md`, section "Scoring as worked on the card, confirmed 12 November
2026", and `docs/tasks/2026-11-13-batch-scan-verify.md` (step 3) before you start.

## Why

On the paper card a player who cannot score a point on a hole picks up and the scorer writes an X.
The hole scores **0 points** (gross and net), counts as a **played** hole, and has **no stroke
count**. On Day 1, 28 of 36 cards had at least one X. The scoring engine cannot hold this: a hole is
a whole number or it is missing, and a missing hole blocks the card. The published side already
reads it: `src/lib/player/portal.ts` maps a published hole with `pickedUp: true` to
`grossStrokes: 0` plus `pickedUp: true`, and `src/lib/player/paper-scorecard.ts` leaves pick-ups out
of stroke totals and shows `"74 (+2 pickups)"`. Mirror that shape: **a pick-up is `pickedUp: true`
with no stroke count, and wherever a number is required it carries `0`**.

## Scope

Only these files under `src/lib/scoring/` and their tests: `types.ts`, `stableford.ts`, `cards.ts`,
`reconcile.ts`, `standings.ts`, `entry.ts`, `workspace.ts`, `submission.ts`. No database, no
migration, no React component, no data layer (`src/lib/data/**`), no public or player code. If you
find you need a change outside this list, stop and say so in your report instead of making it.

## Rules for each part

1. **`types.ts`**
   - `HoleScore` gains `pickedUp?: boolean`. When true, `grossStrokes` is ignored by the engine
     and callers pass `0`.
   - `ScoredHole` gains `pickedUp?: boolean`. A pick-up hole has `grossStrokes: 0`,
     `netStrokes: null`, `grossPoints: 0`, `netPoints: 0` when a handicap snapshot exists and
     `null` when it does not.
   - `RoundScoring` gains `pickups: number` (0 when none).
   - `CardEntry` gains `pickedUp?: boolean`. Valid shapes: `{strokes: number, pickedUp: absent or
     false}` or `{strokes: null, pickedUp: true}`.
   - `CanonicalHole` gains `pickedUp?: boolean`; `Resolution` gains `pickedUp?: boolean` (a desk
     resolution may settle a hole as a pick-up; then `strokes` is `0` and `pickedUp` is `true`).
   - Add whatever new issue or problem codes you need to the existing unions, kept minimal.
2. **`stableford.ts` (`scoreRound`)**
   - A pick-up hole is valid without a stroke count, counts toward `holesCompleted`, satisfies the
     "missing hole" check, scores 0 gross points and 0 net points, and its `grossStrokes`
     must **not** be added to `RoundScoring.grossStrokes` or `netStrokes`. `pickups` counts them.
   - Stroke validation (`isValidStrokes`) must not run on a pick-up hole.
   - A normal hole scores exactly as before. Do not change `stablefordPoints`.
3. **`cards.ts` (`validateScorecard`)**
   - An entry with `pickedUp: true` and `strokes: null` is **filled**, not `missing_hole`.
   - An entry with `pickedUp: true` and a non-null `strokes` is `invalid_strokes` (blocking).
   - The written-total comparison: when the card has any pick-up, the numbers cannot add to a card
     total, so skip `written_total_mismatch` for that card (a card with no pick-up behaves exactly
     as before). Keep `written_total_missing` as it was.
   - The helper that sums strokes for the comparison must leave pick-ups out.
4. **`reconcile.ts` (`deriveCanonicalHoleScores`)**
   - Evidence for a hole is a number **or** a pick-up. Two approved cards agree only if both say
     the same number or both say pick-up. A number against a pick-up is a conflict, handled by
     the same path as two different numbers (the conflict message should say "pick-up" rather than
     a number).
   - A hole verified or provisional as a pick-up is a `CanonicalHole` with `strokes: null`,
     `pickedUp: true` and the usual status and provenance. A desk `Resolution` with
     `pickedUp: true` resolves a hole as a pick-up with provenance `desk_resolution`; the
     validity check on a resolution must accept `pickedUp: true` with `strokes: 0` and must not
     run the stroke range check on it.
5. **`standings.ts`**
   - The "counted hole" test (`status` verified or provisional **and** `strokes !== null`) must
     also count a verified or provisional hole with `pickedUp: true`. Pass such a hole to
     `scoreRound` as `{ hole, grossStrokes: 0, pickedUp: true }`. A player with a pick-up must
     still appear in the standings with their points.
   - Ranking, tie-break and countback behaviour does not change for cards without pick-ups. The
     tie-break countback uses hole points, so a pick-up hole contributes 0 there.
6. **`entry.ts` (`parseCardEntry`), `workspace.ts` (`readHole`, `summariseScorecard`,
   `scorecardReadiness`), `submission.ts` (`readCardValues`, `cardSignature`)**
   - A cell typed `X` or `x` (trimmed) is a valid pick-up reading: `{ strokes: null, pickedUp:
     true }`. It is **not** a blank and **not** invalid.
   - `summariseScorecard`: a pick-up hole shows 0 points, is counted as filled, and is left out
     of the stroke totals and the OUT/IN stroke totals; expose the number of pick-ups on the
     summary (`pickups`).
   - `cardSignature` must tell a pick-up from a blank and from any number (for example `X`),
     so two cards that differ only in a pick-up are different cards.
   - Anything that parses a number from a cell today must keep rejecting other non-numeric text.

## Tests (required, Vitest)

Add tests next to the existing ones (new `describe` blocks or sibling files; do not edit the
meaning of an existing test). Cover at least:

- `scoreRound`: a card with 2 pick-ups scores 0 points on them, counts 18 holes completed, strokes
  total excludes them, `pickups` is 2, with and without a handicap snapshot; a card with no pick-up
  gives exactly the old result; the Yatco card from the spec (White tee, HDCP 18, 13 out, 16 in, 29
  net) still scores the same (find the existing test that uses it, if there is one).
- `validateScorecard`: pick-up entry is filled; pick-up with a number is blocking; written-total
  mismatch skipped when a pick-up is present and still raised when none is.
- `deriveCanonicalHoleScores`: two cards both say pick-up, verified pick-up; number against pick-up
  is a conflict; a desk resolution as pick-up.
- `buildStandings`: a player with a pick-up appears with the right points and holes counted.
- `parseCardEntry`, `readCardValues`, `summariseScorecard`, `cardSignature`: `X`, `x`, ` X `;
  `XX`, `0` and `-` are still rejected or blank as they are today.

## Rules to respect

- Strict TypeScript with `noUncheckedIndexedAccess`, no `any`, no new dependencies.
- Golf rules are tournament settings. Do not hard-code allowance, handicap or class values.
  Pick-up = 0 points is the confirmed rule from the spec and is the only rule you encode.
- **Do not weaken or delete any existing test.** Existing tests must pass unchanged. If one fails
  because the new field is now required somewhere, make the new field optional instead.
- Pure functions only in `src/lib/scoring`: no I/O.
- Plain language in comments. No marketing words, no em-dash pile-ups.

## Done means

```bash
pnpm typecheck && pnpm lint && pnpm test
```

All three must pass; report the actual output. If lint reports formatting only, run
`pnpm exec biome check --write src/lib/scoring` and run the three again. Commit with one plain
subject line and stop. Do not push. In your final message list the files changed, the tests added,
every place where you had to make a judgment call, and anything outside the scope list you found
that also needs changing (the database functions and the UI are separate steps).
