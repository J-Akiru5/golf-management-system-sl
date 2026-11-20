# Brief: TASKS BOARD (second pass: the board view of tasks)

Branch `ws/tasks-board`, worktree `teeline-ws-tasks-board`, from `feat/workspace` after BOARD and TASKS are merged.
Goal: turn the disabled "Board - Coming soon" tab on `/tasks` into a working kanban of tasks by status, reusing the generic
kanban component the Board workstream wrote.

Read first: `docs/workspace/SPEC.md`, `apps/ops/src/components/kanban/*` (its props are the contract; do NOT edit that
folder), `apps/ops/src/lib/board/order.ts` (`computePosition`, `needsRebalance`, `rebalance`, `applyMove` are reusable: import
them, do not copy), `apps/ops/src/components/tasks/*`, `apps/ops/src/lib/tasks/*`, `apps/ops/src/lib/db/*`
(`TASK_STATUSES`, `POSITION_STEP`, `channels`).

You own: `apps/ops/src/components/tasks/**`, `apps/ops/src/app/(app)/tasks/**`, `apps/ops/src/lib/tasks/**`. Nothing else.
If the kanban component is missing something you need, work around it in your own code and say so in the report.

## Build
- Four columns from `TASK_STATUSES` (To do, In progress, Blocked, Done). A card shows title, priority badge, assignee avatar,
  due label with overdue emphasis. Cards open the existing task detail Sheet.
- Dragging a card sets `status` and `position` (`setStatus` and the existing update path). Optimistic with rollback and a
  plain message on failure. A "Move to..." menu on each card for touch and keyboard users.
- The tab filters apply (my tasks, by assignee, overdue) to the board as well; the board tab keeps its own URL state
  (`?view=board`) so it can be linked.
- Live updates reuse the existing task subscription; a remote move appears without a reload and never discards a local edit
  in flight.
- Pure logic added to `lib/tasks/` is unit tested (column grouping, move to status with position, filters on the board).
- Phone width: columns scroll horizontally with snap; controls are at least 44px.

## Acceptance
`pnpm --filter @teeline/ops typecheck`, `lint`, `test` pass (state counts). `OPS_DEMO=1` dev server: the Board tab shows the
demo tasks in four columns; drag and the Move menu change the status in demo; filters work; light, dark and 390px usable.
One `next build` through the lock passes. Nothing outside your owned paths changed.
