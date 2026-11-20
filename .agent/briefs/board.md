# Brief: BOARD (tournament pipeline kanban and the shared kanban component)

Branch `ws/board`, worktree `teeline-ws-board`, from `feat/workspace` after FOUNDATION is merged.
Goal: the pipeline board at `/board`, from inquiry to invoiced and closed, and a reusable kanban component
the Tasks workstream will use later.

Read first: `docs/workspace/SPEC.md`, `supabase/migrations/20261120000300_workspace_pipeline_and_tasks.sql` and
`20261120000400_workspace_realtime.sql`, `apps/ops/src/lib/db/*` (types, `PIPELINE_STAGES`, `channels`,
`POSITION_MIN_GAP`, `POSITION_STEP`, permissions), the stub `apps/ops/src/lib/board/repo.ts`,
`apps/ops/src/lib/repos.ts`, the UI primitives in `apps/ops/src/components/ui`.

You own: `apps/ops/src/app/(app)/board/**`, `apps/ops/src/components/board/**`,
`apps/ops/src/components/kanban/**`, `apps/ops/src/lib/board/**`. Nothing else. `@dnd-kit/core`,
`@dnd-kit/sortable` and `@dnd-kit/utilities` are already installed.

Kanban library: the owner suggested the ReUI Kanban or Kibo UI Kanban shadcn component (both dnd-kit based). You may
try adding one with `pnpm dlx shadcn@latest add <registry url>` ONLY if afterwards `git status` shows changes inside
your owned paths and nowhere else (no `package.json`, no lockfile, no `components/ui`). If it touches anything else,
revert those files and write the component yourself on dnd-kit. Either way the result lives in
`components/kanban/` and follows our design tokens (SPEC section 8).

## Build

### 1. Pure ordering logic (`lib/board/order.ts`), unit tested first
- `computePosition(prev: number | null, next: number | null): number`: the midpoint of the two neighbours; before
  the first item `next - POSITION_STEP`; after the last `prev + POSITION_STEP`; empty column `POSITION_STEP`.
- `needsRebalance(prev, next)` true when the gap is below `POSITION_MIN_GAP`; `rebalance(items)` returns new
  positions `POSITION_STEP` apart in the current order.
- `applyMove(cards, { id, toStage, beforeId, afterId })` returns the new card list (optimistic state) and the
  position to persist. Tests: move within a column, to another column, to an empty column, to the top, to the
  bottom, rebalance trigger, moving onto itself is a no-op.

### 2. Repository (`lib/board/repo.ts`)
`BoardRepo`: `listCards({ ownerId, month })`, `getCard`, `createCard({ title, clubName, stage? })` (quick create:
position at the end of the column), `updateCard(id, patch)`, `moveCard({ id, stage, position })`, `deleteCard`
(UI offers it only if `can(viewer, "content.delete")`), `listMembers()` (a plain select of `user_id, display_name`
from `workspace_members`, for the owner filter and the owner picker), `listTournaments()` (select
`id, name, play_date` from `tournaments`; RLS may return nothing for a non-staff member, which is fine: then hide
the picker). Supabase implementation with the typed client and a demo implementation seeded with believable
cards across all seven stages (for example Bamboo Tee at IGCC in Live, a Cebu inquiry, a Manila proposal).
Replace the FOUNDATION stub, keep its exported names. Tests for both.

### 3. Kanban component (`components/kanban/`)
Generic, reusable: columns with id and label, items with id, column id and position, `renderCard`, `onMove({ id,
toColumnId, beforeId, afterId })`, `disabled`, `renderColumnHeader`. Uses dnd-kit: pointer and touch sensors (touch
with a short press delay so scrolling still works on a phone) and the keyboard sensor, with screen reader
announcements. Drag overlay, visible drop target, column item counts. On a phone the columns scroll horizontally
with snap. Do not import anything from `components/board` into it, so Tasks can reuse it.

### 4. The board (`/board`, `components/board/*`)
- Seven columns from `PIPELINE_STAGES`. A card shows title, club, dates, expected players, quoted amount (format with
  `Intl.NumberFormat`, currency from the row, tabular numerals), pricing model badge, owner avatar.
- Optimistic moves: apply `applyMove` locally at once, call the server, and on failure roll back and show a plain
  message. Persist the position; rebalance the column when needed.
- Live updates: subscribe to the private channel `channels.board` (`client.channel(channels.board, { config: { private:
  true } })`, after `client.realtime.setAuth()`), listening to broadcast events `INSERT`, `UPDATE`, `DELETE`. Merge by
  id and `updated_at`, ignore stale and own echoes, never drop a local edit that is in flight. Show "Live" or
  "Reconnecting". No subscription in demo mode.
- Card detail Sheet: edit every field (title, club, stage, owner, start and end date, expected players, pricing model,
  quoted amount, currency, notes, linked tournament if any are visible), save, delete if allowed. A "Move to..." menu so a
  card can be moved without dragging (touch and keyboard users).
- Quick-create: a small inline form at the top of each column (title and club only).
- Filters: owner (including "unassigned") and month (by start date, plus "no date"). Filters change what is shown, not
  the data. Totals: card count and quoted total per column when a quoted amount exists.
- Empty and loading states. Members who cannot delete do not see a delete control.

## Acceptance
`pnpm --filter @teeline/ops typecheck`, `lint`, `test` pass (state counts). `OPS_DEMO=1` dev server: `/board` shows seven
columns with demo cards; dragging, the Move menu, quick-create, filters and the detail Sheet work; light, dark and 390px
are usable. One `next build` through the lock passes. Nothing outside your owned paths changed (`git diff --stat
feat/workspace...HEAD`). Be honest: live updates cannot be verified without a real Supabase project; say what is unit
tested and what is not.
