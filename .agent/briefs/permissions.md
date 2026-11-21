# Brief: PERMISSIONS (granular page access in the workspace)

Branch `teeo/permissions`, from `feat/teeo-byok` **after god mode is merged** (it builds on the
Admin page and the `god_audit` table). Common rules attached.

## The owner's words and decisions (21 Nov 2026)

"We need granular control. My protocol: hide the page (navbar) for a user with no access to it."
Decisions: **roles plus per-user overrides**; **the workspace now**, designed so the golf desk's pages
plug into the same model later (the desk keeps its owner/organizer/desk rules for now, nothing changes
there before the 21 to 22 Dec event).

## The model

- **Pages (permission keys)**: `overview`, `documents`, `pipeline`, `tasks`, `settings.profile`,
  `settings.members`, `settings.ai_providers`, `admin`. Put them in one registry
  (`apps/ops/src/lib/access/pages.ts`) with label, route prefix, nav icon and the levels it supports,
  so a new page (or later a desk page, with an `app: "desk"` field) is one entry.
- **Levels**: `none` (hidden, refused), `view` (read only: every create/edit/delete control hidden and
  the server action refuses), `edit` (full).
- **Role defaults** (a matrix the owner edits): owner = edit everywhere and cannot be lowered;
  partner = edit on overview, documents, pipeline, tasks, settings.profile, view on settings.members,
  none on settings.ai_providers and admin; member = edit on overview, documents, tasks,
  settings.profile, view on pipeline, none on settings.members, settings.ai_providers and admin. Seed
  these so today's behaviour does not change.
- **Per-user overrides**: on any person, any page can be set to `none`, `view` or `edit`, or "use role
  default". An override wins over the role. The owner's own row cannot be overridden down, and the
  last owner keeps everything.
- **Effective access** = override if present, else the role default. One pure function
  (`effectiveAccess(role, overrides, page)`), well tested.

## Enforcement (all three, not just the nav)

1. **Navbar**: an item is rendered only when the person's effective level is `view` or `edit`. Same
   for the Settings tabs. No disabled or greyed items: hidden.
2. **Routes**: every page under `(app)` checks access on the server before rendering; `none` gives the
   app's not-found page (not a hint that the page exists). Do this in one shared helper used by each
   page or its layout, not by trusting the nav.
3. **Data**: every server action checks `edit` for writes and `view` for reads, and the database
   functions enforce it too: add a `ws_can(p_page text, p_level text)` SQL function and call it at the
   top of the existing workspace write functions and policies where a page maps cleanly (documents,
   pipeline cards, tasks, members, AI providers). Where a table is protected by RLS policies, extend
   the policy with `ws_can`. Keep the existing role checks as well; this only narrows.

## Database (`supabase/migrations/20261123000200_workspace_permissions.sql`, not applied by you)

- `public.ws_role_permissions` (`role`, `page`, `level`, primary key `(role, page)`), seeded as above.
- `public.ws_user_permissions` (`user_id`, `page`, `level`, `updated_by`, `updated_at`, primary key
  `(user_id, page)`).
- RLS on both, no direct policies; read and write through owner-gated security definer functions:
  `ws_my_access()` (any active member: their effective level per page, used by the nav),
  `ws_permission_matrix()` (owner: the role matrix and every override), `ws_set_role_permission(p_role,
  p_page, p_level, p_reason)`, `ws_set_user_permission(p_user, p_page, p_level_or_null, p_reason)`
  (null clears the override). Each change writes a `god_audit` row.
- `ws_can(p_page, p_level)` as above. Self-check block. `docs/permissions/apply-on-live.sql`.
- If the tables do not exist yet (migration not applied), the app falls back to today's role rules,
  so nothing locks anyone out before the owner runs the SQL.

## UI (in the Admin page from god mode)

- A **Permissions** tab: the role matrix as a table (pages down, roles across, a three-state segmented
  control per cell: No access / View / Edit; the owner column fixed at Edit), with a reason box and
  Save.
- In each person's side sheet: an **Access** section listing every page with their effective level,
  where it comes from (role default or override), and a control to override or reset it.
- A short explanation at the top: "A page with No access is hidden from that person's menu and
  refused if they open its address."

## Acceptance

Root and `@teeline/ops` typecheck, lint and test pass, with tests for `effectiveAccess`, the nav
filtering, the route guard and the server-action checks (mocked). Never connect to a database. Final
report as in the common rules.
