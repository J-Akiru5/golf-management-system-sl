# Brief: two fixes to the scan inbox logic (same branch, `src/lib/scoring/inbox/` only)

You are a builder. Work only in this worktree (branch `agent/scan-inbox-logic`, one commit already on
it). Do not push, merge, deploy or touch any other branch. Read `AGENTS.md` first. The first pass
was reviewed: the state machine, batch plan and suggestions are good and stay as they are. Two things
need to change, one is a bug and one is a new owner decision.

## Fix 1 (bug): `canConfirm` can never be true

`scanReadiness` raises the `no_marker` blocker whenever `scan.markerId === null`. But by the state
facts a `matched` scan has **no marker yet**: the marker is set by the `confirm` event. So a matched
scan always has the `no_marker` blocker and `canConfirm` is never true. The desk picks or accepts the
marker on screen first, and only then sends `confirm`.

Change `scanReadiness` (and `ScanReadinessOptions`):

- Add `markerId?: string | null` to `ScanReadinessOptions`: the marker chosen on screen but not
  confirmed yet. The positional call form gains no new argument; callers that need it use the options
  form.
- The effective marker is `scan.markerId ?? options.markerId ?? null`. `no_marker` is raised only
  when the effective marker is null. `marker_is_player` is raised when the effective marker equals
  `scan.playerId`.
- `canConfirm` is true for a `matched` scan with a player, an effective marker that is not the
  player, and an image. `canCreateCard` stays: a `confirmed` scan with no blockers.
- Update the doc comments so they say the marker may still be pending on a matched scan.

Tests (add to `readiness.test.ts`, do not weaken existing ones; an existing test that expected
`no_marker` on a matched scan with no pending marker still holds): matched scan with a pending
marker can be confirmed; matched scan without a pending marker gets `no_marker`; pending marker equal
to the player gets `marker_is_player`; a confirmed scan still reports `canCreateCard` as before.

## Fix 2 (owner decision): the app assigns the marker

The owner decided on 13 November (D6, amended): the marker is the player from the other team in the
group and **the app assigns it**; nobody has to pick or type it, and the name signed on the card is not
used. The desk can still change it. When the group has more than one eligible player the app fills
the first one in group order, and if that order is not known it fills nothing rather than guess.

In `markers.ts`:

- `MarkerPoolPlayer` gains optional `position?: number | null`: the player's place in the group,
  1 for the first. Absent or null means unknown.
- `MarkerCandidates` gains `assignedMarkerId: string | null`.
- Assignment rule, on the candidates you already compute: use only candidates whose team is known
  (`teamKnown: true`). If there is exactly one, assign it. If there are several and every one has a
  numeric position, assign the lowest position (break a tie by player id). Otherwise assign nobody.
  Never assign a candidate whose team is unknown. When no candidate is assigned, `assignedMarkerId`
  is `null` and the existing `candidates` list and `reason` are returned as before.
- Keep the existing sort order of `candidates` and the existing reasons.
- Update the file's top comment: the app assigns, the desk can change it.

Tests (add to `markers.test.ts`): one known other-team candidate is assigned; two candidates with
positions assign the lower position regardless of name order; two candidates without positions assign
nobody; one candidate with an unknown team assigns nobody and is still listed; no group and no
candidates give `assignedMarkerId: null`; a candidate on the same known team is never assigned.

## Rules to respect

- Pure functions, strict TypeScript with `noUncheckedIndexedAccess`, no `any`, no new dependency.
- Never guess data: a missing team or position is never filled in.
- Do not weaken or delete any existing test. Plain language, no em-dash pile-ups.
- Export anything new from `index.ts` (the type changes flow through the existing exports).

## Done means

```bash
pnpm typecheck && pnpm lint && pnpm test
```

All three must pass; report the actual output. If lint reports formatting only, run
`pnpm exec biome check --write src/lib/scoring/inbox` and run the three again. Add one new commit
with a plain subject line (do not amend) and stop. Do not push. In your final message list the
changes, the tests added and every judgment call.
