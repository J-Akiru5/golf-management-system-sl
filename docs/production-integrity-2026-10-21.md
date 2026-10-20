# Production integrity review: imports, authentication and the player model

**Status date:** 21 October 2026
**Branch:** `feat/production-integrity`, based on `origin/develop` `4231b60`
**Production release inspected:** `v0.19.0 · 7143f20`, built 20 October 2026
**Database project:** `golf-management-system` (`egfwfyznbndunqfqzxjx`, ap-southeast-1)
**Migration in this change:** `20261035000000_player_registration_model.sql`, written and reviewed here, **not applied to production**

---

## 1. Short version

The import did not fail silently. It reported success from the browser before the database write had
happened, and the write that did happen could not create players. Production proves it:

- two handicap import batches say **17** and **42** records were applied;
- the database has **0 handicap records**, **0 registrations** and **0 players created by those imports**;
- the one player on file was created at **08:39 UTC**, after both batches (07:56 and 07:59 UTC);
- the file was the club registration workbook (`UPDATED REGISTERED PLAYERS.xlsx - Sheet1.csv`),
  not an NGAP handicap export, and there was no registration importer to receive it.

The cause is in the code, not in the CSV parser. The old apply path only wrote a handicap record when
the row already had a `playerId`; it never inserted the player; it recorded `appliedCount` as the
number of rows in the file; and the page showed "Wrote N" immediately, before the queued write ran.
There was no transaction across the records, the batch and the deferred rows, and no read-back.

The sign-in problem is a different failure. The owner account is confirmed and signed in on 20 October.
A third account exists, is unconfirmed, has never signed in, and is **not a staff account**: it has no
`club_members` row. If that is the account being tried on the phone, it cannot reach the desk. The
provider's error was also being collapsed into "Sign-in failed", which hides the difference between an
unconfirmed address and a wrong password.

The branch fixes the false success, adds the registration import the workbook needed, adds the
canonical player/membership/tournament-day model, and puts the privileged writes behind guarded
database functions. The migration is additive and has not been executed anywhere yet. Nothing was
deployed, no production credential was reset, and no production data was changed.

---

## 2. What is actually live

| Check | Result | How it was checked |
| --- | --- | --- |
| Production code | `v0.19.0 · 7143f20 · built 2026-10-20` | the version label rendered by `https://golf.syntaxure.dev` |
| Production alias | `golf.syntaxure.dev` → Vercel production deployment | `vercel inspect` |
| `main` on the remote | `7143f20` | `git ls-remote origin main` |
| `develop` on the remote | `4231b60` | `git ls-remote origin develop` |
| Database | project above, 18 migrations' objects present | read-only table/column probes |
| Existing event | **24th Bamboo Tee**, open, 12–15 Nov 2026, cut-off 1 Nov, not published | `tournaments` read |
| Production env names | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `vercel env ls production`; values not printed |
| Missing production env | `NEXT_PUBLIC_SITE_URL` | same |
| Service role in Vercel | not set, which is correct for the app | same |
| AI mapping env | not set; the deterministic mapping works and the AI proposal is optional | same |

The application is connected to the intended database. The existing records are intact. Production
does **not** mix development data: there is one club, one course, one event, one player and no
registrations.

`develop` builds as a Vercel **Preview** target (the production branch is `main`). That is the one
allowed automatic deployment for `develop`. This branch is not `develop` or `main`, so `vercel.json`
does not deploy it. No deployment was triggered while investigating.

---

## 3. Import failure: evidence

### 3.1 Production state at the time of review

| Table | Rows |
| --- | ---: |
| `clubs` | 1 |
| `club_members` | 2 (owner, desk) |
| `courses` | 1 |
| `tees` | 0 |
| `holes` | 0 |
| `players` | 1 |
| `handicap_records` | 0 |
| `handicap_import_batches` | 2 |
| `deferred_matches` | 0 |
| `tournaments` | 1 |
| `registrations` | 0 |
| `groups`, `group_members` | 0 |

The two batches:

| Batch | File | Imported (UTC) | Rows | Applied | Skipped | Note |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `d224a4dc` | `UPDATED REGISTERED PLAYERS.xlsx - Sheet1.csv` | 20 Oct 07:56:37 | 132 | 17 | 21 | "Applied 17, deferred 0." |
| `575d0ef5` | same | 20 Oct 07:59:12 | 132 | 42 | 0 | "Applied 42, deferred 0." |

The only player is a single female member row, created 20 Oct **08:39:12 UTC**, with a birthdate,
gender and email on file. That is after both batches, so the import did not create her. She has no
registration.

### 3.2 The code path that produced those rows

The old path is visible in `src/lib/data/supabase/adapters.ts` at the import adapter:

1. `dispatch({ type: "applyImport", payload })` updated the in-memory desk first.
2. It built `records` only from rows where `row.playerId` existed and `row.index !== undefined`.
   A new player, by definition, had no `playerId`, so its handicap record was skipped.
3. It never inserted a `players` row. The stub players existed only in the reducer's memory.
4. It inserted a `handicap_import_batches` row with `appliedCount: payload.rows.length` — the number
   of rows in the file, not the number of records written.
5. The page called `setApplied("Wrote ...")` immediately after `adapters.imports.apply(...)`, before
   the queued promise had run or failed.
6. The records, batch and deferred rows were three separate statements, not a transaction; any
   failure after the first left a partial batch.

The same page also said, in its own copy, "Nothing is written to a server; a refresh resets the
session." That was true in the demo, but the connected path was still treated as if it were the demo.
The operator had no reason to doubt the success message.

The workbook's columns (`MEMBER`, `GUEST`, `GAME DATES`, `GENDER`, `DATE OF BIRTH`, `WHS ID/HANDICAP`,
`CONTACT NO.`, `EMAIL`, `HOME COURSE`, T-shirt size, `PAID`) are registration columns. The handicap
importer's review queue could match names but could not turn a row into a player, a tournament entry
or a set of playing days. That is why there is no registration importer in the product yet: the
workbook was being forced through the wrong door.

### 3.3 Reproducible diagnosis

With the old code:

1. Prepare a CSV with a name and an index that has no matching player.
2. The review queue recommends "create", and the Apply button accepts it.
3. The page says "Wrote 1 handicap record (1 as new player records ...)".
4. Reload. The player is gone, the record is gone, and the batch remains with `applied_count = 1`.

That is the same signature as the two production batches.

### 3.4 Minimal safe fix in this branch

- The handicap apply path is now an awaited database function, `commit_handicap_import`. It writes
  the records, the batch, the deferred rows and the per-row outcomes in one transaction, checks the
  caller's role, and returns the counts the database actually wrote.
- The desk no longer pretends to create a new player from a handicap line. A row with no matching
  player is refused before anything is written, with the instruction to add the player first.
- The page shows the success message only after the RPC resolves, then calls `reload()` and reads the
  desk back from the database. A rejected row is reported as rejected, not counted as applied.
- The registration workbook has its own import (section 6) that creates players and registrations,
  including the days, in a transaction.

The two historical batches are left untouched. They are evidence, not state the desk should trust.
They can be annotated as pre-fix failures with an owner-approved update, or simply ignored once the
real import is run. Do not delete them to make the history look clean.

---

## 4. Authentication: evidence and what to do

### 4.1 Accounts

| User (masked) | Confirmed | Club member | Role | Last sign-in (UTC) | State |
| --- | --- | --- | --- | --- | --- |
| `ad***@gmail.com` | yes | yes | owner | 20 Oct 10:32 | working account |
| `me***@gmail.com` | yes | yes | desk | 18 Oct 09:26 | working account |
| `an***@gmail.com` | **no** | **no** | — | never | created 20 Oct 00:22, unconfirmed |

The owner account is not locked, banned or unconfirmed, and it signed in after the imports. The
reported phone failure cannot be reproduced without the exact account and password, and no
credentials were reset or created.

### 4.2 The likely causes, in order

1. **The phone used the third account.** It is unconfirmed and has no `club_members` row. Supabase
   refuses the sign-in with "Email not confirmed"; even if confirmed, the proxy would send it to the
   player area, not the desk, because staff identity is the `club_members` row.
2. **The email was not the account email.** The form asks for an email address; a username such as
   `admin` is not an email account.
3. **A reset link was opened in the wrong browser.** The reset flow is PKCE: the verifier lives in the
   browser that requested the link. Opening the mail in Gmail's in-app browser, or on another device,
   produces an expired/invalid session.

### 4.3 What changed

- `signInWithPassword` now maps the provider's error to `email_not_confirmed`,
  `invalid_credentials`, `rate_limited` or `sign_in_disabled` instead of one generic failure. The
  login page says what to do, including a resend-confirmation form.
- The forgot-password and reset pages tell the person to open the link in the same browser they used
  to request it, and not inside an email app's built-in browser.
- No password, session token, service-role key or new privileged account was created, printed or
  committed.

### 4.4 Exact next steps for the phone (owner action)

1. Confirm which email is on the phone. Compare it with the owner account that has the
   `club_members` row. Do not share the owner password.
2. If it is the unconfirmed third account: either confirm that address and add a `club_members` row
   with the correct role, or create a proper individual staff account. This is a privileged change;
   follow `docs/STAFF_ACCESS.md`.
3. If it is the owner account: use **Forgot password** on the phone, then open the link in the same
   browser. If it still fails, record the exact on-screen error and time. The provider's auth log is
   the next place to look; the app does not have access to it.
4. Rotate the two test staff accounts before the event. The plan already records that they are
   test-only.

---

## 5. Data model added in this branch

The migration is `supabase/migrations/20261035000000_player_registration_model.sql`. It is additive:
no existing table, column, row or policy is dropped or truncated. The `drop ... if exists` statements
target constraint, trigger and policy names this migration creates, so a re-run is safe and no
pre-existing object is removed.

### 5.1 Player identity and membership

- `players` gains `whs_id` and `updated_at`, plus lookup indexes on the club-scoped name, email and
  phone. Birthdate and gender are relaxed to nullable so an imported guest can exist as an incomplete
  profile and be marked **Needs review**; the public form and the desk's new-player form still require
  both, and the application never invents them.
- `player_memberships` is the explicit, club-scoped relationship: one active row per player per club,
  a member/guest type, an optional member number, validity dates and status. A player with no active
  membership is treated as a guest. Membership is club-specific on purpose: a person can be a member
  at IGCC and a guest elsewhere.
- There is no separate "member player" and "guest player" table. Both are `players`.

### 5.2 Tournament days

- `tournament_days` holds a stable day number, the actual `play_date`, a label, an optional start time
  and `is_playing_day`.
- Existing events are backfilled from `tournaments.dates`; the first day inherits the event's first
  tee time, the other start times stay null until set.
- A trigger keeps the rows in step with the Settings date list. Removed dates are deactivated, not
  deleted, because a registration may point at them.
- `tournaments.required_days` and `tournaments.max_days` are the participation rule. They are null by
  default for the current event, because no two-day rule was confirmed in the existing requirements.
  The owner can set "exactly 2" from Settings when it is confirmed. It is not hard-coded.

### 5.3 Registrations

`registrations` is kept (it already has the right unique key on event + player and the routing
fields). It gains:

- `membership_type` (member/guest snapshot for this event), `shirt_size`, `payment_amount`,
  `payment_reference`, `paid_at`, `payment_note`, `sponsor`, `sponsor_details`, `source` and
  `import_batch_id`.
- Existing `answers.role`, `answers.shirt` and `answers.sponsor` are backfilled into the explicit
  columns without inventing anything missing.

`registration_days` is the structured day assignment:

- one row per registration and tournament day, unique;
- `selected` is the day selection;
- `tee_time`, `start_hole` and `tee_confirmed` are the separate tee-time assignment;
- the player's requested time stays in `registrations.answers.teePreferences`;
- a deferred constraint checks the required/maximum rule at transaction end, so a batch of day rows
  can be written in one go;
- a trigger refuses a day from another tournament, a day that is no longer a playing day, or a
  tee-time confirmation without a time and hole.

### 5.4 Import evidence and audit

- `import_batches`: event, kind, file name, worksheet, SHA-256, private storage path, mapping, status,
  row/inserted/updated/skipped/rejected counts, actor, committed time, idempotency key.
- `import_rows`: one row per source row with the raw and normalized data, the action, the status, the
  error, the player and the registration.
- `handicap_import_rows`: the same outcome trail for the handicap importer.
- `audit_log`: append-only, club-scoped, actor, action, entity, record id, batch id, changed column
  names (never values), result and time. Triggers cover players, memberships, tournament days,
  registrations and registration days.
- The original workbook is stored in the private `registration-imports` bucket under
  `{club_id}/{sha256}/{file_name}`. No public read policy. No update or delete policy; retention is a
  service-role decision.

### 5.5 Row-level security

New tables are club-scoped. Reads follow `is_club_member`; manager writes follow
`has_club_role(club, ['owner','organizer'])`; registration days allow the desk to change a player's
days. Import batches, import rows and the audit log are owner/organizer read-only. There is no direct
insert policy on them: only the security-definer functions write. The public registration form and
the player portal are unchanged.

### 5.6 Guarded functions

| Function | Who may call it | What it does |
| --- | --- | --- |
| `save_day_rule(tournament, required, max)` | owner/organizer | validates the rule against the existing registrations, saves it, audits it |
| `set_registration_days(registration, day numbers)` | any staff | writes the complete day set, deactivates removed days, clears stale tee times, audits |
| `assign_registration_day_tee(registration, day, time, hole, confirmed)` | any staff | assigns the tee time separately from the day selection |
| `commit_registration_import(...)` | owner/organizer | one transaction for players, registrations, days, batch, row outcomes, audit |
| `commit_handicap_import(...)` | owner/organizer | one transaction for handicap records, batch, deferred rows, row outcomes, audit |

The import functions revalidate every row. They do not accept SQL, a table name, a role, a club id or
an arbitrary player id from the browser without checking that the player belongs to the caller's
club. The AI never gets a database credential.

---

## 6. Registration import workflow

### 6.1 Inputs

- CSV and XLSX.
- Worksheet selection when the workbook has more than one sheet.
- Header-row detection (a title row above the headers is reported).
- Date format choice for ambiguous `3/4/2026` values.
- The original file name, worksheet, size and SHA-256 are shown and stored.

### 6.2 Mapping

- Deterministic first: exact header aliases, then contained aliases. The actual workbook's columns
  are recognized, including a combined `WHS ID/HANDICAP` column.
- `MEMBER` and `GUEST` name columns are separate source slots. A row with both becomes two players.
  The guest does **not** inherit the member's birthdate, gender, contact, email, payment or shirt
  size; those facts were not supplied for the guest.
- Unknown formats can ask for an AI proposal. Only the headers and a one-word value shape per column
  are sent (`date`, `email`, `phone`, `number`, `short`, `text`). No names, emails, phone numbers or
  row values leave the server. The answer is validated as a mapping and can contain no SQL or
  instructions. If no AI endpoint is configured, the deterministic mapping and manual selects are
  the whole workflow.
- The operator can change any column before the preview.

### 6.3 Normalization

- Names are trimmed and collapsed, never title-cased over the club's spelling.
- Dates support ISO, `M/D/Y`, `D/M/Y`, month names, two-digit years and Excel serials. An impossible
  date is an error, not a guess.
- Gender, member/guest, payment status/amount and handicap text are parsed explicitly.
- `GAME DATES` is parsed into day numbers: `Day 1 & 2`, `D2, D4`, `Nov 12-14`, ISO dates, numeric dates,
  ranges and "all days". A count-only cell ("2 days") is **uncertain** and requires the operator to
  choose the days.
- Duplicate rows in the file are flagged. They are not merged silently.
- Missing birthdate or gender for a new player is a warning, not an invention and not a rejection:
  the player is saved as **Needs review** so the desk can complete the profile before routing. The
  registration import never invents the missing value.
- The required/maximum day rule is checked per row. A four-day event with "exactly 2" rejects a
  one-day or three-day row.

### 6.4 Preview and approval

The preview shows:

- normalized player records, membership, days, shirt, payment, sponsor;
- match candidates with confidence and conflict reasons;
- rows that are new, already registered, updates, skips or rejects;
- every validation warning and error with its source row;
- the expected insert/update/skip/reject counts;
- whether the database migration is present.

The commit button is disabled until:

- there is no unresolved match or uncertain day;
- the operator ticks the approval box;
- the mapping is not stale;
- the database has the new model.

### 6.5 Safe commit

1. The server re-reads the same file and compares its SHA-256 with the preview.
2. It re-runs the mapping, normalization, matching and day validation. The browser cannot submit a
   normalized row that the server has not derived.
3. It calls `commit_registration_import` with the named row projection and the idempotency key.
4. The function writes inside one transaction, using a subtransaction per row so a bad row is
   recorded as rejected without losing the good rows.
5. The route reads the batch, the registrations and the day rows back independently.
6. Only if the read-back matches does the page show success and reload the desk. A partial commit is
   worded as partial, not as success.

A second run of the same file and event returns the original committed batch. It does not create
duplicates. The existing unique key `(tournament_id, player_id)` is the final guard.

---

## 7. Structured day selection in the desk

- Settings has a **Playing-day rule** panel: exactly N days, at most N days, or no rule. It saves
  through `save_day_rule` and refuses to make an existing registration invalid.
- The registration desk shows the structured days with the real date and start time. The operator
  ticks the days a player is entered for. The rule is checked before saving.
- Tee-time preferences are shown only for the selected days and stay in `answers.teePreferences`.
  They are preferences; the draw still decides the real start.
- Each registration row has day buttons. Clicking one saves the complete set through
  `set_registration_days`; the row says "saving…" and an error is shown if the database refuses it.
  Changing days does not touch the player, payment or schedule fields.
- Day selection and tee-time assignment are separate: `registration_days.selected` versus
  `registration_days.tee_time` / `start_hole`.

The public entry form still sends day choices as `teePreferences` keys. An AFTER INSERT trigger fills
`registration_days` from those keys, so the old form keeps working. The public form does not yet show
an explicit "choose your days" control; before enabling a required-day rule, update it so a player
cannot submit without the required days. This is listed as a remaining risk.

---

## 8. Tests and verification

Run on the branch:

| Check | Result |
| --- | --- |
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm test` | **65 files, 654 tests passed** |
| `pnpm build` | pass, 28 routes generated |
| Production code/version | verified from the deployed page |
| Production database reads | read-only; counts above |
| Migration applied | **no** |
| Production login tested | **no**; no credentials used |
| Production import tested | **no**; not deployed |

New tests cover:

- date parsing, Excel serials and impossible dates;
- CSV and XLSX reading, worksheet selection, header-row detection and duplicate headers;
- `GAME DATES` parsing, including day labels, ranges, numeric dates, "all days" and the uncertain
  count-only case;
- the actual workbook's column mapping, member/guest expansion, duplicate rows and day-rule errors;
- mapping validation, including a column that is not in the sheet and an AI answer with SQL or an
  unexpected key;
- preview summary, commit blocking and the named commit projection;
- the sign-in error mapping;
- structured day derivation from event dates;
- the existing routing, draw, paging, print and auth suites.

The production read-only checks used the Supabase service-role key already present in the local
`.env.local`. No key, token, password or full email address was printed, committed or copied into the
repository. The script itself is in git-ignored `.tmp/`.

---

## 9. Migration plan and approval

### 9.1 Before applying

1. Take a Supabase backup or confirm point-in-time recovery for the project.
2. Record `supabase migration list --linked` and the current row counts of `players`,
   `registrations`, `groups`, `group_members`, `handicap_records`, `handicap_import_batches` and
   `deferred_matches`.
3. Review this migration and its rollback notes with the owner.
4. Apply it to a **branch project or local database** first, then run the verification queries.
5. Only then apply to production, in a quiet window, with the code deployment held until the schema
   is in place.

### 9.2 Apply

```bash
supabase link --project-ref <branch-or-production-ref>
supabase db push --linked
supabase migration list --linked
```

The migration must be the next version after `20261034000000`. It is `20261035000000`.

### 9.3 Verify

```sql
-- The new objects exist.
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name in ('player_memberships','tournament_days','registration_days',
                      'import_batches','import_rows','handicap_import_rows','audit_log')
 order by table_name;

-- Every event has at least one day row, and the count matches its dates.
select t.id, t.name, cardinality(t.dates) as dates, count(d.id) as day_rows
  from public.tournaments t
  left join public.tournament_days d on d.tournament_id = t.id
 group by t.id, t.name, t.dates;

-- Existing registrations kept their payment, frozen index and player.
select count(*) from public.registrations;
select count(*) from public.registrations where payment_status is not null;

-- The new functions are not executable by anon.
select p.proname, p.proacl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('commit_registration_import','commit_handicap_import',
                     'save_day_rule','set_registration_days');

-- RLS is on.
select relname, relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and relname in ('player_memberships','tournament_days','registration_days',
                   'import_batches','import_rows','handicap_import_rows','audit_log');
```

### 9.4 Rollback

The code rollback is a normal Vercel promotion or a revert on `develop`. The old code reads the new
columns as optional, so it keeps working if the schema is present. The migration itself is additive;
if it has to be reversed, write a reverse migration that drops the new tables, functions, triggers and
the added columns **only after a backup**. Do not drop production tables to "roll back" a deploy.

### 9.5 Production data reconciliation

- Do not delete the two false import batches. Their `applied_count` is wrong; the real record count is
  zero. The audit trail should say so. An owner-approved `update handicap_import_batches set note = ...`
  can annotate them without changing the evidence.
- The one player already on file remains. If they are in the registration workbook, the new import
  will match them by name (and NGAP ID if supplied) and either create their registration or skip it if
  one already exists. If they are not in the field, the desk can remove them after a review; that is a
  normal desk action, not a migration step.
- Do not run the new registration import against production until the migration is applied. The page
  blocks the commit, but the API also returns a 409 rather than writing half a batch.

---

## 10. Remaining risks and open approvals

| Risk or gap | State | Owner action |
| --- | --- | --- |
| Migration not applied anywhere | by design; no production write was made | review, back up, apply to a branch project, then production |
| Production login not reproduced | no credentials used and none should be shared | confirm the phone account; follow `docs/STAFF_ACCESS.md` |
| Two test staff accounts | still on the project | rotate before the event |
| `NEXT_PUBLIC_SITE_URL` absent in Vercel | reset links fall back to the request host, which is correct on production but should be explicit | add the variable in Vercel |
| AI mapping endpoint | not configured; deterministic mapping is the default | configure only if the club wants it; the app never sends row data |
| Public form has no explicit day picker | the trigger fills days from tee preferences; a required-day rule can refuse a submission with no days | update the form before enabling a required-day rule |
| Multi-day tee-time assignment | `assign_registration_day_tee` exists, but the draw is still single-day and no screen calls it | build the day/tee-time screen before the event needs it |
| Original uploads and import rows contain personal data | private bucket, owner/organizer RLS, immutable | set a retention period; delete old uploads and rows with the service role |
| The import does not overwrite existing player profile fields | deliberate: it creates missing players and registrations; edits are a separate desk action | use the player profile for corrections |
| No dedicated membership editor on the player screen | the table and the import write it; the registration desk records member/guest per event | add a small membership panel when the club starts using member numbers |
| `develop` previews may lack env vars | the connected import cannot be exercised on a preview without them | use a branch project or local env |
| Deployment | this branch is not `develop` or `main`; no deploy was made | PR into `develop`; apply the migration before the code reaches production |

---

## 11. Files changed

- `supabase/migrations/20261035000000_player_registration_model.sql`
- `src/lib/import/{types,dates,mapping,match,normalize,preview,file,server,index}.ts`
- `src/app/api/import/{preview,commit,suggest-mapping}/route.ts`
- `src/components/import/RegistrationImport.tsx`
- `src/app/(desk)/import/{page,HandicapImport}.tsx`
- `src/app/(desk)/register/page.tsx`, `src/app/(desk)/setup/page.tsx`
- `src/components/desk/RegistrationRow.tsx`
- `src/lib/data/{adapters,types,dates}.ts`
- `src/lib/data/supabase/{adapters,domain,load-desk-state}.ts`
- `src/lib/store/{state.ts,desk-store.tsx}`
- `src/lib/auth/{actions,sign-in-error}.ts`, login/forgot/reset pages
- `src/lib/supabase/types.ts`
- `package.json` and `pnpm-lock.yaml` for `read-excel-file`
- `docs/STAFF_ACCESS.md`, `docs/IMPORT_RUNBOOK.md`, this report
