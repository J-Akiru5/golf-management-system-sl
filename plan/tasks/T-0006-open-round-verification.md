---
id: T-0006
title: Exercise open_round end to end and record the scoring setup
milestone: M1
priority: P0
status: blocked
rev: 1
objective: Call open_round on a disposable published event after the migration is applied, confirm every guard and snapshot, and record the setup needed before the first scanned card.
outcome: The scoring desk can open a real playing day from the published draw, and the runbook says exactly which settings must be confirmed.
verification_profile: unit
integration_target: develop
dependencies:
  - T-0001
ownership:
  - docs/tasks/2026-11-08-open-round-verification.md
  - docs/SCORECARD_SCAN.md
  - docs/PLAN.md
out_of_scope:
  - Scanning or OCR work.
  - Changing scoring rules, tie-break policy or finalization authority.
  - Editing the real tournament or real player rows.
interfaces:
  - open_round(uuid, integer, ...) from 20261108000100
  - /scores round setup panel
  - The disposable event used by T-0002
deliverables:
  - A verification report with the call arguments, returned round id and guard results.
  - A runbook update naming every setting that must be confirmed and what stays blocked without it.
acceptance:
  - "AC1 [review]: open_round returns a round for a disposable published event, and a stale revision and a moved draw are both refused."
  - "AC2 [review]: One round entry and handicap snapshot exist per player with a frozen index, and no snapshot is invented for a player without one."
  - "AC3 [review]: A confirmed tie_break_policies row exists, or the runbook records that finalization remains blocked."
  - "AC4 [review]: The verification transaction raises and rolls back, and no disposable rows remain."
  - "AC5 [cmd]: pnpm typecheck, pnpm lint and pnpm test pass."
constraints_security:
  - No service key or database URL is printed or committed.
  - The disposable event and its entries are removed or rolled back before handoff.
constraints_compatibility:
  - Do not change the open_round signature or its ACL.
  - Paper remains the source of truth; this only records what the paper says.
database_migration: none
escalation:
  - Stop if T-0001 is not integrated or the tie-break policy has not been confirmed by the owner.
  - Stop if the published snapshot does not match the live draw; that is a real failure, not a test setup problem.
deployment_impact: none
---

# Context

Issue #149. The scan pipeline works, but `/scores` cannot accept a card because no round, entry or
snapshot exists. `open_round` was written and merged, and its migration is one of the nine pending
in T-0001. This task is the proof and the runbook, not a rewrite.

The function refuses a stale revision, an unpublished event and a draw that moved after publish. It
creates entries and snapshots only where a frozen index exists, and raises rather than guessing a
setting. Exercise those paths on the disposable event and write down exactly what the organizer must
confirm before 12 November.
