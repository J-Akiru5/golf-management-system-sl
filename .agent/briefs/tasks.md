# Brief: TASKS (team tasks, list view)

Branch `ws/tasks`, worktree `teeline-ws-tasks`, from `feat/workspace` after FOUNDATION is merged.
Goal: team tasks at `/tasks`: assign, track and discuss work. This pass is the LIST view. The board view comes in
a second pass after the kanban component exists, so leave a disabled "Board" tab marked "Coming soon".

Read first: `docs/workspace/SPEC.md`, `supabase/migrations/20261120000300_workspace_pipeline_and_tasks.sql` and
`20261120000400_workspace_realtime.sql`, `apps/ops/src/lib/db/*` (types, `TASK_STATUSES`, `TASK_PRIORITIES`,
`channels`, permissions including the comment rules), `apps/ops/seed/nov17-next-steps.json`, the stub
`apps/ops/src/lib/tasks/repo.ts`, `apps/ops/src/lib/repos.ts`, the UI primitives in `apps/ops/src/components/ui`.

You own: `apps/ops/src/app/(app)/tasks/**`, `apps/ops/src/components/tasks/**`, `apps/ops/src/lib/tasks/**`.
Nothing else.

## Build

### 1. Pure logic (`lib/tasks/logic.ts`), unit tested first
- `isOverdue(task, today)`: not done and `due_date` before `today` (`today` is passed in, never read from the clock inside).
- `filterTasks(tasks, view, viewerId, assigneeId?)` for the views My tasks, All, By assignee, Overdue.
- `sortTasks`: by status order, then due date (none last), then priority (urgent first), then position.
- `dueLabel(task, today)`: "Overdue by 3 days", "Due today", "Due tomorrow", "Due 25 Nov", "No due date".
Tests for every branch, including month and year boundaries.

### 2. Repository (`lib/tasks/repo.ts`)
`TasksRepo`: `listTasks()`, `getTask(id)`, `createTask({ title, description?, assigneeId?, dueDate?, priority?, pipelineCardId?,
tournamentId? })`, `updateTask(id, patch)`, `setStatus(id, status)`, `deleteTask` (owner and partner only in the UI),
`listComments(taskId)`, `addComment(taskId, body)`, `editComment(id, body)` (sets `edited_at`), `deleteComment(id)`,
`listMembers()` (plain select of `user_id, display_name` from `workspace_members`), `listCards()` (select `id, title`
from `ws_pipeline_cards`, for the link picker). Supabase implementation with the typed client (RLS does the access
control) and an in-memory demo implementation seeded with the eleven tasks from `nov17-next-steps.json`, all UNASSIGNED
(the owner assigns them), plus a few assigned and overdue ones so every view has content. Replace the FOUNDATION stub,
keep its exported names. Tests for both.

### 3. The list view (`/tasks`, `components/tasks/*`)
- Tabs: My tasks, All, By assignee (with an assignee picker), Overdue, and the disabled "Board - Coming soon".
- A table on desktop (title, status, priority, assignee avatar and name, due date with overdue emphasis, linked card) and
  stacked rows on a phone. Quick status change inline. Priority and status badges using the design-system Badge.
- "New task": title (required), description, assignee (members only, or unassigned), due date, priority, link to a pipeline
  card. Plain validation messages.
- Task detail Sheet: edit every field, delete (only if `can(viewer, "content.delete")`), and a comments thread: add; edit your
  own (`canEditComment`); delete your own, or anyone's if owner or partner (`canDeleteComment`). Show "edited" when
  `edited_at` is set.
- Live updates: subscribe to the private channel `channels.tasks` (`client.channel(channels.tasks, { config: { private: true } })`,
  after `client.realtime.setAuth()`) for broadcast events `INSERT`, `UPDATE`, `DELETE` from `ws_tasks` and `ws_task_comments`
  (the payload carries the table name). Merge by id and `updated_at`; never lose an in-flight local edit. "Live" or
  "Reconnecting" indicator. No subscription in demo mode.
- Empty and loading states. The viewer's own unassigned-count nudge is NOT needed.

## Acceptance
`pnpm --filter @teeline/ops typecheck`, `lint`, `test` pass (state counts). `OPS_DEMO=1` dev server: `/tasks` shows the demo tasks;
every tab filters correctly; create, edit, status change, comments work in demo; light, dark and 390px are usable. One
`next build` through the lock passes. Nothing outside your owned paths changed (`git diff --stat feat/workspace...HEAD`).
Be honest: live updates cannot be verified without a real Supabase project; say what is unit tested and what is not.
