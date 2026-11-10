---
id: M2
title: Public release and feedback
status: active
target: 24th Bamboo Tee
owner: Jeff
---

# M2: public release and feedback

## Outcome

The organizer can decide which public surfaces are released, the public pages say whether a
surface is held or not yet published, and a public visitor can send feedback that reaches a desk
inbox. Every release decision and every feedback submission is stored, auditable and never exposed
publicly by accident.

## Definition of done

- Every public surface is held at the database, not in the page, and #196 gives the organizer the
  switches.
- The 24th Bamboo Tee's current pairings hold is visible as held, and the organizer can release it
  without republishing the draw.
- A public visitor can submit feedback; the organizer can read and triage it in the desk; no
  feedback is public.
- The public pages, anon RPCs, staff permissions and cache invalidation are tested.
- No migration is applied to the live project without the owner's approval.

## Sequence

1. T-0010 enforces the release policy in the database and public reads; it is the base for the
   release UI.
2. T-0011 adds the Public page controls and the held-by-organizer copy.
3. T-0012 adds the public feedback form, storage and desk inbox in parallel with T-0010.
4. T-0013 adds the feedback signal and optional digest after T-0012.

## Risks

- A page-only gate would be bypassable with the anon key; the database must be authoritative.
- The pairings page and its `/api/pairings/version` cache must include the policy change, or a held
  surface can stay visible until the cache expires.
- The 24th Bamboo Tee is days away. The release UI must be reversible and must not change the frozen
  snapshot or the live board.
- Feedback may contain personal data; keep it organizer-only and collect contact only with consent.
