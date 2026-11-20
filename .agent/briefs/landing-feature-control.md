# Brief: LANDING FEATURE CONTROL (structure: organizer chooses the featured event)

Branch `landing/feature-control`, from `feat/landing`. Same common rules (attached). You own
everything listed below and nothing in `src/components/landing/**` except reading `types.ts` (the
contract, already updated by the orchestrator: `LandingEvent.featured`, `LandingHeroProps.heroShot`,
no `HeroView`, no `defaultView`). A design builder is changing the landing components at the same time;
do not touch them.

## Why

The owner removed the public "For clubs / 24th Bamboo Tee" switch from the hero. Whether the home page
features an event is now an organizer's decision in the desk. The page never picks one by itself: no
featured flag set means no featured event (the hero still works; the carousel still lists events).

## 1. Database (edit the unapplied migration `supabase/migrations/20261121000000_landing_showcase_and_demo.sql`)

Add a section before the demo section (and update the file's header comment to describe it):

- `alter table public.tournaments add column if not exists landing_featured boolean not null default false;`
  with a `comment on column`.
- `create unique index if not exists tournaments_one_landing_feature on public.tournaments (club_id) where landing_featured;`
  (one featured event per club).
- `public.set_landing_feature(p_tournament uuid, p_featured boolean) returns jsonb`, `language plpgsql`,
  `security definer`, `set search_path = ''`. Look up the club (`P0002` 'Tournament not found' when
  missing). Require `public.has_club_role(v_club, array['owner', 'organizer'])` (`42501`, message
  'Only the owner or an organizer can change the home page feature'). When turning on: first set
  `landing_featured = false` for every other tournament of that club, then set it on this one. When
  turning off: set it false on this one. Return `jsonb_build_object('tournamentId', p_tournament, 'featured', p_featured)`.
  `revoke all ... from public;` `grant execute ... to authenticated;` (not anon).
- In `public_showcase_events()` add `'featured', t.landing_featured` to the object.
- Extend the self-check `do` block at the end to assert the column, the index and the function exist.

Then regenerate `docs/landing/apply-on-live.sql` so it is exactly: its existing header comment (update
the text to mention the home page feature), `begin;`, the full migration, `commit;`, and the check
queries. Add one check query: `select name, landing_featured from public.tournaments order by play_date desc limit 5;`
and a commented note that the organizer turns the feature on in Setup, "TeeLine home page".

## 2. Data layer

- `src/lib/public/highlights.ts`: `PublicEvent` gains `featured: boolean`. Every place that builds a
  `PublicEvent` (the Supabase mapper `toPublicEvent` in `src/lib/data/supabase/public-events.ts`, the
  demo events in `src/lib/public/demo-events.ts`, tests) sets it. The mapper reads `featured === true`;
  the `public_events` / `public_open_events` fallbacks never carry it, so it is `false` there.
  Demo events: mark exactly one demo event featured so the local page without Supabase shows the band.
- `src/lib/public/showcase.ts`: `toLandingEvent` copies `featured`. `pickFeatured` returns the event
  whose `featured` is true (first one if, impossibly, several), else `null`. No fallback to live or
  upcoming. Delete `defaultHeroView` and its tests. Keep `eventEyebrow`, `quickActionsFor`,
  `eventStatsFor` unchanged.
- `src/app/(public)/page.tsx`: drop the `defaultView` prop; pass `heroShot={PRODUCT_SHOTS[0] ?? null}`.
  Keep the rest (the teaser gating on `featured?.phase === "live"` stays).
- `src/lib/supabase/types.ts`: add `landing_featured` to the tournaments row types if that file models
  the table, and the new function if it models functions.
- New `src/lib/data/supabase/landing-feature.ts`: `loadLandingFeature(client, tournamentId)` reads
  `landing_featured` from `tournaments` (club members can select it under RLS) and returns
  `{ featured: boolean } | null` (null when the read fails, which includes the column not existing yet);
  `setLandingFeature(client, tournamentId, featured)` calls the RPC and throws a plain `Error` with the
  database message on failure. Unit-test the parsing.

## 3. The desk control

New client component `src/components/desk/LandingFeatureCard.tsx`, rendered on
`src/app/(desk)/setup/page.tsx` directly after `PublicReleaseCard`, with the same props pattern (read
how `PublicReleaseCard` gets the tournament id, loads state, saves and calls `refreshPublicPage`).

- `SectionCard` titled "TeeLine home page". One switch (a real `button role="switch"` with
  `aria-checked`, keyboard operable, or the project's existing switch component if there is one):
  "Feature this event on the home page".
- Detail text: "Shows this event at the top of the home page with its quick actions (See all scores,
  View published pairings). One event at a time: turning this on replaces any other featured event."
- A "View home page" link to `/` (opens in a new tab, like the preview links in `PublicReleaseCard`).
- While saving: the switch is disabled and shows a spinner or "Saving…". On success refresh the public
  home page (`refreshPublicPage("/")` or the equivalent the card already uses) and `router.refresh()`.
  On failure show the error inline and restore the previous value.
- When `loadLandingFeature` returns null (column not there yet) show the switch disabled with the line
  "Available after the next database update." When Supabase is not configured (demo mode) show it
  disabled with "Connect the live database to use this."
- Add a small test for any pure helper you write.

## Acceptance

`pnpm typecheck`, `pnpm lint`, `pnpm test` pass. Do not touch `src/components/landing/**`. The
landing components may not compile against the new contract until the design builder lands its part:
if `typecheck` fails ONLY inside `src/components/landing/**` because of `defaultView`/`heroShot`, say so
in the report and leave it; any other failure is yours to fix. Final report as in the common rules.
