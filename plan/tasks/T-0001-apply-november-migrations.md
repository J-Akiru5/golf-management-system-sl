---
id: T-0001
title: Reconcile the live migration ledger and apply what is missing
milestone: M1
priority: P0
status: blocked
rev: 1
objective: "Read the live migration ledger first, reconcile the contradictory records for the 8 November stack, and apply only the migrations that are missing, each first checked in a transaction that rolls back."
outcome: The live schema and the repository records agree, so per-day draws, publishing, the player portal and scoring can be exercised against real rows.
verification_profile: unit
integration_target: develop
dependencies: []
ownership:
  - supabase/migrations/**
  - docs/PLAN.md
  - CHANGELOG.md
out_of_scope:
  - Changing migration SQL beyond a fix required to make it apply cleanly.
  - Creating real course, tee, hole or player data.
  - Deploying any branch or changing vercel.json.
interfaces:
  - Supabase CLI linked to project egfwfyznbndunqfqzxjx
  - plan/policy.yaml database policy
deliverables:
  - A recorded ledger read that classifies every 20261108 migration as applied or missing.
  - The missing migrations applied and listed by supabase migration list --linked.
  - A recorded verification result for each apply, including the transaction that rolled back.
  - Updated docs/PLAN.md, CHANGELOG.md and migration headers that agree with the ledger.
acceptance:
  - "AC1 [cmd]: supabase migration list --linked is run and its output is recorded for every 20261108 migration."
  - "AC2 [review]: The conflicting claims in the migration headers, docs/PLAN.md and CHANGELOG.md are reconciled against the ledger in one pass."
  - "AC3 [review]: Each missing migration is first run inside a transaction that raises and rolls back on a disposable event, with the output kept."
  - "AC4 [test]: A two-day disposable event has one competition_rounds row per playing day, and a null p_round save is refused once two rounds exist."
  - "AC5 [review]: The public pairings and the player portal return both playing days without merging duplicate group numbers, with one start per day."
  - "AC6 [cmd]: pnpm typecheck, pnpm lint and pnpm test pass on develop after the apply."
constraints_security:
  - The service role key and database URL are never printed, copied into the repository or committed.
  - Disposable rows are rolled back or deleted; no production player data is edited.
  - The owner authorizes the apply before the live project is touched.
constraints_compatibility:
  - Migrations stay additive and keep existing function signatures and ACLs.
  - No change to vercel.json or deployment settings.
database_migration: additive
escalation:
  - Owner authorization is required before applying to the live project.
  - The Supabase CLI account must be able to see project egfwfyznbndunqfqzxjx; a 403 stops the task.
  - If any migration fails its rollback check, stop and report the exact statement instead of pushing the rest.
deployment_impact: code
deployment_verification: Static check that vercel.json is unchanged and no deployment is created; the apply uses the owner-approved database path only.
---

# Context

The scheduling follow-up and the scoring round setup were merged in code on 8 November. Their
migrations are in the repository, but the repository does not agree on what is applied.

- The migration file headers say the 8 November files are NOT APPLIED.
- `docs/PLAN.md` says `20261108000100` is not applied and the follow-up migrations are not applied.
- The 0.28.0 changelog reports `20261108000100`, `00200`, `00300`, `00500`, `00600` and `00700` as
  **applied by the owner on 8 November, not independently checked**.
- The scheduling follow-up section records `20261108000800`, `00900` and `01000` as NOT applied.

The live ledger has not been read from this machine: there is no linked Supabase CLI state and no
`.env.local`. Do not guess which claim is true. Read the ledger first and make every record agree.

Order matters. `20261108000100_open_round.sql` creates the scoring function and the first rounds;
`20261108000500_rounds_per_playing_day.sql` backfills a round for every playing day and adds the
trigger; `20261108000600` and `20261108000700` read those days; `20261108000800`, `20261108000900`
and `20261108001000` harden the day's afternoon start, the save and the alerts.

Do not apply anything until the owner has authorized it. The safe work before that is reading each
migration against the live schema and preparing the rollback checks.
