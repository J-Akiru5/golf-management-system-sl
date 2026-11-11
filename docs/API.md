# API contract for TeeLine Golf

The binding standard is [`API_REGULATION.md`](../API_REGULATION.md) at the repository root. This
file records the project decisions the standard asks for, the endpoints the standard covers, and
the places where this app deliberately differs.

## Project decisions

- **JSON casing: camelCase.** The standard allows one choice; the app already uses camelCase in
  every JSON document and in the Supabase RPC payloads.
- **The regulated surface is HTTP.** The public pages are Next.js server-rendered pages, and the
  data underneath them is a set of Supabase `SECURITY DEFINER` functions. Those RPCs are not HTTP
  endpoints, do not have a public URL, and cannot carry an HTTP envelope or `Server-Timing`. Their
  output is already an allow-listed projection, and their input is parameterised. The standard's
  envelope, versioning and transport rules apply to the `/api` route handlers.
- **Versioned paths are additive.** New HTTP endpoints live under `/api/v1/...`. The existing
  `/api/...` paths keep their current bodies for the clients that already use them and are
  dual-served from the same implementation. **Legacy `/api` paths are removed on 2027-01-31.**
- **The success/error envelope is mandatory on `/api/v1`.** Legacy paths keep their old body until
  the removal date; they still carry `X-Request-Id` and `Server-Timing`.
- **Page requests are measured, not wrapped.** Next.js does not let a server component add a timing
  header after the render, so `Server-Timing` is on the API routes. Page p95 and response size are
  measured by `pnpm api:check` at the HTTP boundary.

## Endpoint inventory

| Method and path | Audience | Level | Notes |
|---|---|---|---|
| `GET /api/v1/pairings/version` | public | L2 | Envelope, ETag, shared cache; the polling hot path |
| `GET /api/pairings/version` | public, legacy | L1 | Same read, old body; removed 2027-01-31 |
| `GET /api/player/board` | signed-in player | L1 | Player board, current body |
| `POST /api/revalidate-pairings` | desk owner/organizer | L1 | Auth-gated cache refresh |
| `POST /api/import/preview`, `/commit`, `/suggest-mapping` | desk | L1/L3 | File and AI work; not a first-render hot path |
| `POST /api/scoring/scan/presign`, `/extract`, `/demo-object` | desk | L1/L3 | External scan service; keep out of the render path |
| `POST /api/storage/presign` | desk | L1 | Private upload URL |
| `POST /api/email/send`, `/api/feedback/digest` | staff/cron | L1 | Email is queued by the outbox; the route must not block a page |

The public page requests in the hot suite are `/`, `/pairings`, `/roster`, `/leaderboard` and
`/rules`.

## Performance rules for this app

- **One read per independent resource, started in parallel.** `/pairings` starts the published
  pairings, the programme and the release state together. `/leaderboard` does the same with the team
  leaderboard, the release state and the programme. Do not await one public read before starting the
  next.
- **No auth round trip for a signed-out visitor.** `/pairings` checks for the Supabase session
  cookie before calling `auth.getUser()`. The "You" marker is the only thing that lookup adds.
- **Explicit projections.** Public RPCs return only the documented public fields. Do not add a
  `select *` on a hot path.
- **Bounded public lists.** The event is at most 200 teams / 400 players. Desk lists paginate at 50
  rows (`src/lib/data/paging.ts`); public pages load the field once because players search it
  locally. A payload over 256 KB must be split or paginated.
- **Indexes.** Filters and joins in the public RPCs are on `tournament_id`, `club_id`, `round_id`,
  `player_id`, `pair_id` and the round/day keys; the schema's unique keys and indexes cover them.
  Adding a new filter or sort key requires its index in the same migration.
- **Caching.** `/api/v1/pairings/version` and its legacy path send
  `Cache-Control: public, s-maxage=10, stale-while-revalidate=20` plus a weak `ETag`. Public HTML is
  not cached publicly: it carries the saved language and the signed-in player's "You" marker.
- **Writes stay off the render path.** Email, PDF, scan and import work runs in its route or the
  outbox, never inside a page render.

## Observability

`withApiTiming()` in `src/lib/api/timing.ts` is the single timing layer for the route handlers. It
adds `X-Request-Id` and `Server-Timing` to every response, including errors and 304s, and logs
`WARN SLOW` above 300 ms and `ERROR VIOLATION` above 400 ms with the route template, method, status,
duration and request id. A client-supplied request id is accepted only if it is a short safe token.

The database time and query count are not in `Server-Timing` yet. The Supabase client does not
expose a per-request query counter, so the page and endpoint timings are totals. That is recorded as
a gap, not claimed as a measurement.

## Verification

```bash
pnpm api:check                 # starts a demo dev server, warn mode
API_CHECK_MODE=fail pnpm api:check
API_BASE=https://staging.example API_CHECK_MODE=fail pnpm api:check
```

The check reports `measured / skipped / total`, p50/p95/max and response size. It checks the page
suite coverage floor of 90%. The version endpoint suite is only certified in a connected
environment; a demo run reports it as skipped, not passed.

Run it against a production build for meaningful timings:

```bash
pnpm build
pnpm start --port 3000
API_BASE=http://localhost:3000 API_CHECK_MODE=fail pnpm api:check
```

CI runs `pnpm api:check` in warn mode while the backlog is burned down. Switch to fail mode after
the page and endpoint suites have a connected test environment.

## Deviations and backlog

- Legacy `/api` paths do not use the envelope; they keep their existing bodies until 2027-01-31.
- The Supabase RPCs are not HTTP endpoints and are outside the envelope/versioning rules.
- Page responses do not carry `Server-Timing`; their TTFB and size are measured externally.
- Database time and query count are not broken out in `Server-Timing`.
- `/api/email/send` and the feedback digest involve an external mail provider. Keep them queued and
  out of the request path; a blocking send is a defect under §8.2 rule 9.
- The import and scan routes are long-running and are tracked as L3 candidates, not first-render
  hot paths.
