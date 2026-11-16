# Brief: swap two players and move a set together on the pairings board, plus a command box

You are a builder. Work only in this worktree (branch `agent/board-swap`). Do not push, merge, deploy,
apply a migration or touch any other branch. Do not commit this BRIEF file. Read `AGENTS.md` first and
follow it. Commit your own work to your branch in small commits when `pnpm typecheck && pnpm lint &&
pnpm test` pass.

## Why

The 24th Bamboo Tee desk edits pairings live. Today the draw board (`src/app/(desk)/draw/page.tsx`,
`src/components/draw/GroupCard.tsx`) can move ONE player into a group that has room (`move` action in
`src/lib/store/state.ts`, checked by `dropCheck`) and swap whole groups' start slots
(`swapGroupSlots`, `src/lib/draw/group-slots.ts`). It cannot swap two players, cannot move a pair or a
set of players together, and a full group (4) refuses any move. The organisers change pairings all
day, so this is too slow.

## Scope

Own these files (and tests beside them):

- NEW pure module `src/lib/draw/player-moves.ts` with `player-moves.test.ts`
- `src/lib/store/state.ts` and `state.test.ts`: new reducer actions only
- `src/components/draw/GroupCard.tsx` and `src/app/(desk)/draw/page.tsx`: selection UI and wiring
- NEW `src/components/draw/BoardCommandBar.tsx` (command box) and `src/lib/draw/board-command.ts` with `board-command.test.ts`

Another builder owns the index-edit dialog (a button on each player row in `GroupCard.tsx`) and a third
owns instant publish and undo (draw page toolbar, `desk-store.tsx`). Keep your edits to `GroupCard.tsx`
and `page.tsx` small and local so those merge cleanly: add your own props and a small block, do not
reorganise the file, do not rename existing props. Do not touch `desk-store.tsx` persistence lists
except to add your new action types to the "actions that are written to Supabase" list (line ~179)
exactly the way `move` is listed.

## What to build

1. `player-moves.ts` (pure, no I/O; return `{ok:true, draw, note} | {ok:false, reason}` like
   `group-slots.ts`):
   - `swapPlayers(draw, a, b)`: two different player ids in the draw swap groups and positions. Works
     when both groups are full. Both groups become locked (same as slot edits).
   - `moveSet(draw, playerIds, toGroup, groupSize)`: move several players into one group. Refuse with
     a plain reason if the group would exceed `groupSize` (a parameter, never hard-coded).
   - `swapSets(draw, setA, setB)`: swap two sets of players (for example a pair for a pair) when the
     two sets are the same size, by exchanging group membership one for one. Refuse unequal sizes
     with a plain reason.
   Tests: a swap across full groups, a swap inside one group (refuse or reorder, pick the sensible
   one and test it), unknown id, same id, set larger than room, unequal sets, locks set.
2. Reducer actions in `state.ts`: `swapPlayers`, `moveSet`, `swapSets`, each recording a
   `ManualOverride` row per moved player the way `move` does (kind `move`), with a reason. Add reducer
   tests next to the existing `move` tests.
3. Board UI: a "Swap" mode. The existing Move button on a player row picks a player; add: tapping a
   second player (in another group, even a full one) offers "Swap with <name>". Add a checkbox per
   player row to select several; with a selection, show an action bar "Move N to group..." and, when
   N equals the size of a second selection, "Swap these N with those N". Registered pairs get a
   "Select pair" shortcut on the row (find how pairs are exposed in the store or data layer; do not
   change the pairs schema). Touch targets at least 44px below `lg`. Use existing tokens and classes.
4. Command box (`board-command.ts` pure parser, `BoardCommandBar.tsx`): one text field above the
   board. Understands, case-insensitive, with fuzzy surnames matched against the players on the
   board: `swap A with B`, `swap A and B with C and D`, `move A to hole 12`, `move A, B to group 7`.
   It never acts on an ambiguous name: show the candidates and let the desk pick. It shows the plan
   ("Swap CELINO, ALAN with BRIONES, EDWIN") and applies on Enter or a Confirm button. Returns a plain
   error for anything it cannot parse. The pure parser is fully tested.

## Rules

Golf rules (group size, class mixing) come from tournament settings, never hard-coded. No I/O in
`src/lib/draw`. Never weaken or delete a test. Plain-language copy, no em-dash piles. When done, give
the exact changed files, what you ran, and anything you could not verify.
