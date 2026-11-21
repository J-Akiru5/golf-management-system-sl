# Brief: GOD MODE (the owner's view of every account, with access control)

Branch `teeo/godmode`, from `feat/teeo-byok`. Common rules attached. Another builder is adding
`apps/ops/src/app/(app)/settings/ai-providers/**`, `apps/ops/src/lib/ai/**`, `src/lib/ai/**` and the
migration `20261123000000_ai_provider_settings.sql` at the same time; do not touch those.

## What the owner asked (decisions made on 21 Nov 2026)

"As owner I can see all the active users and their roles; make this a superadmin god-mode view for
me. I can give and revoke access, as well as other relevant operations." Answers:

- **Scope: every Supabase account** (workspace members, golf desk staff, tabulator accounts, player
  accounts, and any other login).
- **Accounts are created by email invitation** from the workspace; the person sets their own password
  from the email link. The owner never sees or chooses a password.
- **Revoke = a reversible suspend**: it removes the person's roles in the chosen apps, keeps a record
  of what they had so a restore puts it back, and signs them out everywhere. No deletion.
- **Extras: an audit log, reset password + sign out everywhere, an activity view (last sign-in, last
  active, inactive 30+ days flagged), bulk actions.**

## Read first

`supabase/migrations/20261120000100_workspace_members.sql` (`ws_has_role`, `ws_add_member`,
`ws_list_members`, the member guard and last-owner protection), `20261017000000_init.sql` and
`20261019000000_staff_auth_audit.sql` (`club_members`, roles `owner`/`organizer`/`desk`,
`has_club_role`), how tabulator accounts are marked (`app_metadata.scorecard_role = 'tabulation'`,
see `scripts/` and `docs/STAFF_ACCESS.md`), `players.user_id` (player accounts), and the ops app:
`apps/ops/src/app/(app)/settings/members/**`, `components/settings/*`, the sidebar navigation,
`apps/ops/src/lib/supabase/*`, the login page and middleware.

## You own

- `supabase/migrations/20261123000100_god_mode.sql` (new) and `docs/god-mode/apply-on-live.sql` (new).
- `apps/ops/src/app/(app)/admin/**` (new), `apps/ops/src/app/auth/**` (new: confirm and set-password),
  `apps/ops/src/components/admin/**` (new), `apps/ops/src/lib/admin/**` (new), the sidebar navigation
  file (add one owner-only item "Admin"), `apps/ops/src/lib/supabase/*` only to add a server-only
  service-role client, the ops middleware only to let `/auth/*` through unauthenticated,
  `apps/ops/.env.example`.

## 1. Database (`20261123000100_god_mode.sql`, not applied by you)

- `public.god_audit` (`id`, `at`, `actor uuid`, `target uuid`, `target_email text`, `action text`,
  `details jsonb`, `reason text`). RLS on, no policies; read through a function.
- `public.god_suspensions` (`user_id uuid primary key`, `suspended_at`, `suspended_by`, `reason`,
  `apps text[]`, `previous jsonb` (the workspace role and status, the desk roles per club, the
  tabulator flag), `restored_at`). RLS on, no policies.
- Security definer functions, `set search_path = ''`, every one refusing unless
  `public.ws_has_role(array['owner'])` (`42501`), granted to `authenticated` only, each writing one
  `god_audit` row:
  - `god_list_accounts()` returns one row per `auth.users` account: id, email, display name (from the
    workspace member row, else the user metadata name), created_at, `last_sign_in_at`, last active
    (the newest `auth.sessions` refreshed/updated time), email confirmed or invited-pending, banned,
    workspace role and status, desk roles (club name + role for each `club_members` row), tabulator
    flag (`raw_app_meta_data->>'scorecard_role'`), linked player (name, from `players.user_id`), and
    suspension state. It never returns password hashes, tokens or session ids.
  - `god_set_workspace_role(p_user, p_role, p_reason)` (`owner|partner|member|none`; `none` removes
    the member row), keeping the last-owner protection.
  - `god_set_desk_role(p_user, p_club, p_role, p_reason)` (`owner|organizer|desk|none`).
  - `god_suspend(p_user, p_apps text[], p_reason)` (apps from `workspace`, `desk`, `tabulator`):
    records `previous`, removes those roles, deletes the user's rows in `auth.sessions` (signing them
    out everywhere), refuses to suspend the last active owner or yourself.
  - `god_restore(p_user, p_reason)`: puts back exactly what `previous` held.
  - `god_sign_out(p_user, p_reason)`: deletes the user's `auth.sessions` rows.
  - `god_record(p_target, p_action, p_details, p_reason)`: for actions the server does through the
    Auth admin API (invite, tabulator flag, reset email) so they are audited too.
  - `god_audit_list(p_limit, p_before, p_action, p_target)` for the log page.
- Self-check `do` block. `docs/god-mode/apply-on-live.sql` = header, `begin;`, migration, `commit;`,
  check queries.

## 2. Server side (ops app)

- A **server-only** service-role client (`SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_ROLE_KEY`),
  used only inside server actions **after** the caller is confirmed as an active workspace owner (call
  `ws_has_role` through the user's own session first). If the key is absent, the invite and tabulator
  controls are disabled with "Needs the service-role key on this project"; everything else (which
  goes through the owner-gated functions) still works.
- Server actions: list (calls `god_list_accounts`), set workspace role, set desk role, set tabulator
  on/off (Auth admin `updateUserById` app_metadata, then `god_record`), suspend, restore, sign out,
  **send password reset** (`resetPasswordForEmail` with `redirectTo` = `<ops origin>/auth/confirm?next=/auth/set-password`,
  then `god_record`), **invite** (`auth.admin.inviteUserByEmail(email, { redirectTo: <ops
  origin>/auth/confirm?next=/auth/set-password, data: { display_name } })`, then apply the chosen
  workspace role / desk role / tabulator flag to the returned user id, then `god_record`), and the
  bulk variants (loop the single actions, report per-row results). Every action takes an optional
  reason; suspend, role removal and bulk actions require one (at least 5 characters).
- `apps/ops/src/app/auth/confirm/route.ts`: verifies the `token_hash`/`type` (invite or recovery)
  with `verifyOtp`, sets the session cookie and redirects to `next`.
  `apps/ops/src/app/auth/set-password/page.tsx`: a signed-in page with "New password" and "Confirm",
  minimum 10 characters, `updateUser({ password })`, then to `/`. Plain, on-brand, works for both
  invites and resets.

## 3. The Admin page (`/admin`, owner only; anyone else gets a plain "Only a workspace owner can open Admin")

Use the ops app's UI kit (`components/ui`), its tokens and fonts, light and dark. Dense but calm,
like a real admin console.

- **Header**: "Admin", a short line "Every account, its access, and what changed", and stat chips:
  total accounts, active staff, suspended, invited (pending), inactive 30+ days.
- **Accounts table**: checkbox, person (name + email), Workspace (role badge or "none"), Desk (club +
  role badges), Tabulator (badge), Player (linked name or "none"), Status (Active / Suspended /
  Invited / Unconfirmed / Banned), Last sign-in, Last active (relative, with a muted "inactive" flag
  over 30 days). Search by name or email; filters for app, role, status and "inactive 30+ days";
  sortable columns; paginated or virtualised for hundreds of rows.
- **Row menu / side sheet** (click a row): the full picture plus actions: change workspace role,
  change desk role, tabulator on/off, suspend (choose apps, reason) or restore, send password reset,
  sign out everywhere, and that person's own audit history. Destructive actions confirm in a dialog
  that names the person and the effect.
- **Invite** button: email, display name, workspace role, desk role (club + role), tabulator flag,
  optional note; on success, the row appears as Invited.
- **Bulk bar** when rows are selected: change workspace role, suspend, restore, sign out everywhere.
- **Audit log** tab: time, actor, target, action, details, reason; filters by action, person and date.

## Acceptance

Root `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm --filter @teeline/ops typecheck`, `pnpm
--filter @teeline/ops lint`, `pnpm --filter @teeline/ops test` all pass, with tests for the pure
helpers (status derivation, the inactive flag, the filters, the previous-roles snapshot shape) and the
owner gate in the server actions (mocked). Never connect to a database, never send an email. Final
report as in the common rules, including the owner steps (env var, Supabase redirect URL, email
settings).
