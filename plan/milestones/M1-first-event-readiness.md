---
id: M1
title: First IGCC event readiness
status: active
target: 12 November 2026
owner: Jeff
---

# M1: first IGCC event readiness

## Outcome

The 24th Bamboo Tee can run from the desk with real numbers: every playing day has its own board,
the boards save and reload, publishing keeps every day, the public page and the player portal show
the right day, and a scanned card can be registered against a real round.

## Definition of done

- The live migration ledger is read, the contradictory records are reconciled, and every missing
  8 November migration is applied and verified.
- A two-day disposable event survives draw, save, reload, publish and portal reads with both days
  intact.
- The remaining scheduling findings that can corrupt a saved or published board are closed.
- `open_round` is exercised on a disposable event and records its round settings without guessing.
- No agent has deployed, and no production player data has been edited.

## Sequence

1. T-0001 applies the migration stack. It is the gate for the rest.
2. T-0002 proves the per-day workflow against real rows.
3. T-0003, T-0004 and T-0005 close the remaining code findings in parallel where ownership does not
   overlap.
4. T-0006 exercises scoring against the applied `open_round`.

## Risks

- The owner or the Supabase CLI account may not be available, which keeps T-0001, T-0002 and T-0006
  blocked.
- Real course data and a real NGAP export are still missing. The UAT can run on clearly labelled
  sample numbers, but the first real draw cannot.
- The repository `vercel.json` and the global deployment policy disagree about `staging` and
  `develop`. Do not resolve it by deploying.
