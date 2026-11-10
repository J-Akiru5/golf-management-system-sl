---
id: T-0011
title: Add the admin public-release controls
milestone: M2
priority: P0
status: ready
rev: 1
objective: "Give the owner and organizer a per-surface Public page control that releases or holds pairings, tee times, roster, leaderboard, photos and rules, without republishing the frozen snapshot."
outcome: "The organizer can see what is held and release it from the desk; the public page shows held versus not-published correctly."
verification_profile: unit
integration_target: develop
dependencies: []
ownership:
  - src/app/(desk)/setup/page.tsx
  - src/app/(desk)/admin/page.tsx
  - src/components/public/ReleaseState.tsx
  - src/components/public/PublicReleaseCard.tsx
  - src/app/(public)/pairings/page.tsx
  - src/app/(public)/pairings/DemoPairings.tsx
  - src/app/(public)/roster/page.tsx
  - src/app/(public)/leaderboard/page.tsx
  - src/app/api/pairings/version/route.ts
  - src/components/public/ProgrammeView.tsx
  - src/components/public/RosterView.tsx
  - src/components/public/TeamLeaderboard.tsx
  - src/components/control-room/panels.tsx
  - src/components/control-room/PublicReleaseLink.tsx
  - src/components/desk/PublicReleaseCard.tsx
  - src/lib/data/public.ts
  - src/lib/data/public-results.ts
  - src/lib/data/public-profile.ts
  - src/lib/data/types.ts
  - src/lib/data/public-release.ts
  - src/lib/data/supabase/public-release.ts
  - src/lib/data/tournaments.ts
  - src/lib/data/supabase/tournaments.ts
  - src/lib/demo/public-release.ts
  - src/lib/i18n/dictionaries/en.ts
  - src/lib/i18n/dictionaries/tl.ts
  - src/lib/i18n/dictionaries/hil.ts
  - src/lib/public/pairings-live.ts
  - src/lib/supabase/types.ts
  - src/lib/data/public-release.test.ts
  - src/lib/data/supabase/tournaments.test.ts
out_of_scope:
  - The database enforcement and wrappers (T-0010), except a compatible client call.
  - The feedback form and inbox (T-0012).
  - Per-playing-day release.
  - Applying migrations to the live project.
interfaces:
  - tournaments.publish_views
  - the release-state read and setter delivered by T-0010
  - the existing publish_pairings snapshot
deliverables:
  - A Public page card in Settings with one switch per surface, owner/organizer only.
  - A clear held/published state, last change and preview link.
  - Public-page held-by-organizer copy.
  - Revalidation of the affected public pages and the pairings version.
  - Tests and a browser check of release and hold.
acceptance:
  - "AC1 [test]: Toggling a surface changes the anon result and the public page without a redeploy."
  - "AC2 [test]: Only owner/organizer can change the switches; a desk account is refused."
  - "AC3 [review]: Pairings can be released while the frozen snapshot stays unchanged; no republish is required."
  - "AC4 [review]: The public page distinguishes held by the organizer from not published yet."
  - "AC5 [cmd]: pnpm typecheck, pnpm lint and pnpm test pass."
  - "AC6 [review]: A browser check covers release and hold for each surface, including the 24th event's pairings hold."
constraints_security:
  - Do not expose the publish_views object or any private field publicly; expose booleans only.
  - The setter validates keys and booleans and is authorized in the database.
  - Do not let a desk account change public release.
constraints_compatibility:
  - Do not change the frozen published snapshot rule.
  - A hold must be reversible without touching the draw.
database_migration: additive
escalation:
  - Stop if T-0010 has not settled the release-state read or the key list; do not invent a second contract.
  - Owner approval is required before applying any migration to the live project.
deployment_impact: code
deployment_verification: "pnpm typecheck, pnpm lint and pnpm test; static check that vercel.json is unchanged and no deployment is created."
---

# Context

`publish_views` already exists, but only the pairings wrappers read it. T-0010 makes the other
surfaces authoritative and provides a safe release-state read. This task is the desk UI and the
public held-state copy.

The 24th Bamboo Tee is currently `pairings: false`. The release card must show that state and let
the organizer release it without republishing the draw.

The pairings page can be cached and has `/api/pairings/version`; the release change must invalidate
or version the page so a held surface cannot stay visible until the cache expires.
