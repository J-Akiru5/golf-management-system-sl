# Brief: LANDING STRUCTURE (data, page, database function, demo form)

Branch `landing/structure`. You build the data and the wiring. A DESIGN builder works in parallel on
`src/components/landing/**` (the visual components). You compose its exports from
`src/components/landing/index.tsx` exactly as the contract in `types.ts` defines them. Do not edit
anything under `src/components/landing/`.

## You own

- `src/lib/public/showcase.ts` and `src/lib/public/showcase.test.ts` (new, pure functions, no I/O).
- `src/lib/public/platform-proof.ts` (new: the published figures and the product shots list).
- `src/lib/data/supabase/public-events.ts` and its test (extend).
- `src/lib/supabase/types.ts` (only to add the new function's type).
- `supabase/migrations/20261121000000_landing_showcase_and_demo.sql` (new).
- `src/app/(public)/page.tsx` (rewrite as the new landing page).
- `src/app/(public)/demo/page.tsx` and `src/components/public/DemoRequestForm.tsx` (new).
- The feedback plumbing needed for the new `demo` category: `src/lib/data/feedback.ts`,
  `src/lib/data/supabase/feedback.ts` (+ tests), `src/app/api/feedback/digest/route.ts`, and the
  desk's Feedback inbox labels (find where categories are labelled; usually under `src/app/(desk)` or
  `src/components/feedback`). Only add the `demo` category; change nothing else there.
- `src/app/sitemap.ts` (add `/demo`).

## 1. Database function (migration, written but NOT applied; the owner runs it)

Write `supabase/migrations/20261121000000_landing_showcase_and_demo.sql`, modelled on
`supabase/migrations/20261103000000_public_events_entries_closed.sql` (read it fully first; same style,
header comment in plain language, `security definer`, `set search_path = ''`, explicit grant to `anon,
authenticated`, revoke from public, and a self-check `do $$ ... $$` block that cleans up after itself).

a. `public.public_showcase_events()` returns jsonb: the same payload as `public_events()` plus
   `'finished', (last_date < current_date)`. Filter: `state in ('open','closed')` and
   `last_date >= current_date - 400` (finished events stay listed for about a year, so the 24th Bamboo
   Tee shows as Completed in the carousel instead of disappearing a week after it ended). Same fields
   only: no contact details, no player data. Leave `public_events()` and `public_open_events()` as they
   are.
b. Demo requests reuse the feedback inbox: add `'demo'` to the `public_feedback.category` check
   constraint, and to the accepted categories inside `public.submit_feedback(...)`. Read
   `supabase/migrations/20261110000200_public_feedback.sql` and any later migration that redefines
   `submit_feedback` (grep for it) and re-create the **latest** definition verbatim with only the
   category list extended. For `demo`, a contact email is required (return the function's existing
   error shape with a clear code if it is missing).
c. End the file with the owner's check, as a comment block showing two queries he can run after:
   `select jsonb_array_length(public.public_showcase_events());` and a select of the event names with
   `finished`.

## 2. Loader (`public-events.ts`)

Add `finished` to the parsed event (`toPublicEvent`): use the payload's boolean when present; when
absent, derive it from the dates and the `today` the caller passes (last date < today). Add
`loadShowcaseEvents(client, today)`: call `public_showcase_events`; on error or when it is missing fall
back to `public_events`, then `public_open_events` (existing behaviour); `null` when all fail. Never fall
back to sample events on a configured site. Extend `PublicEvent` in `src/lib/public/highlights.ts`
only if you must; prefer keeping `finished` on the landing type. Tests for every branch.

## 3. Pure logic (`showcase.ts`, fully tested)

- `eventPhase(event, today)` and `eventDayNumber(event, today)` (move the two helpers out of the
  current page unchanged, with tests).
- `toLandingEvent(event, today): LandingEvent` (types from `@/components/landing/types`): `phase`,
  `finished` (true when phase is past), `dayNumber` (0 when not a playing day), `dateLabel` via
  `dateRange` from `highlights.ts`, `enteredLabel` via `enteredLabel`.
- `orderForCarousel(events)`: live first, then upcoming by first date, then finished newest first.
- `pickFeatured(events)`: the live event; else the soonest upcoming; else the most recently finished;
  else null.
- `defaultHeroView(featured, today)`: `"event"` when the featured event is live, or upcoming with its
  first day within 7 days; otherwise `"clubs"`. With no featured event, `"clubs"`.
- `eventEyebrow(featured, today)`: "Live now · Day N of M" | "Final results" (finished) | "Open for
  entry now" | "Entries closed" (same wording as the current page).
- `quickActionsFor(featured)`: finished: See all scores (`/results/all`, primary), View published
  pairings (`/pairings`). Live: Find my tee time (`/pairings`, primary), See all scores. Upcoming:
  View published pairings (primary), See all scores, and Enter (`/enter`) when `entriesOpen`.
- `eventStatsFor(featured, today)`: Entries; Cut-off (upcoming) or First tee (otherwise, `timeLabel`);
  Days; Venue (`VENUE_LABEL`). Same rules as the current page's stat strip.

## 4. Published figures (`platform-proof.ts`)

Export `PROOF_STATS: ProofStat[]` and `PROOF_SOURCE`, exactly these (from the owner's 24th Bamboo Tee
analytics report; do not add, round or change any number):

| value | label | detail |
| --- | --- | --- |
| 327 | entries | recorded on the live site for the 24th Bamboo Tee |
| 118,279 | live requests | in the 25-hour peak window, 14 to 15 Nov 2026 |
| 17,403 | in the busiest hour | pairings, scorecards and leaderboard at once |
| 20,641 | public scorecard views | players and guests following live scorecards on their phones |
| 0 | downtime | the site stayed up through the whole tournament |

`PROOF_SOURCE`: "24th Bamboo Tee, Iloilo Golf and Country Club, 12 to 15 Nov 2026. Platform analytics by
Syntaxure Labs."

Export `PRODUCT_SHOTS: ProductShot[]`:
1. `/landing/control-room.webp`, 1883 x 931, caption "Control room: the draw, the field and what must be
   fixed before publishing, on one screen." Alt describes the screen without inventing details.
2. `/landing/hole-overview.webp`, 1500 x 932, caption "Course and holes: every start hole, with its
   groups and distances."
3. `/landing/scorecard-entry.webp`, 1891 x 491, caption "Score entry: hole by hole, checked against the
   paper card."

## 5. The page (`src/app/(public)/page.tsx`)

Rewrite it to compose, inside `<main className="tl-landing">`: `JsonLd` (keep), `LandingHero`,
`ProductShowcase` (PRODUCT_SHOTS), `ProofStrip`, `CapabilitySections`, `EventCarousel` (only when there
are events), the existing `LeaderboardTeaser` when available (keep its current loading rules exactly),
`DemoCta`, `LandingFooter` (`APP_VERSION_LABEL`), and `PublicBottomBar` (keep). Keep `todayInManila`
(one clock read on the server), the demo-events path when Supabase is not configured, and the existing
metadata (update the title and description to speak to golf clubs; keep canonical `/`). Remove what the
new components replace (old hero markup, capability cards, workflow section, ScheduleStrip). Keep the
file small: logic lives in `showcase.ts`.

## 6. Demo request (`/demo`)

A simple, accessible page with a form: your name, club, role (optional), email, phone (optional), and
a message (optional, prefilled hint "What would you like to see?"), a consent checkbox to be contacted,
and the existing honeypot pattern. Submit through the same client path the public feedback form uses
(read `src/components/public/FeedbackForm.tsx` and `src/lib/data/supabase/feedback.ts`) with category
`demo`, the contact fields, and a message composed as plain lines ("Club: ...", "Role: ...", "Phone:
...", then the message). Show the server's reply; on success a clear thank-you. Style it with the
existing site primitives (`src/components/ui`) and simple local classes; the DESIGN builder may restyle
it later. Metadata: title "Request a demo", canonical `/demo`.

## Acceptance

`pnpm typecheck`, `pnpm lint`, `pnpm test` pass, with new tests for showcase.ts, the loader branches,
and the demo category. Then run the production build once through the lock:
`bash S:/Dev/golf-management-system-sl/ws-tools/build-lock.sh pnpm build` and report the result.
The page must render with the design stubs (they are real components, just plain). No number on the
page that is not from the database or `platform-proof.ts`.
