# API regulation adoption (issue 218)

## Objective

Adopt `API_REGULATION.md` for the HTTP surface this app actually exposes, document the project
decisions and deviations, add the timing/observability layer, and remove two avoidable waits from
the public pages.

The standard is written for a standalone HTTP backend. This app is a Next.js server-rendered site
with a small set of `/api` route handlers and Supabase `SECURITY DEFINER` RPCs underneath the pages.
The RPCs are not HTTP endpoints and cannot carry an envelope or `Server-Timing`; the route handlers
and the page requests are the measurable surface.

## Branch

- Repository: `golf-management-system-sl`
- Worktree: `C:\Users\Client\Teeline Golf\wt-218-api-regulation`
- Branch: `feat/issue-218-api-regulation`, based on `origin/develop` at `bb790c4`
- Issue: #218
- Standard: `API_REGULATION.md` v1.1 (copied into the repository root)

## What changed

- `API_REGULATION.md` is now part of the repository and code review.
- `docs/API.md` records the project contract: camelCase, the Supabase RPC exception, the
  `/api/v1` envelope, the legacy removal date, the endpoint inventory, caching, query rules,
  observability gaps and the verification command.
- `src/lib/api/timing.ts` wraps route handlers with `X-Request-Id` and `Server-Timing`, an
  `INTERNAL_ERROR` envelope for uncaught failures, and `WARN SLOW` / `ERROR VIOLATION` logs.
- `GET /api/v1/pairings/version` is the versioned, enveloped endpoint. The legacy
  `/api/pairings/version` keeps its old body until 2027-01-31. Both share the same read, the
  `s-maxage=10, stale-while-revalidate=20` cache and a weak ETag.
- `/pairings` no longer calls `auth.getUser()` for a visitor with no Supabase session cookie.
- `/leaderboard` starts the team leaderboard, release state and programme reads in parallel instead
  of awaiting the leaderboard first.
- `pnpm api:check` starts a demo dev server, measures five public pages, checks the version endpoint
  contract, reports measured / skipped / total, and runs in warn mode by default.
- CI has a warn-mode API job. It is non-blocking for the rollout.

## Verification

- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm test`: 186 files, 1897 tests passed.
- `pnpm build`: passed; both route handlers are in the build.
- `pnpm check:ui`: 167 checks passed, 0 failed, 0 console errors.
- `pnpm api:check` (demo dev server, warn mode):

| Path | p50 | p95 | Max | Size |
|---|---:|---:|---:|---:|
| `/` | 112.1 ms | 133.5 ms | 133.5 ms | 127.1 KB |
| `/pairings` | 159.1 ms | 179.5 ms | 179.5 ms | 112.4 KB |
| `/roster` | 96.5 ms | 198.4 ms | 198.4 ms | 141.6 KB |
| `/leaderboard` | 103.1 ms | 211.6 ms | 211.6 ms | 81.4 KB |
| `/rules` | 111.4 ms | 129.9 ms | 129.9 ms | 126.1 KB |

The version endpoint was skipped because the demo server has no Supabase project. Its 503 error
envelope and headers were still checked. These are dev-server timings, not a production
certification; a connected production run is required for the API suite.

## Open items

- Add database time and query count to `Server-Timing`. The Supabase client does not expose a
  per-request counter yet.
- Run `API_BASE=https://… API_CHECK_MODE=fail pnpm api:check` against a connected staging server and
  record the production p95.
- The legacy `/api` paths keep their old bodies until 2027-01-31. Move the remaining clients to
  `/api/v1` before that date.
- `/api/email/send` and the feedback digest must stay queued; a blocking provider call is a defect
  under the standard's §8.2 rule 9.
