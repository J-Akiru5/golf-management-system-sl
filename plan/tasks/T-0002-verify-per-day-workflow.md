---
id: T-0002
title: Verify per-day draw, save, publish and portal end to end
milestone: M1
priority: P0
status: blocked
rev: 1
objective: Exercise the merged scheduling follow-up against the applied migrations on a disposable two-day event and record every pass or failure.
outcome: The per-day board, save, publish and player portal are proven with real rows before the 24th Bamboo Tee.
verification_profile: unit
integration_target: develop
dependencies:
  - T-0001
ownership:
  - docs/tasks/2026-11-08-scheduling-verification.md
  - docs/PLAN.md
out_of_scope:
  - Fixing defects found. Record the evidence and file a task or issue instead.
  - Applying migrations, changing schema or editing real member data.
interfaces:
  - Desk screens at /admin and /tee-times
  - Public /pairings and player /my
  - A disposable two-day event
deliverables:
  - A verification report with the steps, commands, results and any console output.
  - A list of failures with severity and the audit finding each belongs to.
acceptance:
  - "AC1 [review]: A two-day disposable event is drawn per day, saved, reloaded and published, and the report records each step."
  - "AC2 [review]: /pairings shows both playing days after both are published, and /my shows one start per day for a two-day player."
  - "AC3 [cmd]: pnpm vitest run src/lib/data/supabase/load-desk-state.test.ts passes and covers a requested day with no round."
  - "AC4 [cmd]: pnpm typecheck, pnpm lint and pnpm test pass on the task branch."
constraints_security:
  - Use a disposable event and throwaway players; no real member data or photos.
  - Do not print keys, tokens or database URLs.
constraints_compatibility:
  - Do not change production data or deployment configuration.
  - Do not weaken a test to make the run pass.
database_migration: none
escalation:
  - Stop if T-0001 is not integrated or the Supabase test account cannot see the project.
  - Stop at the first destructive or ambiguous write and report the exact screen and row.
deployment_impact: none
---

# Context

The audit found that per-day loading, drawing, saving, publishing and the portal were each broken in
a different place. The follow-up changed all five paths but none have run against applied
migrations with a two-day event. This task is the proof, not another implementation pass.

If a step fails, write the evidence down and file the follow-up. Do not quietly patch production
data or mark the step passed because the code reads correctly.
