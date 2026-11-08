---
id: T-0003
title: Release stale-day locks and honour AM/PM starts in two-tee routing
milestone: M1
priority: P1
status: ready
rev: 1
objective: "Close audit findings C13 and C14 so a locked group from another playing day is released and two-tee starts use each session's start time."
outcome: "A day's board cannot inherit another day's hole and time, and a two-tee event can place its afternoon at the afternoon start."
verification_profile: unit
integration_target: develop
dependencies: []
ownership:
  - src/lib/routing/**
out_of_scope:
  - Changing persistence, the desk store or the Tee times screen.
  - Changing discriminant rules, group size, tee or flight settings.
interfaces:
  - route() options in src/lib/routing/types.ts
  - Locked group shape used by the desk
deliverables:
  - Routing changes for stale-day lock release and per-session two-tee planning.
  - Tests for both findings in the existing routing suites.
acceptance:
  - "AC1 [test]: A lock labelled D3-AM-A passed to a day-4 draw is released with a warning, its players are not reserved, and no hole or time is duplicated."
  - "AC2 [test]: Two-tee with sessions starts the afternoon groups at the PM start and the board carries AM or PM."
  - "AC3 [test]: The existing routing suite still passes without changing an assertion."
  - "AC4 [cmd]: pnpm typecheck, pnpm lint and pnpm test pass."
constraints_security:
  - The routing module stays pure; no I/O, clock or environment reads.
constraints_compatibility:
  - Do not change the public route() signature unless the desk is updated in the same task.
  - Keep the existing behaviour when sessions are absent.
database_migration: none
escalation:
  - If a lock from another day cannot be identified without changing the label format, stop and propose the format change before editing.
deployment_impact: code
deployment_verification: pnpm typecheck, pnpm lint and pnpm test; static check that vercel.json is unchanged and no deployment is created.
---

# Context

Audit sections C13 and C14 are the two routing findings the 8 November follow-up left open.

C13. A lock labelled for day 3 is passed to a day-4 draw. Its players are added to `lockedIds` and
skipped, the day-3 group is emitted unchanged, and `occupied` cannot match the day-4 label, so a new
day-4 group is placed on the same hole and time. The day numbering also jumps.

C14. `startFormat: "two_tee"` with `starts: { AM, PM }` runs the planner once from
`config.firstTeeTime`, so the afternoon groups go off in the morning and the board has no AM/PM.

The audit's smallest fixes and proposed tests are in `docs/audit-scheduling-2026-11-08.md`. Keep the
engine pure and add the tests there, not in a page.
