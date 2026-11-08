---
id: T-0005
title: Retire or align the parked legacy draw writer
milestone: M1
priority: P2
status: ready
rev: 1
objective: "Remove or update the parked legacy persistence path so no reachable save can omit the playing day's round."
outcome: A future re-enable of the legacy store cannot collapse every playing day back to day 1.
verification_profile: unit
integration_target: develop
dependencies: []
ownership:
  - src/lib/data/supabase/persist.ts
  - src/lib/store/legacy-supabase-store.tsx
  - src/lib/data/supabase/persist.test.ts
out_of_scope:
  - Re-enabling the legacy store.
  - Changing the active desk store or the save_draw function.
interfaces:
  - persist.ts save path and its only importer legacy-supabase-store.tsx
deliverables:
  - Either deletion of the parked writer and its importer, or a version that always names the round.
  - A test proving the connected save path cannot send a null round.
acceptance:
  - "AC1 [review]: persist.ts no longer exposes a save path that omits the round, or it is deleted with its last importer."
  - "AC2 [test]: The connected save path always carries a round id, and a null round save is unreachable."
  - "AC3 [cmd]: pnpm typecheck, pnpm lint and pnpm test pass."
constraints_security:
  - Do not introduce a second write path around RLS or save_draw.
constraints_compatibility:
  - If the legacy store is deleted, confirm no route or test imports it before removal.
database_migration: none
escalation:
  - If another branch still imports the legacy store, stop and coordinate instead of deleting it.
deployment_impact: code
deployment_verification: pnpm typecheck, pnpm lint and pnpm test; static check that vercel.json is unchanged and no deployment is created.
---

# Context

Audit follow-up D3. `src/lib/data/supabase/persist.ts` still contains a save path that sends no
round. Only `legacy-supabase-store.tsx` imports it today, so it is parked, but if it is re-enabled
every generate and move collapses the week to day 1. The active path is the desk store, which names
the round.

Prefer deletion when the importer is genuinely unused. Otherwise make the round required and add
the regression test. Do not re-enable the legacy store as part of this task.
