---
id: T-0008
title: Build the player scorecard view with format-aware team totals
milestone: M2
priority: P2
status: ready
rev: 1
objective: "Add a pure, setting-driven team aggregation module and a player-facing scorecard view that shows the signed-in player's gross and net card, a partner row when partner data is published, and a team total only when the tournament format and complete data support it."
outcome: "A player can read their own card and the team score the event format calls for, with no invented score and no live write until the owner approves the projection and permissions for player entry."
verification_profile: unit
integration_target: develop
dependencies: []
ownership:
  - src/lib/scoring/team.ts
  - src/lib/scoring/team.test.ts
  - src/lib/scoring/types.ts
  - src/components/player/**
  - src/app/(player)/my/**
  - src/lib/player/**
  - src/lib/i18n/dictionaries/**
  - src/lib/data/scoring.ts
  - src/lib/data/supabase/scoring.ts
  - docs/tasks/2026-11-08-player-live-scorecard.md
out_of_scope:
  - Adding or changing a migration, RLS policy, database function or player write permission.
  - Writing a player-entered score to the database.
  - Adding a tournament format column or changing a confirmed tournament rule.
  - "Exposing another player's card beyond the partner or group data the published projection already allows."
  - Changing the staff scoring screens or the scanner.
interfaces:
  - PortalScorecard and player_portal_entries() from 20261042000000
  - src/lib/scoring/types.ts
  - src/lib/player/scorecard.ts
  - src/components/player/ScorecardBreakdown.tsx
  - tournament format setting (does not exist yet; the view must render individual only until it does)
deliverables:
  - A pure team aggregation module covering four-ball or best ball, team aggregate and scramble.
  - Unit tests for complete, partial and unsupported team data.
  - A player scorecard view with gross and net, par and stroke index, nine and total subtotals.
  - A client-side edit preview that recalculates team totals without saving.
  - A design note naming the owner decisions and the additive projection needed for live player entry.
acceptance:
  - "AC1 [test]: Four-ball uses the lower net score of the two players for each hole, team aggregate sums both players' scores, and scramble returns the single shared score; a missing player is never treated as zero and an unsupported format returns no team total with a stated reason."
  - "AC2 [test]: The card renders the player's gross and net rows and a team row only when the format and complete partner data exist; when partner data is absent the view says the partner card is not published and shows no numeric team score."
  - "AC3 [review]: /my/card shows par, stroke index, gross, handicap strokes, net and points, gross and net are visually distinct, and the table remains usable at 360 px by scrolling inside its own container."
  - "AC4 [review]: The edit preview recalculates totals on the client and is labelled as not saved; no player write is attempted and no migration is added. The design note names the owner decisions and the additive projection needed for live entry."
  - "AC5 [cmd]: pnpm typecheck, pnpm lint and pnpm test pass."
constraints_security:
  - "The view reads only the caller's own published card and data the published projection already exposes; it never reads a live private table from the browser."
  - "No other player's contact detail, handicap index, birthdate or photo is added to the payload."
  - A score is never invented, defaulted or carried over from another hole or player.
constraints_compatibility:
  - Golf rules and the team format are inputs, never constants in the aggregation module.
  - Keep the existing published card readable when the format or partner data is missing.
  - Do not change the staff scoring path or the public leaderboard payload.
database_migration: none
escalation:
  - Stop before adding a tournament format column, a player-group read function or any player write policy. Record the exact proposal and ask the owner.
  - Stop if the published projection does not carry the partner card; do not widen the projection in this task.
deployment_impact: code
deployment_verification: "Focused unit checks plus pnpm typecheck, pnpm lint and pnpm test; static check that vercel.json, package.json, supabase/migrations and the staff scoring routes are unchanged. No deployment is created."
---

# Context

Issue #186. The portal already shows the signed-in player's own frozen hole-by-hole card from the published snapshot, and the scoring engine already calculates gross, net, handicap strokes and Stableford points for one player. The missing pieces are the team-format aggregation and a player-facing layout that shows the partner and team rows.

Two boundaries shape this task:

1. **The published projection returns only the caller's own card.** Partner cards and live hole scores are not exposed to a player by any current function. Showing them needs an owner-approved projection, not a browser read of the scoring tables.
2. **The scoring write functions are staff-only.** A player cannot submit or edit a score today. Live player entry needs an additive function or policy plus a decision on attestation and locked holes.

The task therefore delivers the part that can be built safely now: the pure format engine, the complete player card layout, and a client-side edit preview that proves the recalculation and clearly says nothing is saved. The design note names the database work the owner must approve before the acceptance criteria for live entry can be met.
