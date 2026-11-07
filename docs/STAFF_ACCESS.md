# Staff access: provisioning, rotation and the phone case

This is the documented procedure for the people who run the tournament desk. It replaces shared
default credentials with one account per person, a confirmed email address and a reset flow. The app
does not contain a default password, and no one should be given one.

## Local development sign-in (not a club account)

A developer working on the desk can sign in without a Supabase project. On `pnpm dev` with no
`NEXT_PUBLIC_SUPABASE_URL`, `/login` accepts one fixed development account:

| Field | Value |
| --- | --- |
| Email | `staff@gmail.com` |
| Password | `TeeLine-Desk-Dev-2026!` |
| Role | `desk` (from the development session, not from `club_members`) |

Start the app with `pnpm dev`, open `http://localhost:3000/login`, sign in, and the app lands
on `/admin`. The account chip reads `staff@gmail.com` with `Desk · development sign-in`. The
sample password is rated Strong by the app's own validator; the weak `password123` is still
rejected and remains on the common-password list.

This path is inert in a production build (`next build` and `next start` run with
`NODE_ENV=production`) and inert whenever Supabase is configured, where the real staff
accounts take over. It is a development cookie on the local dev server, never a database
account: do not copy these details into a deployed environment, and do not create this
address as a staff account in the real project.

## Who may do what

| Role | Where it comes from | Can do |
| --- | --- | --- |
| `owner` | `club_members.role` | everything, including staff management and production-sensitive settings |
| `organizer` | `club_members.role` | event settings, publishing, imports, staff management |
| `desk` | `club_members.role` | register players, edit entries, change playing days, print |
| player | a linked `players.user_id` | read their own entry and published start only |

Staff identity is a `club_members` row. A player account is never a `club_members` row. A signed-in
account with no club row lands in the player area and cannot open the desk.

Imports are owner/organizer only. The interface hides the controls from the desk, and the database
functions refuse the write with `42501` even if the browser is tampered with.

## Provisioning a staff account

All of this is an owner action. Do not create an account by sharing an existing person's password.

1. In Supabase, open **Authentication → Users → Add user** (or send an invite if the project's email
   settings are configured). Use the person's own work address. One person, one account.
2. Confirm the email address. An unconfirmed account cannot sign in; the login page now says so and
   offers a new confirmation link.
3. Add the club row. Either use the Supabase table editor or the SQL editor with the person's user id:
   ```sql
   insert into public.club_members (club_id, user_id, display_name, role)
   values ('<club-id>', '<user-id>', '<display name>', 'desk');
   ```
   Use `owner` only for the person who is accountable for the club's data. Use `organizer` for the
   golf pro or event lead. Use `desk` for registration staff.
4. Ask the person to use **Forgot password** on the sign-in page. They choose their own password.
   The owner never sees it.
5. Ask them to sign in once and confirm the version label. Record the date in the club's own handover
   note.

Never put a password in a chat, a spreadsheet, a document or a commit. Never reuse the owner account
on a shared phone.

## Rotating the existing test accounts

The project currently has two test-only staff accounts (the plan calls them `admin` and `member1`).
Before the event:

1. Sign in as the owner and use **Forgot password** to set a new, individual password for the owner.
2. Do the same for the desk test account, or disable it if the real desk person now has their own.
3. Check **Authentication → Users** for accounts that are unconfirmed, never used or not expected.
   Do not delete an account that owns data without checking; disable it or remove its `club_members`
   row first.
4. Confirm every remaining staff account has a `club_members` row with the intended role.

## The phone case

A sign-in failure on a phone is usually one of these, in this order:

1. **The account is unconfirmed.** The login page now says "This account exists, but its email address
   has not been confirmed" and offers a new link. Confirm the address first.
2. **The account has no staff row.** It may be a player account created from the sign-up form. It will
   open the player area, not the desk. Add a `club_members` row if the person is staff.
3. **The email is not the account email.** The form asks for an email address, not a username.
4. **The reset link opened in the wrong browser.** The reset flow stores a verifier in the browser
   that requested the link. If the email app opens its own built-in browser, the verifier is missing
   and the link fails. Open the link in the same browser, or copy it there.
5. **The password is simply wrong.** Use the reset flow; do not ask another person for their password.

If none of these explains it, record the exact on-screen error, the time and the account's masked
email, then check the provider's auth log. The app does not have access to the provider's audit log.

## Checking an account without exposing it

In the Supabase dashboard, `Authentication → Users` shows confirmation state, last sign-in and
banned state. `public.club_members` shows the role. Mask email addresses in any report.

The app's `audit_log` records who changed players, registrations, days and imports. It stores record
ids and changed column names, never the values. Query it as an owner:

```sql
select created_at, actor_id, action, entity, entity_id, batch_id, changed_columns, result
  from public.audit_log
 where club_id = '<club-id>'
 order by created_at desc
 limit 50;
```

## What not to do

- Do not add a service-role key to the browser, a Vercel `NEXT_PUBLIC_*` variable, a client component
  or a commit.
- Do not create a shared `admin@` account for several people.
- Do not reset another person's password and tell them the new one. Send them the reset flow.
- Do not delete the two historical import batches to make the dashboard look clean. They are the
  evidence of the pre-fix failure; annotate them instead.
