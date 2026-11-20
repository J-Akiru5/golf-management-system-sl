# Brief: REPORT (the build report as a styled HTML page)

Branch `ws/report`, worktree `teeline-ws-report`, from `feat/workspace` once the feature work is merged.
Goal: `docs/teeline-workspace-2026-11-20.html`, a single self-contained HTML file Jeff reads in the morning. Plain language.

Read first: `docs/workspace/SPEC.md`, `docs/workspace/AGENTS-RUN.md` (decisions, worktrees, results), `docs/PLAN.md` (Workspace
section), `CHANGELOG.md`, `apps/ops/src/app/**` (routes), the four migrations in `supabase/migrations/20261120*`,
`docs/workspace/apply-on-live.sql` (header), and `docs/brand` if present for tokens.

You own: `docs/teeline-workspace-2026-11-20.html`. Nothing else.

## Content, in this order
1. Summary (what exists now, what is live, what is not) in five or six plain sentences.
2. Routes and what each does (a table: route, who sees it, what it does).
3. Data and access: the seven tables, the roles (owner, partner, member), what each role can do, and how the database
   enforces it (row level security, the last-owner guard, owner-only functions). No service-role key in the app.
4. Decisions made while the owner slept, each with the reason.
5. Test results: counts only from the repo files and the run record. Do not invent numbers. If a number is not written in a
   file you read, leave it out.
6. Known gaps and what is not verified (realtime and persistence against a real project, two-account security pass).
7. What to do next, numbered, in the order the owner should do it.

## Style
Self-contained: inline CSS, no external fonts or scripts, no images that need a network. Brand tokens: forest `#073D2E`,
ivory `#F7F5EE`, muted green `#8DB39B`, charcoal `#171C19`, gold `#B89550` used only for small marks and rules. Fonts by
local stack only (Georgia for headings, system sans for body). Light and dark through `prefers-color-scheme`. Cards use a
surface fill and a thin border. No callouts with a colored left edge. No marketing words. Works at 390px width.
Do not call the owner an engineer. Do not include any credential, email address or key.

## Acceptance
The file opens offline, has no `<script src>` or external `<link>`, passes a manual scan for em-dash pile-ups, and every number
in it can be found in a file you read. Nothing else changed.
