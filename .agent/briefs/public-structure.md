# Brief: PUBLIC STRUCTURE (events portfolio, tick-box concerns, email alert)

Branch `public/structure`, from `feat/public`. Common rules attached. A design builder is working at the
same time on the shared public look (`src/components/public/PublicShell*`, `public.css`, the landing
nav). A chatbot builder is working on `src/lib/ai/**`, `src/lib/chat/**` and `src/app/api/chat/**`. Do
not touch their paths.

## You own

- `supabase/migrations/20261122000000_concerns_and_event_archive.sql` (new) and
  `docs/public-v2/apply-on-live.sql` (new).
- `src/app/(public)/events/**` (new), `src/app/(public)/rules/page.tsx`,
  `src/app/(public)/feedback/page.tsx`, `src/components/public/FeedbackForm.tsx`,
  `src/lib/data/feedback.ts`, `src/lib/data/supabase/feedback.ts` (+ tests),
  new `src/lib/data/supabase/event-archive.ts` (+ tests), the desk inbox component that shows a note
  (`FeedbackInbox.tsx` or the component it uses), `src/app/sitemap.ts`, `src/lib/supabase/types.ts`.

## 1. Migration `20261122000000_concerns_and_event_archive.sql`

It runs after `20261121000000_landing_showcase_and_demo.sql` (already written, not applied); read that
file first, because it holds the latest `submit_feedback`.

- `public_feedback`: add `details jsonb` (nullable). Add category `concern` to
  `public_feedback_category_check` (keep every existing category).
- Re-create `submit_feedback` with one new last argument `p_details jsonb default null`. Drop the old
  signature first (`drop function if exists public.submit_feedback(<exact old arg types>)`), then
  create the new one from the 20261121000000 body, changed only to: accept and store `p_details`;
  when the category is `concern`, require `p_details` and validate it exactly as
  `normaliseConcern` in `src/lib/data/concerns.ts` does (concerns non-empty and from the list; hole
  1-18 when score; tee colour in blue/silver/white/red when tee_off; other text when other; text
  fields at most 200 characters; `source` in form/chat; transcript only for chat, at most 40 turns).
  The message stays required for other categories; for `concern` it is optional (the details are the
  message). Keep the honeypot, consent and rate limit. Re-issue the grants.
- **Email alert**: when a `concern` note is saved, queue one row in the existing email outbox for each
  club owner and organizer (emails from `auth.users` through `club_members`/`has_club_role`), with a
  new kind `feedback_alert` added to the outbox kind check (keep every existing kind). Subject like
  "New player concern: Score (hole 7), Tee off (White)". Body: the summary line, player name,
  handicap, schedule, the message and a link to the desk inbox. Read `20261040000000*`,
  `20261110000300_feedback_followups.sql` and `src/app/api/email/send/route.ts` to see how the outbox
  is drained, and say in your report whether a queued alert is sent automatically or needs a manual
  send. Do not add a cron or any infrastructure.
- `public_event_archive()`: security definer, anon-executable, like `public_showcase_events()` but with
  no time limit: every event in state open or closed, newest first, with the same fields plus
  `finished`, `featured` and `hasRules` (rules_of_play is not empty).
- Self-check `do` block at the end, like the earlier migrations.

`docs/public-v2/apply-on-live.sql`: header, `begin;`, the migration, `commit;`, and check queries.

## 2. Events portfolio

- `/events`: the archive. Every event as a card (name in Cormorant, dates, venue, entered count,
  Completed / Live / Upcoming chip), newest first, linking to its page. Data from
  `public_event_archive()`, falling back to `public_showcase_events()` then `public_events()` while the
  migration is not applied. With no events: a calm empty state, no sample events.
- `/events/[tournamentId]`: one event's portfolio: header (name, dates, venue, entered, status chip),
  then only the sections that are public and released for that event: results (the event's released
  results and a link to the full results page), published pairings, the organizer's rules of play
  (`#rules`), and the quick actions. Read the existing public loaders (`public-programme.ts`,
  the results and pairings pages) and use the ones that take a tournament id; if a section has no
  per-tournament public read, link to the existing page instead of inventing one. Unknown id: 404.
  `generateMetadata` with the event name.
- `/rules`: no longer a nav item. Server redirect to `/events/<featured id>#rules` when an event is
  featured and has rules, else to the newest event with rules, else to `/events`. Keep the URL working.
- Add `/events` to the sitemap.
- Markup uses the shared classes the design builder styles: wrap each page in
  `<PublicShell>` from `@/components/public/PublicShell` (props: `children`, optional `wide`), and use
  `tl-pub-card`, `tl-pub-chip`, `tl-pub-kicker`, `tl-pub-title`, `tl-pub-section`. If PublicShell does
  not exist in your worktree yet, create a minimal placeholder at that path that just renders
  `children` inside `<main className="tl-pub">`, and say so in the report (the design builder's real
  one replaces it at merge).

## 3. Tick-box feedback form

Replace the "What is this about?" drop-down in `FeedbackForm.tsx` with the concern list from
`src/lib/data/concerns.ts`, category `concern`:

- A `fieldset` "What is your concern? Tick all that apply" with one large checkbox per kind
  (`CONCERN_LABELS`). Ticking **Score** reveals a "Hole no." number input (1-18); ticking **Tee off**
  reveals a radio group "Tee colour" (Blue, Silver, White, Red); ticking **Others** reveals a text line.
- Below: "Your name" (player name), "Handicap", "Schedule (day and tee time)" as optional text inputs,
  then the message (optional now), contact email (optional) with the existing consent rule.
- Validate with `normaliseConcern` before sending; show the problem next to the right field in plain
  words. Submit with `p_category = 'concern'` and `p_details`.
- Classes for the design builder: `tl-check` (a checkbox row: `<label class="tl-check"><input
  type="checkbox">…</label>`), `tl-radio` (same for radios), `tl-check-grid` (the grid of checkboxes),
  `tl-reveal-field` (a follow-up field), `tl-field`, `tl-input`, `tl-pub-card`.
- Keep the honeypot, rate-limit message, success and error states. Add/extend tests for the form logic.
- The desk inbox shows a concern note with its summary line (`concernSummary`), player name, handicap,
  schedule, source (form/chat) and, for chat, a collapsible transcript.

## Acceptance

`pnpm typecheck`, `pnpm lint`, `pnpm test` pass. Never connect to a database. Final report as in the
common rules, including the outbox finding.
