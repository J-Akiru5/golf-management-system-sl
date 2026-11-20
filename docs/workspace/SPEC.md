# TeeLine Workspace: build specification

The contract for the internal ops portal. Written by the orchestrator on 20 Nov 2026. Agents build
against this file and never edit it. If something here is wrong or missing, stop and report it.

The owner's decisions behind it are in `docs/PLAN.md`, "TeeLine Workspace, the internal ops portal".

## 1. What this is

Live shared documents, a tournament pipeline board and team tasks for Syntaxure Labs, MDM Events and
ZenLabs, plus Settings for members and roles. Internal only. It is a **separate app** in this
repository, deployed as its own Vercel project, using the same Supabase project as the tournament
desk. It does not touch scoring, the draw, the tabulator, public pages or handicap logic.

Not in scope: anything in `src/` of the live app, existing auth flows, `club_members`, public pages.

## 2. Repository layout (decided 20 Nov 2026: add, do not move)

```
/                      the live tournament app, unchanged, stays at the repository root
apps/ops/              the workspace app (pnpm workspace package "@teeline/ops")
packages/brand/        shared brand tokens (copy of the live app's CSS variables) and fonts list
supabase/migrations/   shared; the workspace migrations are 20261120000100 to 20261120000400
```

Moving the live app into `apps/web` is a separate release after 22 Dec 2026. Until then nothing in
the root `src/` may import from `apps/` or `packages/`, and the root `pnpm check` must stay green and
unchanged in meaning.

Deployment: its own Vercel project, root directory `apps/ops`, production branch `main`, deployments
only for `main` and `staging` (same rule as the live project). Intended address: `teeline.syntaxure.dev`
(the owner wrote `teeline@syntaxure.dev`; read as that hostname). DNS is the owner's.

## 3. Routes (apps/ops, served from the root of its own domain)

| Path | Page | Workstream |
| --- | --- | --- |
| `/login` | email and password sign-in against the shared Supabase project | FOUNDATION |
| `/` | overview: my tasks, recent documents, pipeline snapshot | OVERVIEW |
| `/docs` | document list: create, rename, archive, search | DOCS |
| `/docs/[id]` | live collaborative editor, presence, history, save version, restore | DOCS |
| `/board` | tournament pipeline kanban | BOARD |
| `/tasks` | team tasks, list view and board view | TASKS |
| `/settings` | profile and theme; workspace info | SETTINGS |
| `/settings/members` | members and roles (owners manage; others read) | SETTINGS |

Every route except `/login` sits behind the membership gate (section 4). With the feature flag off,
every route including `/login` returns 404.

Navigation: desktop sidebar; on a phone a bottom nav plus a top-left hamburger that opens the full
menu (matching the attached portal, `ws-ref/teeline-ops-portal.html`). Light and dark both supported,
with a toggle, following `prefers-color-scheme` until the user chooses.

## 4. Access

Separate from `club_members`. A tabulator or desk account has no `workspace_members` row and sees
nothing. Table `workspace_members(user_id, role, status, display_name, ...)`, roles `owner | partner |
member`, status `active | suspended`.

Gate, in order, in `src/app/(app)/layout.tsx`:
1. `OPS_ENABLED` is not `1` → 404.
2. No Supabase session → redirect to `/login`.
3. No `workspace_members` row, or status `suspended` → a plain "no access" page. No data is fetched.
4. Otherwise render the shell with the viewer's role.

The interface hides what a role cannot do (`src/lib/db/permissions.ts`), and the database enforces the
same rules. A hidden button is never the only protection. The service-role key is never used by this
app. Adding a member goes through the owner-only function `ws_add_member(email, role, display_name)`,
which looks the account up in `auth.users` as the database definer; creating the account itself stays
in the Supabase dashboard.

The first owner is added by `supabase/seed/workspace_members.example.sql`, run by the project owner.

## 5. Data model

Source of truth: the four migrations. Types for the app: `apps/ops/src/lib/db/types.ts` (do not edit).

| Table | Purpose | Delete |
| --- | --- | --- |
| `workspace_members` | access list | owner |
| `ws_docs` | document (title, archived) | owner, partner |
| `ws_doc_states` | live Yjs state, base64, one row per doc | cascade only |
| `ws_doc_snapshots` | named versions, immutable | owner, partner |
| `ws_pipeline_cards` | pipeline cards, 7 stages, optional `tournament_id` link | owner, partner |
| `ws_tasks` | tasks, optional card and tournament link | owner, partner |
| `ws_task_comments` | comments | author, owner, partner |

Rules enforced in the database: every table needs an active member; created_by and author_id are set
from the session and cannot be spoofed or changed; a task can only be assigned to a member; the last
active owner cannot be demoted, suspended or removed; only an owner changes roles or status.

Ordering: `position` is a double. A move writes the midpoint of its new neighbours. Constants
`POSITION_MIN_GAP` and `POSITION_STEP` are in `src/lib/db/constants.ts`; when a gap gets too small,
renumber the column 1000 apart.

## 6. Realtime

All channels are **private** (`config.private = true`) and authorised by policies on
`realtime.messages` (migration part 4).

| Channel | Used for | Who sends |
| --- | --- | --- |
| `ws:doc:<doc id>` | Yjs sync and cursors for one document | members, only for a document that exists |
| `ws:board` | row changes on `ws_pipeline_cards` | the database only |
| `ws:tasks` | row changes on `ws_tasks` and `ws_task_comments` | the database only |

Board and task clients subscribe with `broadcast` events `INSERT`, `UPDATE`, `DELETE` (payload from
`realtime.broadcast_changes`). They treat events as hints and may refetch.

### Documents: decision on `@supabase-labs/y-supabase`

Checked 20 Nov 2026 by reading the published package (v0.1.0). Its `SupabaseProvider` opens its channel
with `supabase.channel(name)`, which is a **public** channel, and there is no option to make it private.
The owner's rule was to stop if the provider cannot do authorised private channels, and not to hand-roll
a provider. Decision (owner: "go anyway, as long as it is logical"): use the provider **unmodified**
and give it a Supabase client wrapper whose `channel()` always passes `config: { private: true }`.
That is a few lines in `src/lib/docs/private-client.ts`, not a provider.

The provider uses one string as both its channel name and its persistence key (read from the source:
`new SupabasePersistence(channelName, ...)`). So the provider is constructed with the bare document id
as its room name, which is a valid `doc_id` for the persistence upsert, and the wrapper's `channel(name)`
opens `ws:doc:<name>` as a private channel. The wrapper therefore both forces `private: true` and adds
the `ws:doc:` prefix. Set `maxReconnectAttempts` to a small number (10): a refused private channel
reports `CHANNEL_ERROR` and the provider's default is to retry forever. Call
`client.realtime.setAuth()` before connecting so the channel carries the user's token.

- Persistence: `SupabaseProvider` option `persistence: { table: "ws_doc_states", roomColumn: "doc_id",
  stateColumn: "state", storeTimeout: 2000 }`. It upserts the full state; the migration allows that.
- Pin `@supabase-labs/y-supabase` to `0.1.0` exactly. It is a young package.
- Known limits, to be stated in the report: persistence is last-writer-wins on the stored row (each
  client's state includes everything it has received, and live sync converges, so loss needs every
  client to disappear before syncing); named snapshots are the safety net.
- This cannot be proven end to end without a Supabase project that has Realtime Authorization. Until
  the two-account check in section 10 passes on a non-production project, the editor is **not**
  considered shippable. Fallback if it fails: Hocuspocus on the existing Render account (owner decides).
- Do not ship with "Allow public access" on in the Realtime settings; with it on, a public channel
  with the same topic could be joined by anyone holding the anon key.

Awareness: provider option `awareness: true`; set `user: { name, color }` from the member's display name
and a stable colour derived from the user id. Cursors via `@tiptap/extension-collaboration-caret`.

Restore: a restore applies the snapshot's `content` JSON to the live document as a new edit, after
writing a `pre_restore` snapshot of the current state, so history keeps both sides.

## 7. Code boundaries

```
apps/ops/src/
  app/                    routes only; thin. Data comes from repos, not from components.
  components/ui/          design-system primitives (FOUNDATION)
  components/shell/       sidebar, mobile nav, top bar, theme toggle, user menu (FOUNDATION)
  components/<domain>/    docs, board, kanban, tasks, settings, overview (each workstream)
  lib/db/                 types, constants, permissions (ORCHESTRATOR, read only for everyone else)
  lib/supabase/           browser and server clients (FOUNDATION)
  lib/auth/               session and membership gate (FOUNDATION)
  lib/env.ts, lib/flags.ts
  lib/repos.ts            registry: getRepos() returns { docs, board, tasks, members } (FOUNDATION)
  lib/<domain>/repo.ts    the domain's repository: an interface, a Supabase implementation and a demo
                          implementation (each workstream)
```

Repository pattern: each domain defines an interface in `lib/<domain>/repo.ts`, a Supabase
implementation, and an in-memory **demo** implementation seeded with believable data. `getRepos()`
returns the demo set only when `OPS_DEMO=1` **and** `NODE_ENV !== "production"` **and**
`NEXT_PUBLIC_SUPABASE_URL` is unset; in every other case it returns the Supabase set, and with
Supabase unconfigured and demo off the app fails closed. Demo mode exists so the UI can be checked in
a browser without a database. It must be impossible to enable in a production build.

Server actions or route handlers call repos on the server. Client components never receive the
service-role key (there is none) and never build SQL.

## 8. Design rules

Follow the TeeLine design system. Tokens come from `packages/brand` (a copy of the live app's CSS
variables in `src/app/globals.css`). A test must fail if the copied values drift from the live file.

- Cards: `surface-raised` background, 1px `line` border, rounded, no shadow stacks. No callout boxes
  with a coloured left border, no gradients, no emoji, no glassy panels. The owner rejected that look.
- Type: Geist for body, Manrope for UI titles, Bebas Neue for display headings only, Cormorant Garamond
  only for event names. Tabular numerals for money, counts and dates. Fonts are bundled
  (`@fontsource`); no external font or script calls.
- Gold `#B89550` is for marks, rules and small accents only, never body text. On ivory, text-size gold
  is `#755719`; on forest or charcoal it is `#D7B568`.
- Brand colours: forest `#073D2E`, gold `#B89550`, gold light `#D4B46F`, ivory `#F7F5EE`, muted green
  `#8DB39B`, charcoal `#171C19`. The wordmark is artwork, never retyped. Use the SVGs in `public/brand`.
- Light and dark must both pass: contrast of text on every surface, visible focus rings, 44px touch
  targets on phones.
- Plain language in all UI copy. No marketing words.

## 9. File ownership

One owner per path. Do not edit a path you do not own. If you need a change in someone else's path or in
a shared file, write it in your final report and stop; the orchestrator decides.

| Workstream | Owns |
| --- | --- |
| ORCHESTRATOR | `supabase/**`, `docs/**`, `CHANGELOG.md`, `.agent/**`, `apps/ops/src/lib/db/**`, `apps/ops/scripts/workspace-rls.mjs`, `apps/ops/seed/nov17-next-steps.json` |
| FOUNDATION | root `pnpm-workspace.yaml`, root `package.json` scripts, root `tsconfig.json` exclude, root `biome.json` includes, `.github/workflows/ci.yml` (one added job), `packages/brand/**`, everything under `apps/ops/` not listed elsewhere in this table, `apps/ops/package.json` (all dependencies, added once, up front), `apps/ops/vercel.json`, `apps/ops/public/**`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/not-found.tsx`, `src/app/login/**`, `src/app/(app)/layout.tsx`, `src/components/ui/**`, `src/components/shell/**`, `src/lib/{env,flags,repos}.ts`, `src/lib/supabase/**`, `src/lib/auth/**`; also the stub `lib/<domain>/repo.ts` files, which pass to the domain owner afterwards |
| DOCS | `src/app/(app)/docs/**`, `src/components/docs/**`, `src/lib/docs/**`, `apps/ops/scripts/portal-to-tiptap.mjs`, `apps/ops/seed/README.md` |
| BOARD | `src/app/(app)/board/**`, `src/components/board/**`, `src/components/kanban/**`, `src/lib/board/**` |
| TASKS | `src/app/(app)/tasks/**`, `src/components/tasks/**`, `src/lib/tasks/**` (its board view imports the kanban from BOARD after BOARD is merged) |
| SETTINGS | `src/app/(app)/settings/**`, `src/components/settings/**`, `src/lib/members/**` |
| OVERVIEW | `src/app/(app)/page.tsx`, `src/components/overview/**` (runs after the others are merged) |
| UI-CHECKS | `apps/ops/scripts/verify-ui.mjs` and the `check:ui` script entry |
| REPORT | `docs/teeline-workspace-2026-11-20.html` |
| NEXTSEC | on branch `chore/next-security` only: root `package.json`, `pnpm-lock.yaml` and whatever the Next.js upgrade strictly needs in the live app |

Nobody but FOUNDATION edits any `package.json` or `pnpm-lock.yaml`. Dependencies are added once, up
front. A workstream that needs another package says so in its report.

Tests live beside the code (`*.test.ts` or `*.test.tsx`). Every change adds tests. Do not weaken or
delete a test to make it pass.

## 10. Verification

Per worktree (`apps/ops` filter name `@teeline/ops`):

```
pnpm --filter @teeline/ops typecheck
pnpm --filter @teeline/ops lint
pnpm --filter @teeline/ops test
pnpm --filter @teeline/ops test:rls        # PGlite check of the migrations; orchestrator-owned
```

Builds are heavy and the machine has limited memory, so only **one** build runs at a time across all
worktrees. Run any build, and any command that includes a build, through the lock:

```
bash S:/Dev/golf-management-system-sl/ws-tools/build-lock.sh pnpm --filter @teeline/ops build
```

The live app's own gate is unchanged: `pnpm typecheck && pnpm lint && pnpm test` at the root, which
must still pass after FOUNDATION.

Security pass (orchestrator, before the PR): `test:rls` green (91 checks at 20 Nov); then, on a
non-production Supabase project with the migrations applied, two real accounts: a non-member gets no
rows from any workspace table and cannot join `ws:board`, `ws:tasks` or any `ws:doc:*` channel; a
member cannot delete what only owner or partner may; grep of the built client bundle finds no
service-role key. The second half needs the owner to supply that project and is not yet done.

## 11. Migrations

Written, committed, applied nowhere. The owner applies them, in order, to a non-production project
first, then production. Part 3 adds foreign keys to `public.tournaments`, which takes a very short lock;
apply it outside scoring peaks. Part 4 needs Realtime Authorization on the project. Each is recorded in
`CHANGELOG.md` as applied or not applied.
