# Brief: FOUNDATION (runs alone, first)

Branch `ws/foundation`, worktree `teeline-ws-foundation`, from `feat/workspace`.
Goal: turn the repository into a pnpm monorepo that adds a new app, `apps/ops`, without changing how the
live app builds or behaves, and give the other workstreams a working shell to build into.

Read first: `docs/workspace/SPEC.md` (all of it), `AGENTS.md`, the live app's `src/app/globals.css`,
`src/app/layout.tsx`, `src/components/ui/*`, `src/proxy.ts`, `docs/brand/README.md`, root `package.json`,
`tsconfig.json`, `biome.json`, `vitest.config.ts`, `.github/workflows/ci.yml`, `vercel.json`.
Navigation reference (structure only, NOT its card style): `S:/Dev/golf-management-system-sl/ws-ref/teeline-ops-portal.html`.
The owner rejected that portal's callout boxes with a gold side bar. Do not copy them.

Already in the tree, do not overwrite or edit: `apps/ops/src/lib/db/**` (types, constants, permissions),
`apps/ops/scripts/workspace-rls.mjs`, `apps/ops/seed/nov17-next-steps.json`.

## Do, in this order

### 1. Monorepo plumbing (the live app must stay green and unchanged in meaning)
- `pnpm-workspace.yaml`: add `packages: ["apps/*", "packages/*"]`; keep the existing `allowBuilds`.
- Root `tsconfig.json`: exclude `apps` and `packages` so the live app's typecheck does not read them.
- Root `biome.json`: make `pnpm lint` also cover `apps/**` and `packages/**` (ignore `.next`, `node_modules`,
  `seed/out`). The live app's lint result must not change.
- Root `package.json`: add scripts only: `"dev:ops": "pnpm --filter @teeline/ops dev"` and
  `"check:ops": "pnpm --filter @teeline/ops check"`. Change nothing else, and do not touch the `next` version.
- `.github/workflows/ci.yml`: add ONE new job `ops` (install with `--frozen-lockfile`, then
  `pnpm --filter @teeline/ops check`), and a deploy-policy step for `apps/ops/vercel.json` like the existing
  one. Leave the existing jobs exactly as they are.
- After this step run at the repo root: `pnpm typecheck`, `pnpm lint`, `pnpm test`. All must pass exactly
  as before. (Root `pnpm build` is known to fail at its last step on a Next.js security advisory. That is
  expected and not yours to fix. Do not run it.)

### 2. `packages/brand`
- `package.json` named `@teeline/brand`, private. `tokens.css`: a copy of the live app's design tokens
  (every CSS variable block in `src/app/globals.css`: `:root`, the dark `@media (prefers-color-scheme: dark)`
  block, the `[data-theme="light"]` and `[data-theme="dark"]` blocks, and the `@theme inline` mapping that
  turns them into Tailwind colours), same names and values. Do not invent or rename tokens.
- A test in `apps/ops` (for example `apps/ops/src/lib/brand-drift.test.ts`) that reads the live
  `src/app/globals.css` and `packages/brand/tokens.css` and fails if any token value differs.

### 3. `apps/ops` scaffold
- `package.json` name `@teeline/ops`, private. Scripts: `dev` (port 3200), `build`, `start`,
  `typecheck` (`tsc --noEmit`), `lint` (`biome check .`), `test` (`vitest run`),
  `test:rls` (`node scripts/workspace-rls.mjs ../../supabase/migrations`), and
  `check` = typecheck, lint, test, test:rls, build, in that order.
- Add ALL dependencies now, once. Nobody else may edit `package.json` or the lockfile afterwards.
  Use `pnpm --filter @teeline/ops add ...`. Runtime: `next@16.4.6` (exact; the live app's 16.4.2 is flagged
  by a security advisory, 16.4.6 is not), `react`, `react-dom` (same versions as the live app),
  `@supabase/ssr`, `@supabase/supabase-js`, `@tailwindcss/postcss`, `tailwindcss`, `postcss`, `tw-animate-css`,
  `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `zod`, the four
  `@fontsource` packages the live app uses, `yjs`, `y-protocols`, `@supabase-labs/y-supabase@0.1.0` (EXACT, no
  caret), `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, and the Tiptap packages at exactly
  `3.34.0`: `@tiptap/react`, `@tiptap/pm`, `@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/y-tiptap`
  (a peer; use the version its peer range asks for), `@tiptap/extension-collaboration`,
  `@tiptap/extension-collaboration-caret`, `@tiptap/extension-table`, `@tiptap/extension-placeholder`.
  Dev: `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `vitest`, `jsdom`,
  `@testing-library/react`, `@testing-library/user-event`, `@electric-sql/pglite`, `@playwright/test`,
  `@biomejs/biome` (same version as root).
- `next.config.ts`, `tsconfig.json` (strict, `noUncheckedIndexedAccess`, `@/*` to `./src/*`),
  `postcss.config.mjs`, `vitest.config.ts` (node environment by default; tests that need the DOM opt in with
  a `// @vitest-environment jsdom` comment), `.gitignore` (`.next`, `node_modules`, `.tmp`, `seed/out`),
  `.env.example` with empty values for `OPS_ENABLED`, `OPS_DEMO`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` and a comment on each.
- `vercel.json`: same deployment policy shape as the root `vercel.json` (only `main` and `staging`), framework
  nextjs.
- `public/brand/`: copy the logo SVGs the shell needs (header lockup, symbol, app icon) from the live
  `public/brand`. Assets are bundled; no external font, script or image calls anywhere.

### 4. Access, flag and data plumbing (all under `apps/ops/src`)
- `lib/env.ts` and `lib/flags.ts`: `opsEnabled()` is true only when `OPS_ENABLED === "1"`. `demoMode()` is true only
  when `OPS_DEMO === "1"` AND `NODE_ENV !== "production"` AND `NEXT_PUBLIC_SUPABASE_URL` is unset. It must be
  impossible to enable demo in a production build. Pure functions, unit tested including those cases.
- `lib/supabase/`: browser client and server client (cookies) using `@supabase/ssr`, typed with `Database` from
  `lib/db/types`. (DOCS owns the private-channel wrapper; do not write it here.)
- `lib/auth/`: `getViewer()` returns the signed-in user and their `workspace_members` row (or null); a pure
  `decideAccess({ enabled, signedIn, member })` returning `"not_found" | "login" | "no_access" | "allow"` per SPEC
  section 4, unit tested for every branch (flag off, signed out, no row, suspended row, active row).
- `src/proxy.ts`: refreshes the Supabase session cookie only, and answers 404 for every path when the flag is
  off. No redirects there. The matcher must skip static assets.
- `lib/repos.ts`: `getRepos()` returns `{ docs, board, tasks, members }`. Create stub files
  `lib/docs/repo.ts`, `lib/board/repo.ts`, `lib/tasks/repo.ts`, `lib/members/repo.ts`, each exporting an empty
  interface, `createSupabase<X>Repo(client)` and `createDemo<X>Repo()` stubs. The domain owners fill them in; do
  not put real logic in them. Demo set only when `demoMode()` is true; if Supabase is unconfigured and demo is off,
  `getRepos()` throws a clear error (fail closed).

### 5. UI primitives and shell
- `components/ui/`: Button (primary, secondary, ghost, danger; sizes), Card (with header, body, footer),
  Badge, Avatar (initials, stable colour from an id), Input, Textarea, Select (styled native), Label, Dialog and
  Sheet (use `radix-ui`), Tabs, EmptyState, Skeleton. Read the live app's `src/components/ui/button.tsx` and
  `sheet.tsx` and follow their conventions. Everything uses the tokens, nothing hard-codes a colour.
- `components/shell/`: desktop sidebar (from 1024px: the TeeLine header lockup, nav items, active state), top bar,
  user menu (display name, role, sign out), theme toggle (light, dark, system, remembered, no flash on load, no
  external script), mobile: a bottom nav plus a top-left hamburger that opens a Sheet with the full menu, sign out
  and theme. Nav items: Overview `/`, Documents `/docs`, Pipeline `/board`, Tasks `/tasks`, Settings `/settings`
  (put the list in `components/shell/nav.ts`, unit tested). 44px touch targets. Visible focus rings.
- `app/layout.tsx` (fonts bundled via `@fontsource`, theme boot, metadata `robots: noindex`), `app/globals.css`
  (imports `packages/brand/tokens.css`, Tailwind v4, base styles), `app/not-found.tsx`, `app/login/page.tsx`
  (email and password form posting to a server action; plain error messages; no password reset in this phase;
  redirect to `/` when already signed in), `app/(app)/layout.tsx` (the gate from SPEC section 4 using
  `decideAccess`; renders the shell with the viewer's role; a plain "no access" page that fetches nothing).
- Placeholder pages that say what is coming, using EmptyState, so the nav works: `app/(app)/page.tsx`,
  `app/(app)/docs/page.tsx`, `app/(app)/board/page.tsx`, `app/(app)/tasks/page.tsx`,
  `app/(app)/settings/page.tsx`. They pass to their owners afterwards.

## Acceptance
- `pnpm --filter @teeline/ops typecheck`, `lint`, `test`, `test:rls` all pass (state the counts; `test:rls` must
  show 91 passed, 0 failed).
- Root `pnpm typecheck`, `pnpm lint`, `pnpm test` pass, same as before you started.
- `OPS_DEMO=1 pnpm --filter @teeline/ops dev` serves `/` with the shell and the placeholder, light and dark,
  and at 390px width the bottom nav and hamburger work. With `OPS_ENABLED` unset every route is 404.
- One `next build` of `@teeline/ops` through the lock, passing. Report its result.
- Commits on your branch, small and plain. Do not edit outside your owned paths (SPEC section 9).
