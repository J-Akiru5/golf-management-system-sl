# Task: event branding, calendar and queued email reminders

**Task ID:** `2026-10-24-event-calendar-branding`
**Feature branch:** `feat/event-branding-calendar`, rebased onto `origin/develop`
**Docs branch:** `docs/event-calendar`
**Base:** `origin/develop` `e0e04b1`
**Status:** Implementation complete on the feature branch. Migration `20261040000000` **applied to the live
project on 24 Oct 2026**. The code branch is not merged and not deployed.

## Objective

Give the desk enough event identity to run and print an event, and give the organizer a calendar that
shows every event and stops a real double booking. The same branch adds a queued email reminder list
with optional delivery through Resend.

## Scope

1. **Event branding**
   - New optional fields on a tournament: `host_name` and `logo_path`.
   - A private `event-logos` storage bucket, 2 MiB limit, PNG/JPEG/WebP, path
     `{club_id}/{tournament_id}/{uuid}.{ext}`.
   - Club members may read an event logo. Owner and organizer may upload, replace or remove one.
   - The desk signs a staff URL for screens and printing. The logo is never a public
     asset in this release.
   - The event sheet on `/calendar` sets the title, host or sponsor, start and end date, status and
     logo. `/tournaments` shows the logo and host when set.

2. **Calendar**
   - New `/calendar` screen in the desk shell and staff route guard, with month and list views.
   - The month view is a Sunday-first six-week grid built in UTC, so a browser timezone cannot move
     an ISO date.
   - Create or edit an event from the calendar, including a click on a day.
   - **Exact conflict** (same course, same playing date, same tee time, different event): shown in
     the editor and refused before save.
   - **Same-day conflict** (same course and date, different or missing tee time): allowed, shown as a
     warning. A day with no start time is not treated as a slot.
   - The migration adds a trigger on `tournament_days` for the unambiguous case. The UI carries the
     softer same-day warning. Until the migration is applied, only the UI check runs.

3. **Calendar export**
   - `/calendar` exports every event as one `.ics` file: one all-day `VEVENT` per event, host in the
     description, exclusive `DTEND`, escaped text and folded long lines.
   - An event being edited also offers an "Add to Google Calendar" template link.

4. **Branded printed scorecards**
   - The scorecard header takes the event logo (20 mm wide, contained) and the host name above the
     subtitle.
   - The print center passes the event host and signed logo URL, and gives the scorecard a subtitle
     that names the dates, the start format and the first tee time. The start sheet keeps its own
     subtitle.

5. **Queued email reminders**
   - `email_outbox` stores one row per recipient draft: kind, subject, body, status, dedupe key and
     optional registration link. A queued row is a draft, not a delivery claim.
   - The event sheet queues confirmations or reminders for every registered player who has an email
     address. Confirmation dedupe is per registration; reminder dedupe is per registration and
     cut-off date, so queueing twice does not duplicate a draft.
   - `POST /api/email/send` requires a signed-in user, reads up to 50 queued rows for one event, sends
     them one at a time through Resend, and marks each row `sent` with the provider message id or
     `failed` with the provider error.
   - Without `RESEND_API_KEY` and `EMAIL_FROM`, the route reports that delivery is not configured and
     leaves the drafts queued. The demo build (no Supabase) does not queue and says reminders need a
     connected desk.

## Explicit exclusions

- **No public event page.** The logo and host appear on staff screens and printed cards only.
- **No online payment.** Payment stays recorded by hand on the registration desk.
- **No OCR or QR capture.** Scoring capture and card reading are unchanged.
- **No multi-club onboarding.** `club_id` remains on every new table, but there is no club-creation or
  onboarding flow.
- **No delivery scheduler.** Sending is a staff action from the calendar. There is no cron or
  background sender. Failed drafts can be requeued by hand and are claimed atomically before sending.
- **No production claim.** The migration is not applied and the branch is not merged.

## Files owned

Implementation on `feat/event-branding-calendar`:

- `src/app/(desk)/calendar/page.tsx`
- `src/lib/calendar/calendar.ts`, `src/lib/calendar/ics.ts` and their tests
- `src/lib/email/templates.ts` and its test
- `src/lib/data/email.ts`, `src/lib/data/supabase/email.ts`, `src/app/api/email/send/route.ts`
- `src/lib/data/supabase/event-logo.ts`
- `src/components/print/Scorecard.tsx`, `src/components/print/Scorecards.tsx`,
  `src/components/print/print.module.css`
- `src/app/(desk)/print/page.tsx`, `src/app/(desk)/tournaments/page.tsx`
- `src/lib/data/adapters.ts`, `src/lib/data/supabase/adapters.ts`,
  `src/lib/data/supabase/domain.ts`, `src/lib/data/supabase/load-desk-state.ts`
- `src/lib/data/types.ts`, `src/lib/store/state.ts`, `src/lib/supabase/types.ts`
- `src/lib/photo.ts`, `src/lib/auth/routes.ts`, `src/proxy.ts`, `src/components/AppShell.tsx`
- `scripts/verify-ui.mjs`, `.env.example`
- `supabase/migrations/20261040000000_event_calendar_branding.sql`

This docs task owns only `docs/PLAN.md`, `CHANGELOG.md` and this file.

## Database migration

**Name:** `20261040000000_event_calendar_branding.sql`
**Applied:** **Yes, 24 Oct 2026.** The owner applied it and the API read-back returned HTTP 200 for the new tournament columns and email_outbox table. The migration history row was not queried in this session.

The migration is additive and ends with a self-check that raises if a required object is missing:

| Part | What it adds |
| --- | --- |
| Branding | `tournaments.host_name`, `tournaments.logo_path`, a case-insensitive host index |
| Storage | Private `event-logos` bucket (2 MiB, PNG/JPEG/WebP), staff read, owner/organizer write |
| Booking guard | `check_tournament_day_booking()` and `tournament_days_booking_guard`, refusing the same club, course, playing date and start time on a different event with SQLSTATE `23P01` |
| Audit | `tournaments_audit` trigger using the existing `audit_row_change()` |
| Email | `email_outbox`, its index, `updated_at` trigger, RLS for owner/organizer, unique `(club_id, dedupe_key)` |
| Self-check | `DO` block verifying both columns, the private bucket, the trigger and the table |

It relies on helpers that earlier migrations already created: `public.is_club_member`,
`public.has_club_role`, `public.audit_row_change` and `public.stamp_updated_at`. Apply it after
`20261039000000` and before deploying code that expects the new columns or the outbox.

The trigger checks the booking rule at write time and takes a transaction advisory lock for the
same course/date/slot. A separate trigger checks existing days when an event's course changes. It does
not compare tee times across different courses; the calendar warning is the same-day check.

## Verification evidence available

| Check | Status |
| --- | --- |
| New unit tests: calendar, ICS, email templates, email outbox and event logo | Passed as part of the full suite |
| `pnpm typecheck` | Passed |
| `pnpm lint` | Passed |
| `pnpm test` | 89 files / 858 tests passed after rebase |
| `pnpm build` | Passed, including `/calendar` and `/api/email/send` |
| Browser check: "event calendar and branding" in `scripts/verify-ui.mjs` | 95/95 passed, including creating an event with a logo and refusing an exact overlap |
| Migration execution | Applied by the owner on 24 Oct 2026; REST read-back for host_name/logo_path and email_outbox returned HTTP 200. |
| Connected staff click-through | Not attempted. |
| Deployment | None. The branch is not merged. |

## Remaining owner decisions

1. **Migration:** applied to the live project on 24 Oct 2026; the code branch can now be reviewed and merged.
2. **Email provider.** Create or confirm the Resend account and the verified sending domain, then set
   `RESEND_API_KEY` and `EMAIL_FROM` in the server environment. Until both are set, the queue is
   usable as drafts only.
3. **Delivery timing.** Decide whether reminders are sent by hand from the calendar for now, or
   whether a scheduled sender is wanted later. This release ships the outbox, not a scheduler.

## Rollback

The database change is additive, so the code can be reverted without removing the columns, bucket,
trigger or outbox. Dropping `email_outbox` would discard queued drafts; dropping the booking trigger
would remove the database double-booking check. If the code is reverted while the migration stays
applied, the extra objects are unused and the new tournament columns stay nullable.

## Handoff

- Feature branch head after rebase: see `feat/event-branding-calendar`; the implementation includes the review fixes and adapter tests.
- This record is committed on `docs/event-calendar`.
- No merge, no push to `develop` or `main`, no migration, no deployment and no tag.
- The feature branch carries no version bump. `package.json` and `VERSION` were not changed here.
