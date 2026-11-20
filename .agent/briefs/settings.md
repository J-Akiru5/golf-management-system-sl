# Brief: SETTINGS (profile, workspace info, members and roles)

Branch `ws/settings`, worktree `teeline-ws-settings`, from `feat/workspace` after FOUNDATION is merged.
Goal: the Settings area of the workspace. The owner edits members and roles here, so it matters. It is the
first user-management and role-based access control screen this project has had.

Read first: `docs/workspace/SPEC.md` (section 4 especially), `supabase/migrations/20261120000100_workspace_members.sql` (read
all of it: the guard trigger and the two owner-only functions are the rules), `apps/ops/src/lib/db/*`
(types, `WORKSPACE_ROLES`, permissions), the stub `apps/ops/src/lib/members/repo.ts`, `apps/ops/src/lib/repos.ts`,
`apps/ops/src/lib/auth/*`, the UI primitives and shell in `apps/ops/src/components`.

You own: `apps/ops/src/app/(app)/settings/**`, `apps/ops/src/components/settings/**`, `apps/ops/src/lib/members/**`.
Nothing else. You do not create accounts: that stays in the Supabase dashboard, and there is no service-role key in this app.

## Build

### 1. The rules as pure functions (`lib/members/rules.ts`), unit tested first
Mirror what the database enforces, so the interface can explain and the demo can behave the same:
- `canChangeRole(viewer, target, newRole, members)`, `canSuspend`, `canRemove`: only an owner; nobody may demote, suspend or remove the
  last active owner; a non-owner may change only their own display name.
- `explainBlock(...)` returns the plain sentence to show when an action is not allowed.
- `mapMemberError(error)`: map database errors to plain messages: `42501` "Only an owner can do that.", `P0002` "No account has that
  email address. Create the account in Supabase first, then add them here.", `23505` "That person is already a member.",
  `23514` "The workspace needs at least one active owner.", anything else "Something went wrong. Nothing was changed."
Test every rule and every message.

### 2. Repository (`lib/members/repo.ts`)
`MembersRepo`: `getMe()`, `updateMyDisplayName(name)`, `listMembers()` (select from `workspace_members`: `user_id, role, status,
display_name, created_at`), `listMembersWithEmail()` (rpc `ws_list_members`, owners only), `addMember({ email, role, displayName })`
(rpc `ws_add_member`), `setRole(userId, role)`, `setStatus(userId, status)`, `removeMember(userId)`. Supabase implementation with the
typed client and an in-memory demo implementation that applies the same rules from `rules.ts` (including the last-owner rule).
Replace the FOUNDATION stub, keep its exported names. Tests for both, including the error mapping paths.

### 3. Pages
- Settings layout with tabs "Profile" and "Members".
- `/settings` (Profile): display name (editable, saves), role (read only, with the plain summary from `WORKSPACE_ROLES`), email shown
  to the person themself, theme choice (light, dark, system), a plain "About this workspace" card: it is internal, who can see it
  (active workspace members only; tournament staff and desk accounts are not included), the feature flag state, and a clear banner
  when demo mode is on ("Demo data. Nothing is saved to a database.").
- `/settings/members`: a table of members: avatar, display name, email (owners only), role, status, joined date. Owners get a role
  select, a suspend or reactivate toggle, and remove (with a plain confirmation naming the person). Everyone else sees the table with
  no controls. "Add member" (owners only): email, display name, role, with the error messages above. A card explaining the three
  roles from `WORKSPACE_ROLES`, and a plain note that creating the account itself is done in Supabase.
- Actions that the database would refuse (for example demoting the last owner) are disabled with the reason shown, but the code still
  handles the database error if it happens anyway.
- Phone width: the members table becomes stacked rows; every control is at least 44px.

## Acceptance
`pnpm --filter @teeline/ops typecheck`, `lint`, `test` pass (state counts). `OPS_DEMO=1` dev server: as the demo owner you can add, re-role,
suspend, reactivate and remove members and the last-owner rule blocks; as a demo member the same page has no controls (the demo
viewer role can be switched with a query parameter that only works in demo mode, for example `?as=member`; implement that in your own
paths only if the FOUNDATION's gate does not already provide it, otherwise use what it provides). Light, dark and 390px are usable. One
`next build` through the lock passes. Nothing outside your owned paths changed (`git diff --stat feat/workspace...HEAD`).
