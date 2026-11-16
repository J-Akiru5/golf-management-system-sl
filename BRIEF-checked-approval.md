# Brief: "checked against the paper card" approves the card on submit (D7)

You are a builder. Work only in this worktree (branch `agent/checked-approval`). Do not push, merge,
deploy, apply a migration or touch any other branch. Read `AGENTS.md` first and follow it. Then read
`docs/tasks/2026-11-13-batch-scan-verify.md` (decisions D1 to D8 and the "Approval change (D7)"
section).

## Why

Today a card is submitted on `/scores` and then approved on `/scores/review`, which is two steps and
two screens for the same person at the same desk. The owner decided on 13 November 2026 that ticking
"checked against the paper card" is the approval. This slice adds that tick to the entry screen.

## What the database already allows (read, do not change)

`approve_scorecard` (`supabase/migrations/20261036000000_scoring_workflow.sql`, line 740) needs the
caller to be owner, organizer or desk, the card to be `submitted` or `in_review`, the round to be
open, the scorer assignment to match if an active assignment exists, and the scorer to be an active
entry in the round. It does **not** compare the approver with the submitter. So no migration and no
SQL change is needed: the entry screen submits the card and then calls `approveCard` for it.

## Scope

Only these files (and tests beside them):

- `src/components/scoring/ScoresDesk.tsx` and `src/components/scoring/ScorecardWorkspace.tsx`
- one new pure helper `src/lib/scoring/submitted-card.ts` with `submitted-card.test.ts`
- `src/lib/data/scoring.test.ts` only if you need a test there

Do not edit the engine files under `src/lib/scoring` other than adding that helper, any SQL file,
`src/lib/data/supabase/scoring.ts`, `scripts/verify-ui.mjs`, `ScorecardHoleGrid.tsx`, or the pick-up
code. If you need a change elsewhere, stop and say so.

## What to build

1. **Helper** (`submitted-card.ts`, pure):
   `findSubmittedCard(cards: readonly Scorecard[], match: { playerId: string; scorerId: string; knownIds: ReadonlySet<string> }): Scorecard | null`.
   From `cards`, keep those with the same `playerId` and `scorerId` and `status === "submitted"`,
   prefer one whose id is not in `knownIds` (the ids that existed before the submit), and among the
   candidates take the highest `revision`. Return `null` when none match. Test: a new card is found;
   a correction (higher revision, new id) is found rather than the older one; an old submitted card
   with a known id is skipped when a new one exists; no match returns `null`; another player's card
   is never returned; an approved or rejected card is never returned.
2. **Checkbox** (`ScorecardWorkspace.tsx`): a new checkbox in the same row as the existing controls,
   id `score-approve-on-submit`, at least 44px high below `lg` (`min-h-11 lg:min-h-9`), default
   **unticked** and reset to unticked after every submit and whenever the player or marker changes.
   Props: `approveOnSubmit: boolean`, `onApproveOnSubmitChange: (value: boolean) => void`.
   Label text: for a hand-entered card `Checked against the paper card, approve on submit`; for a
   scanned card (the existing scan box already says "Checked against the paper card" and gates the
   submit, leave it exactly as it is) `Approve on submit`. When the box is ticked the submit button
   reads `Submit and approve` (and `Submit correction and approve` when editing a card). Use the
   existing tokens and classes only.
3. **Submit then approve** (`ScoresDesk.tsx`, in `submitCard`): keep every existing check and the
   existing `scoring.submitCard(...)` call exactly as they are. Record the ids of `view?.cards`
   before the call. When the box is ticked and `submitCard` succeeds, call
   `findSubmittedCard(next.cards, { playerId: targetPlayerId, scorerId: targetScorerId, knownIds })`;
   if it returns a card, call `scoring.approveCard(tournamentId, card.id, "Checked against the paper
   card", day)`, and return the view that call returns. Notes:
   - success: `Card saved and approved for <name>. It counts now.`
   - the approval fails (it throws): keep the saved card, do not roll back, return the view from
     `submitCard`, and set the saved note to `Saved, but not approved: <reason>. It is on the Review
     tab.` where `<reason>` is the thrown error's message.
   - no matching card found in the returned view: same "Saved, but not approved" note with the reason
     `the new card was not in the list`.
   - box unticked: behave exactly as today, including the existing saved note.
   Make sure the `busy`/`submitting` state, the gate and the capture-key logic still work, and that a
   failed approval does not leave `submitting` stuck.
4. The sample (demo) repository and the Supabase repository both implement `approveCard`; call it
   through `scoring` only, do not branch on the mode.

## Tests (required, Vitest)

- `submitted-card.test.ts` as listed above.
- If `ScoresDesk` has no component tests, do not invent a test harness; put the testable logic in the
  helper. Do not weaken or delete any existing test.

## Rules to respect

- Strict TypeScript with `noUncheckedIndexedAccess`, no `any`, no new dependency, no inline hex
  colours, no external fonts. Plain language in labels and comments, no em-dash pile-ups.
- Never guess data and never approve without the person ticking the box.
- Do not run `pnpm check:ui` (it starts a dev server); the orchestrator runs it. In your report list
  the parts of `scripts/verify-ui.mjs` that could be affected (a new checkbox on the entry screen,
  a button label that changes only when the box is ticked).

## Done means

```bash
pnpm typecheck && pnpm lint && pnpm test
```

All three must pass; report the actual output. If lint reports formatting only, run
`pnpm exec biome check --write src` on the files you changed and run the three again. Commit with one
plain subject line and stop. Do not push. In your final message list the files changed, the tests
added, every judgment call, and anything outside the scope you found.
