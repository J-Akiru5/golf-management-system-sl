---
id: T-0010
title: Enforce the public release policy on every public surface
milestone: M2
priority: P0
status: ready
rev: 1
objective: "Make publish_views and publish_allows authoritative for every public surface, so a held surface returns nothing to anon even when its rows or snapshot exist."
outcome: "The admin release UI can toggle each surface safely, and a direct anon call cannot bypass a hold."
verification_profile: unit
integration_target: develop
dependencies: []
ownership:
  - supabase/migrations/20261110000100_public_release_enforcement.sql
  - src/lib/data/supabase/public-pairings.ts
  - src/lib/data/supabase/public-programme.ts
  - src/lib/data/supabase/public-events.ts
  - src/lib/data/supabase/public-results.ts
  - src/lib/data/public.ts
  - src/lib/data/public-profile.ts
  - src/lib/data/public-team-leaderboard.ts
  - src/lib/public/**
  - src/lib/supabase/types.ts
  - src/lib/data/public.test.ts
  - src/lib/data/public-profile.test.ts
  - src/lib/data/public-team-leaderboard.test.ts
  - src/lib/data/supabase/public-pairings.test.ts
  - src/lib/data/supabase/public-programme.test.ts
out_of_scope:
  - The admin release UI and the desk settings screen (T-0011).
  - The public feedback form and inbox (T-0012).
  - Per-playing-day release; v1 is per event.
  - Applying the migration to the live project.
interfaces:
  - tournaments.publish_views from 20261110000000_publish_views.sql
  - public.publish_allows(uuid, text)
  - public_pairings, public_pairings_by_day, public_programme, public_team_leaderboard, public_published_rounds, public_round_results, public_player_photos, public_player_scorecard
deliverables:
  - Database wrappers or filtered returns for every supported surface key.
  - A safe public release-state read or flags in the public payload.
  - Tests for held and released reads with the anon key.
  - A note recording the final key list and any key left inert.
acceptance:
  - "AC1 [test]: An anon read returns no data for each held surface (pairings, tee times, roster, leaderboard, photos, rules) and the released data when the key is true."
  - "AC2 [test]: A direct anon RPC call cannot bypass a held surface; there is no page-only gate."
  - "AC3 [test]: An unpublished event cannot expose public_team_leaderboard, public_published_rounds or public_round_results."
  - "AC4 [test]: public_player_photos returns no path unless the photos key is true and photo_public_consent_at is set."
  - "AC5 [review]: The 24th Bamboo Tee still has pairings false after the change; no default or existing event is changed."
  - "AC6 [cmd]: pnpm typecheck, pnpm lint and pnpm test pass."
constraints_security:
  - Anon may read only the released, allow-listed fields; no private path or contact data is added.
  - The policy is enforced in SECURITY DEFINER functions, not in a page or a client.
  - Staff reads continue to work for the desk; do not weaken RLS.
constraints_compatibility:
  - Keep existing function signatures where possible; if a split is needed, ship the old name as a compatible wrapper.
  - Do not change the frozen published snapshot semantics.
database_migration: additive
escalation:
  - Owner approval is required before applying the migration to the live project.
  - Stop if a surface cannot be gated without exposing data or breaking a current caller; report the exact function and decision.
deployment_impact: code
deployment_verification: "pnpm typecheck, pnpm lint and pnpm test; static check that vercel.json is unchanged and no deployment is created."
---

# Context

Migration `20261110000000_publish_views.sql` added `tournaments.publish_views` and
`publish_allows`. Only `public_pairings` and `public_pairings_by_day` call it. The other keys are
stored but inert. The team leaderboard's `selected` CTE picks the event by date and does not check
`t.published`.

The admin UI in T-0011 needs a trustworthy backend. Do not hide a surface in the page; an anon
caller can call the RPC directly.

## Surface keys

The current keys are `pairings`, `ownPair`, `roster`, `leaderboard` and `photos`. The plan proposes
`teeTimes` and `rules` for the sections inside `public_programme`, and an optional `landing` key.
Confirm the final list in the task journal. `ownPair` must not hide a player's own pair or start by
accident; recommend keeping it visible or removing the key.

## Acceptance notes

The release UI needs a safe read of which keys are held. Add a small public function that returns
only booleans, or include a `release` object in the public payload. Do not leak the full
`publish_views` object if it may gain private fields later.
