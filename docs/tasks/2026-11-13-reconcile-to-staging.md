# Reconcile the finished worktrees to staging (13 Nov 2026)

**Status:** merged into `develop` and pushed; promotion to `staging` waits on CI. One migration is
merged but not applied.

## Objective

Merge the recent, finished worktrees into the integration branch and promote them to `staging`
through the existing pull request, with no regressions.

## What was merged

Integration branch `integrate/reconcile-2026-11-13`, based on `44106f2`, merged with `--no-ff`:

| Branch | Commits | Shape |
| --- | --- | --- |
| `ws-db-truth` | 1 | clean |
| `fix/desk-safety` | 1 | one import conflict in `register/page.tsx`; kept both |
| `fix/photo-public-consent` | 1 | one conflict in `adapters.ts`; kept the branch's defensive storage removal and develop's `publicDataChanged()` |
| `feat/draw-pairing-sheet-ui` | 2 | `CHANGELOG.md` conflict; entry moved to Unreleased Added |
| `feat/player-card-profile` | 6 | five files; see below |

`feat/player-card-profile` was local only and was pushed to `origin` before merging.

### `feat/player-card-profile` resolutions

- `leaderboard/page.tsx`, `pairings/page.tsx`: keep develop's public-cache reads, add the branch's
  live-class helpers, drop the old direct loaders.
- `scorecard.ts` (`relationToPar`): keep the branch's complete-range guard and develop's rule that a
  picked-up hole is left out of the comparison.
- `portal.ts`: keep develop's pick-up shape (0 strokes plus the `pickedUp` flag), add the optional
  `playerId` boundary check, and derive a card total from the holes only when every hole is present.
- `ScorecardBreakdown.tsx`: take the branch's paper-card version, which already renders pick-ups.
- The branch's nullable-total tests were updated to the shipped model; a pick-up is 0 strokes, and a
  card's total is the sum of the holes played.

## Verification

- `pnpm typecheck` clean.
- `pnpm test`: 2378 of 2378 pass across 222 files.
- `pnpm lint` clean.
- `pnpm build` was not run locally: the worktree shares `node_modules` through a junction, and
  Turbopack refuses paths outside the worktree root. CI runs the real build and the browser checks,
  which are the required checks on the pull request.

## Open

1. **Promotion.** `develop` is at `91642d7` (plus this note). PR #243 `develop → staging` is open and
   moves with every push. Merge it once both required checks pass.
2. **Migration not applied.** `supabase/migrations/20261111000100_public_photo_token.sql` is merged but
   not applied. It adds `players.photo_public_token`, ties the public path to it, adds the withdraw
   triggers, and deletes the old guessable public objects. Today there are zero public photo paths and
   one orphaned object (`6b92ac17-ee58-403b-a5d1-88faa7f4e8ce.jpg`). Run the file on its own in the SQL
   editor; `supabase db push` would also apply unrelated pending migrations.
3. **`agentctl` is stale.** The installed CLI rejects `plan/policy.yaml`, whose `allowed_branches` are
   `main` and `staging` with `develop` excluded, matching `vercel.json`. The policy note says 1.7.0
   reads the allowlist from the file; the installed build predates that, so `agentctl db` refuses to
   run.
4. **Not touched on purpose.** `luna-ui` has 18 modified files and `feat/teeline-player-visuals` one.
   They are unfinished. The older unmerged branches (Nov 8 and earlier) are parked, not deleted.

## Resume

```
git checkout develop && git pull            # the main checkout is behind
gh pr checks 243                            # both required checks
gh pr merge 243 --merge                     # once green
```
