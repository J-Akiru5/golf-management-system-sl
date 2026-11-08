# Public player profile and team leaderboard (issue 198)

## Objective

Replace the public `Tee times` navigation pill with `Player Profile` and `Leaderboard`, keeping the
four tabs in the URL. The profile searches a confirmed player and shows their frozen hole-by-hole
card. The leaderboard ranks two-man teams cumulatively across every published round, with category
and class filters and a ten-team limit.

## Repository and branch

- Repository: `golf-management-system-sl`
- Worktree: `C:\Users\Client\Teeline Golf\wt-198-profile-leaderboard`
- Branch: `feat/issue-198-profile-leaderboard`, rebased onto `origin/develop` at `1873a91`
- Issue: #198

## Decisions taken with the owner

- Rank **two-man teams**, cumulative across published rounds. Both partners' Stableford points are
  added.
- The leaderboard has **both** a category filter and a class filter. A team matches a category when
  either partner is in it; a class is the team's class, taken from the published flight.
- The public profile shows the **selected player's** frozen card only. The leaderboard payload stays
  aggregate-only, so it never carries every player's hole-by-hole card.
- Ties keep the same rank and are marked `T`. The organizers' written tie-break rule is displayed
  from `tie_break_policies.procedure`; the page does not invent a structured countback when the
  policy is missing.

## What changed

- `supabase/migrations/20261108003000_public_profile_leaderboard.sql` (additive, **not applied**):
  - `public_programme()` adds the stable player id to its player list.
  - `public_player_scorecard(p_player, p_tournament)` returns one confirmed player's summary,
    partner and frozen cards.
  - `public_team_leaderboard(p_tournament)` returns one row per player per published round, with
    totals and the confirmed tie-break rule. The page adds the partners together.
  - All three read `round_publications.snapshot`, never a live scoring table.
- `src/lib/data/public-profile.ts`, `public-team-leaderboard.ts`, `public-tabs.ts` and their tests.
- `src/components/public/PublicTournamentNav.tsx`, `PlayerProfileSearch.tsx`,
  `PlayerProfileView.tsx`, `TeamLeaderboard.tsx`.
- `src/app/(public)/pairings/page.tsx` (profile tab and the new nav), `src/app/(public)/pairings/DemoPairings.tsx`
  (demo profile), `src/app/(public)/leaderboard/page.tsx` (cumulative team table, with the old
  per-round tables as a fallback when the migration is not applied), and
  `src/components/public/RosterView.tsx` (the shared nav).
- `src/lib/demo/public-leaderboard.ts` and `src/lib/demo/ids.ts` for demo data.
- English, Tagalog and Hiligaynon keys in `src/lib/i18n/dictionaries`.

## Verification

- `pnpm typecheck`: passed, rerun after the rebase onto `1873a91`.
- `pnpm lint`: passed, rerun after the rebase.
- Focused Vitest run: 6 files, 46 tests passed, rerun after the rebase.
- Full Vitest run before the rebase: 1699/1701 passed. `src/lib/routing/invariants.test.ts` and
  `src/lib/export/export-files.test.ts` timed out under the measured red resource level; both passed
  in isolation afterwards (9 tests). This is contention, not a code failure. `develop` now carries
  `5eaea38`, which gives the heavy random flight test a 60 second limit.
- `pnpm build`: **passed** after the rebase, with `NODE_OPTIONS=--max-old-space-size=2048` under a
  red resource level. The route table includes `/pairings`, `/roster` and `/leaderboard`.
- Dev-server check: `/pairings`, `/pairings?tab=profile&player=…`, `/roster` and `/leaderboard`
  returned 200. The profile rendered both sample cards and the partner; the leaderboard rendered the
  ten teams; `?category=Ladies&flight=Class+A` re-ranked the filtered team to 1. The temporary dev
  server was stopped afterwards.
- SQL check: the migration was run against a local PGlite PostgreSQL engine with stub tables and
  sample data. `public_programme()` returned the player ids, `public_player_scorecard()` returned the
  player, partner and two frozen cards, and `public_team_leaderboard()` returned one row per player
  per round with the confirmed tie-break procedure. The earlier Supabase editor error at `cross`
  came from a fragment starting at that line, not from the file; the bare-function lateral joins
  were still rewritten into the parenthesised `FROM latest l, LATERAL (…)` form used by the other
  migrations. Run the whole file, or select all of it in the SQL editor before pressing Run.
- The migration has **not been applied** to any Supabase project. The SQL has not been executed
  against a database from this tree because the Supabase CLI is not installed on this machine.

## Next steps

1. Apply `20261108003000_public_profile_leaderboard.sql` to a disposable or staging database and
   check the three functions. The owner must approve the live project application.
2. Run `pnpm build` and the browser check when resources allow. Check `/pairings?tab=profile`,
   `/leaderboard`, the category/class filters, the phone layout and the empty states.
3. Review the diff and integrate through the repository workflow.
