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
| foundation | `ws/foundation` | `feat/workspace` | not started |
| next-security | `chore/next-security` | `origin/develop` | not started |

(Docs, board, tasks, settings, overview, ui-checks and report are added as they start.)

## What each agent did, and what was rejected

To be filled in as each workstream is reviewed.

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
