# Brief: edit a player's index and class from the pairings board

You are a builder. Work only in this worktree (branch `agent/board-index`). Do not push, merge, deploy,
apply a migration or touch any other branch. Do not commit this BRIEF file. Read `AGENTS.md` first and
follow it. Commit your own work to your branch in small commits when `pnpm typecheck && pnpm lint &&
pnpm test` pass.

## Why

Release 0.44.1 made the handicap index editable from the Register list and the player page (the
`ReadyOverrideDialog` in `src/components/desk/ReadyOverrideDialog.tsx`, saved through
`adapters.registrations.overrideReady`). The desk now sits on the pairings board
(`src/app/(desk)/draw/page.tsx`, `src/components/draw/GroupCard.tsx`) all day and has to leave it to
fix an index. They want to edit the index in place.

## Decision already made by the owner

When the index changes on the board, the class updates, **the player stays in their current group**,
and the board shows a warning if the new class no longer matches the group's flight. No automatic
re-routing.

## Scope

Own these files (and tests beside them):

- NEW `src/components/draw/PlayerIndexDialog.tsx` (a thin wrapper that reuses `ReadyOverrideDialog`
  in its edit mode; do not fork its logic)
- NEW pure helper `src/lib/draw/class-mismatch.ts` with `class-mismatch.test.ts`: given the draw, the
  registrations and flights, report for each group which players' class differs from the group's
  flight (flights are field-wide classes; read `src/lib/routing/types.ts` `FlightRule`)
- `src/components/draw/GroupCard.tsx` and `src/app/(desk)/draw/page.tsx`: an "Edit index" button on
  each player row and a mismatch badge on the player and group; small, local edits only
- `src/components/draw/IssuesPanel.tsx` only to list class mismatches as a non-blocking note

Another builder owns player swapping, selection checkboxes and a command bar (also in `GroupCard.tsx`
and `page.tsx`), a third owns instant publish and undo (`desk-store.tsx`, draw toolbar). Keep your
edits to `GroupCard.tsx` and `page.tsx` small and local so those merge: add your own props and a small
block, do not reorganise or rename. Do not edit `state.ts`, `desk-store.tsx` or any SQL.

## What to build

1. A button on every player row in the group card (owner and organizer only, the same gate as the
   register page's `canEdit`) that opens the dialog for that player's registration, prefilled with
   the current frozen index. Save goes through `adapters.registrations.overrideReady`, exactly like
   `src/app/(desk)/players/[id]/page.tsx` does, then the board re-reads so the badge updates.
2. After saving, the player must still be in the same group. Verify the draw does not re-run. If
   saving causes a re-route through the store, stop and report it instead of working around it.
3. `class-mismatch.ts`: pure, tested. A badge such as "Class B, group is Class A" on the player row
   and a count on the group header. Never block a publish because of it.
4. Keep the register and player-page behaviour untouched. Existing tests must pass unchanged.

## Rules

Golf rules come from tournament settings. Never guess data. No I/O in `src/lib/draw`. Never weaken or
delete a test. Plain-language copy. When done, give the exact changed files, what you ran, and
anything you could not verify.
