# Brief: OVERVIEW (the workspace home page)

Branch `ws/overview`, worktree `teeline-ws-overview`, from `feat/workspace` after DOCS, BOARD, TASKS and SETTINGS are merged.
Goal: `/` is the first screen a member sees. It answers three questions at a glance: what is on my plate, where is the
pipeline, and what changed in the documents.

Read first: `docs/workspace/SPEC.md`, `apps/ops/src/lib/db/*`, `apps/ops/src/lib/repos.ts`, the public functions
exported by `lib/tasks`, `lib/board`, `lib/docs` and `lib/members` (use them, do not copy their queries), the UI primitives
in `apps/ops/src/components/ui`, and the current placeholder at `apps/ops/src/app/(app)/page.tsx`.

You own: `apps/ops/src/app/(app)/page.tsx`, `apps/ops/src/components/overview/**`, `apps/ops/src/lib/overview/**`. Nothing else.

## Build

### 1. Pure summaries (`lib/overview/summary.ts`), unit tested first
- `taskSummary(tasks, viewerId, today)`: counts of my open tasks, my overdue tasks, all unassigned tasks, and the next five
  due (ties by priority). `today` is passed in, never read from the clock.
- `pipelineSummary(cards)`: per stage the card count and the quoted total (only when a quoted amount exists), in
  `PIPELINE_STAGES` order, plus the total of open stages (everything before `closed`).
- `recentDocs(docs, limit)`: newest edited first, archived left out.
Test every branch, including empty inputs and a missing quoted amount.

### 2. The page
- A greeting with the member's display name and today's date. Three Cards using the design-system `Card`: "My tasks"
  (counts and the next due list, each row links to `/tasks`), "Pipeline" (a compact row per stage with count and total,
  links to `/board`), "Documents" (the five most recently edited, each links to `/docs/<id>`).
- Server component that reads through `getRepos()`. A section that fails to load shows a short plain message and the others
  still render. Loading skeletons through `loading.tsx` if cheap. Empty states with a plain next step ("No tasks yet.").
- No callout cards with an accent bar on the left edge. No decorative gold lines. Cards use the surface and line tokens only.
- Phone width: single column, nothing wider than the screen. Light and dark both readable.

## Acceptance
`pnpm --filter @teeline/ops typecheck`, `lint`, `test` pass (state counts). `OPS_DEMO=1` dev server: `/` shows the three
sections with demo data. One `next build` through the lock passes. Nothing outside your owned paths changed
(`git diff --stat feat/workspace...HEAD`).
