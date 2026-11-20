# TeeLine Workspace: agent run record

A running record of how the workspace was built: the model, the flags, the worktrees, what each agent
did, and what was rejected and why. Kept by the orchestrator (Claude Code). Updated as work lands.

## Model and tool

| Item | Value |
| --- | --- |
| Builder model | `opencode-go/deepseek-v4.1-flash` (DeepSeek V4.1 Flash). No other model is used for building. |
| Also listed by `opencode models` | `opencode/deepseek-v4.1-flash` and `opencode/deepseek-v4.1-flash-free`; not used |
| OpenCode | v2.0.32. `opencode models --refresh` is not a flag in this version; `opencode models` was used and filtered for `deepseek` |
| Launch | `opencode run --model opencode-go/deepseek-v4.1-flash --auto -f <brief file> "<short instruction>"` from the worktree, output to `ws-logs/<name>.log` |
| `--auto` | "Auto-approve permissions that are not explicitly denied" (from `opencode run --help`) |
| Orchestrator | Claude Code; reviews diffs, runs checks, merges. Does not hand implementation to another model |

## Why a deny config is needed

`--auto` approves everything not explicitly denied. The user-level OpenCode config on this machine
marks `git push --force`, `git reset --hard`, `rm -r` and others as `ask` (which `--auto` approves) and
explicitly **allows** `vercel deploy`, `vercel --prod`, `vercel promote` and `gh pr merge --admin`.
So every worktree gets its own `opencode.jsonc` with `deny` rules for pushing, merging, branch
switching, `gh`, `vercel`, `supabase`, anything containing `deploy` or `promote`, recursive deletes,
direct builds, `curl` and `wget`. Tested on 20 Nov 2026 with the model itself:

| Test command | Result |
| --- | --- |
| `vercel deploy --help` (globally allowed) | refused by the worktree deny rule |
| `git push --dry-run --force ...` (globally "ask") | refused |
| `git status -sb`, `pnpm --version`, `git log` | ran normally |

The deny file lives at `ws-tools/agent-opencode.jsonc` and is copied into each worktree, where git
ignores it (`.git/info/exclude`).

## Builds and memory

At most one `next build` at a time across all worktrees, through `ws-tools/build-lock.sh` (a lock
directory, cleared after 25 minutes if a run crashed). `pnpm build`, `pnpm check` and `next build`
are denied to agents when run directly. One shared pnpm store (`S:\.pnpm-store`, same drive as the
worktrees, so installs are hard links). At most 4 `opencode` processes at once. Free memory at the
start was about 4 GB of 24 GB, so the real limit is lower than 4 when the machine is busy.

## Worktrees

Worktrees are sibling folders of the main checkout, `teeline-ws-<name>`, on branch `ws/<name>`, cut
from `feat/workspace` (itself cut from the reconciled `develop`, `b0b7bc2`).

| Name | Branch | Base | Status |
| --- | --- | --- | --- |
| foundation | `ws/foundation` | `feat/workspace` | done, reviewed, merged into `feat/workspace` (20 Nov) |
| next-security | `chore/next-security` | `origin/develop` | done, released in 0.59.0 |
| docs | `ws/docs` | `feat/workspace` (after foundation) | done, reviewed, merged |
| board | `ws/board` | `feat/workspace` (after foundation) | done, reviewed, one fix by the orchestrator, merged |
| tasks | `ws/tasks` | `feat/workspace` (after foundation) | done, reviewed, one fix by the orchestrator, merged |
| settings | `ws/settings` | `feat/workspace` (after foundation) | done, reviewed, one fix by the orchestrator, merged |
| tasks-board | `ws/tasks-board` | `feat/workspace` (after board and tasks) | running |
| overview | `ws/overview` | `feat/workspace` (after the four) | running |
| ui-checks | `ws/ui-checks` | `feat/workspace` (after the four) | running |

(The report starts after the three above are merged.)

## What each agent did, and what was rejected

**next-security.** Raised `next` from 16.4.2 to 16.4.6 (`package.json`, lockfile). Reviewed by building
it: `next build` exit 0. Released as part of 0.59.0 (tag `v0.59.0`).

**foundation.** Built the `apps/ops` scaffold, the access gate (flag, then session, then membership),
the repository registry with the demo guard, the shell, the UI primitives and placeholder pages.
Reviewed by re-running typecheck, lint, the ops tests (51) and the RLS harness (91 pass, 0 fail) in its
worktree, and again on the merged tree. Accepted. Two things I checked on purpose: the CI change only
adds a `workspace app` job and a deploy-policy check for `apps/ops/vercel.json`, and the `biome.json`
override only turns the formatter off for the contract files and the RLS script. The log ends with
`FOUNDATION_EXIT=1`, so `opencode run` itself returned 1. The agent's report and my own re-run show
every check passing, and I did not establish why it returned 1. Treat the marker as unexplained.
Merge note: the lockfile conflicted with the Next upgrade, so it was regenerated on top of `main`.
The seed JSON then failed the wider Biome scope and was formatted.

**settings, tasks, board.** Each stayed inside its owned paths (checked with
`git diff --name-only feat/workspace...HEAD`). Realtime wiring read correctly in tasks and board: `setAuth`
first, a private channel, `removeChannel` on unmount. One defect found in all three on review, fixed by the
orchestrator before merging (5 tests added): **row level security refuses an update or delete by changing
zero rows and raising no error**, so the repositories would have reported success on a change that never
happened. Settings (role, status, remove, display name), tasks (task and comment delete) and board (card
delete) now ask for the affected row and fail when there is none. Task and card updates were already safe
because they use `.single()`. Settings' demo role switch (`?as=`) is only read when `demoMode()` is true,
which is off in production.

**docs.** Stayed inside its owned paths. Its repository already treated zero rows as a failure. The private
channel wrapper forces `private: true` and the `ws:doc:` prefix on every channel, and the persistence
settings match SPEC section 6. A dev-only "Yjs was already imported" warning is not a duplicate install:
`pnpm why yjs` shows a single `13.6.33`. A missing document returns the not-found page with HTTP 200
because of streaming; not changed. The converter was run against the real portal by the agent with
output outside the repo; nothing from it is committed.

Orchestrator checks on the merged tree (after docs): root typecheck and lint clean, 2995 root tests,
412 ops tests, RLS harness 91 pass 0 fail, and `next build` of `apps/ops` exit 0 with all eight routes.
Not verified by anyone: realtime and persistence against a real project, drag gestures in a real browser,
and light, dark and 390px by eye (the agents used tokens and ran scripted checks only).

## Decisions made without the owner awake (20 Nov 2026)

The owner went to sleep and said to proceed as long as it is logical, after answering the operational
questions. Decisions taken on that basis, each reversible:

1. **y-supabase uses private channels through a client wrapper**, not a custom provider. See SPEC 6.
2. **Routes are at the root of `apps/ops`** (`/docs`, `/board`, `/tasks`, `/settings`), not under
   `/workspace`, because the workspace is its own app on its own domain.
3. **Document state is stored as base64 text**, not `bytea`, because that is what y-supabase persists.
4. **Board and task live updates use database-sent broadcasts** on private channels, not
   `postgres_changes`, so one authorization mechanism covers everything.
5. **Account creation stays in the Supabase dashboard**; `ws_add_member` only attaches an existing
   account. No service-role key is used anywhere in the app.

## Decisions made after the owner asked for it live (20 Nov 2026)

The owner's later instruction was to apply the migrations, deploy, reconcile `main` and level the three
branches. What was done and what could not be:

6. **The live app was released first, on its own.** `chore/next-security` and the staged clubhouse board
   commit went out as **0.59.0** (PR #328, both required checks green, merged, tag `v0.59.0`). Without
   the Next upgrade no new deploy could build. No migration ships in 0.59.0.
7. **Levelling.** `develop` fast-forwarded to `main` (`702889f`). Direct pushes to `staging` are refused by
   a branch hook, so staging was brought level through PR #329 (main into staging, the repo's usual
   way). `staging` has the same content as `main` plus that one merge commit.
8. **The workspace migrations were NOT applied.** The live project is not reachable with the CLI login on
   this machine (HTTP 403 on `supabase link` and `migration list`), and no tool here can run migrations.
   Nothing was worked around. `docs/workspace/apply-on-live.sql` is the four migrations, verbatim and in
   order, in one transaction, ready to paste into the Supabase SQL editor.
9. **The Vercel project `teeline-workspace` exists but is not linked to Git yet.** Root directory
   `apps/ops`, Next.js, Node 24. Production variables set: the public Supabase URL and anon key (copied
   from the live app's public client bundle, never printed) and `OPS_ENABLED=1`. Domain
   `teeline.syntaxure.dev` added and verified. It is not Git-linked because `apps/ops/vercel.json`
   (which limits auto-deploys to `main` and `staging`) is not on `main` yet; linking now would make
   every push build a root directory that does not exist there.
10. **`OPS_ENABLED=1` is set in production on purpose**, so the workspace works the moment the SQL has
    been run and the project is linked, with no further redeploy.
