# Brief: instant publish with undo for pairings board edits

You are a builder. Work only in this worktree (branch `agent/board-live`). Do not push, merge, deploy,
apply a migration or touch any other branch. Do not commit this BRIEF file. Read `AGENTS.md` first and
follow it. Commit your own work to your branch in small commits when `pnpm typecheck && pnpm lint &&
pnpm test` pass.

## Why

During the live event every pairings change is followed by a manual "Review and publish" step, and the
desk cannot take back a mistaken swap. The owner chose: **board edits publish immediately, with undo
for the last change.** This is internal live-event behaviour (see "Live event override" in AGENTS.md).

## Scope

Own these files (and tests beside them):

- `src/lib/store/desk-store.tsx` and `src/lib/store/state.ts` (only a small undo mechanism and a
  live-mode flag; tests in `state.test.ts` or a new test file beside the store)
- NEW pure helper `src/lib/draw/board-history.ts` with `board-history.test.ts` (a bounded undo stack
  of board snapshots: push, undo, cap of 20)
- NEW `src/components/draw/LiveModeBar.tsx` (toggle "Live mode", "Undo last change", and a "last
  published <time>" line) wired into the draw page header with a small block in
  `src/app/(desk)/draw/page.tsx`

Other builders edit `GroupCard.tsx` and the draw page body (player swap, index dialog). Keep your
`page.tsx` edit to one small block in the header area; do not reorganise or rename anything.

## What to build

1. **Live mode** (default off, remembered per browser, with try/catch around localStorage). When on,
   after any of these board actions the store publishes the current draw by itself: `move`,
   `swapGroupSlots`, `moveGroupToHole`, `reorderHoleQueue`, `setGroupLocked`, `withdrawFromDraw`,
   `restoreToDraw`, `placeOnDraw`, and the swap actions another builder is adding (`swapPlayers`,
   `moveSet`, `swapSets`; they do not exist in your branch, so make the trigger list a single
   exported constant so they are one line to add).
2. **Coalesce.** Publishes are debounced about 2 seconds and sent as one, so a burst of edits is one
   published version and one notification run. Read how `publish_pairings` and `sync_notifications`
   (see `src/lib/data/supabase` and `supabase/migrations`) notify players and make sure Live mode
   cannot spam: if every publish notifies, only the final coalesced publish may. Do not change any
   SQL or RPC. If notifications cannot be limited without a migration, stop and report it.
3. **Respect publish gating.** Live mode must never publish when the existing publish checks refuse
   (problems list, role gate: owner or organizer only, the draw revision check). A refusal turns Live
   mode off and shows the existing "Not published" notice with the reason. No silent loss.
4. **Undo last change.** Before each board action the store pushes a snapshot of the board's draw and
   overrides. "Undo last change" restores the previous snapshot as a new board edit and, in Live mode,
   publishes it (coalesced). Undo is per tab and cleared on reload; say so in the button's hint.
5. **Clear status.** The bar shows Live on or off, "Publishing...", "Published <time>" and any error,
   in plain words. Touch targets at least 44px below `lg`.

## Rules

Players only see the frozen published snapshot, so publish only through the existing publish path.
Never weaken or delete a test. Plain-language copy. When done, give the exact changed files, what you
ran, and anything you could not verify, including the notification behaviour you found.
