---
id: M2
title: Player experience and media storage
status: planned
target: TBD
owner: Jeff
---

# M2: player experience and media storage

## Outcome

Three product requests opened on 8 November 2026 are built without changing a confirmed tournament rule or editing the live schema: a public player roster that never leaks the draw, a player scorecard that understands team formats, and one reusable Cloudflare R2 path for media and documents.

## Definition of done

- The public roster is reachable without login, is searchable, filters by flight, and its browser payload carries no tee time, pairing key, contact detail or private photo path.
- The player scorecard shows gross and net for the signed-in player and the partner/team row the tournament format calls for, and refuses to invent a score when the partner card is absent.
- The storage service signs uploads and downloads, validates type and size, deletes objects, and keeps the scorecard scan path working.
- No deployment is created by an agent, and no migration is applied without the owner.

## Sequence

1. T-0007 closes the roster gap on the existing published programme.
2. T-0009 generalises the R2 client already used by the scorecard scan.
3. T-0008 builds the pure team-format engine and the player-facing card. Live player writes remain owner-gated.

## Risks

- The roster depends on `public_programme()` continuing to answer only while the event is published.
- The player scorecard cannot show a partner card or accept a live player write until an owner-approved projection and RLS change exist.
- The R2 half cannot be proven against a real bucket without owner credentials. Code and validation can be completed and tested without them.
