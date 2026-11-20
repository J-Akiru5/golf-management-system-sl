# Brief: UI CHECKS (a browser check script for the workspace)

Branch `ws/ui-checks`, worktree `teeline-ws-ui-checks`, from `feat/workspace` after all feature workstreams are merged.
Goal: one script that drives the workspace in a real browser in demo mode and fails loudly when a page is broken.

Read first: `docs/workspace/SPEC.md` (verification section), the root `scripts/verify-ui.mjs` (the live app's equivalent: copy
its structure and helpers' style, do not import from it), `apps/ops/package.json`, `apps/ops/src/app/**` (the routes).

You own: `apps/ops/scripts/verify-ui.mjs`, `apps/ops/package.json` (only to add the `check:ui` script), `apps/ops/playwright.*`
if needed. Nothing else.

## Build
- `pnpm --filter @teeline/ops check:ui` starts `next dev` (or a built server) with `OPS_ENABLED=1 OPS_DEMO=1` on a free port,
  waits for readiness, runs the checks, and always stops the server, even on failure.
- Playwright (already a root dev dependency; if it is not resolvable from `apps/ops`, import it from the root and say so).
- For each of `/`, `/docs`, `/docs/<a demo id>`, `/board`, `/tasks`, `/settings`, `/settings/members`, at desktop (1280x800)
  and phone (390x844), in light and dark: the response is 200, the page has a visible `h1`, there is no horizontal scroll
  (`scrollWidth <= clientWidth + 1`), no console errors, and no failed same-origin requests.
- Behaviour checks in demo: create a document and see it listed; move a board card with the Move menu and see the column count
  change; create a task and filter it under My tasks; as the demo owner add a member and see the row; the last-owner rule
  disables the demote control.
- A route with the flag off returns 404 (start a second short-lived server or use the gate's testable function; say which).
- Failures print the route, viewport, theme and the reason, then exit 1. Success prints a one-line summary per route.

## Acceptance
`pnpm --filter @teeline/ops check:ui` passes on the merged tree, run once through the build lock. A deliberate break (for
example hiding the `h1` on one page locally) makes it fail, and you revert that break. Nothing outside your owned paths changed.
