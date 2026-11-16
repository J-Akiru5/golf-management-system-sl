# Brief: show the class name on the desk card and in the results table (step 2b)

You are a builder. Work only in this worktree (branch `agent/desk-class`). Do not push, merge,
deploy, apply migrations or touch any other branch. Read `AGENTS.md` first and follow it.

## Why

The desk card has a context line (`src/components/scoring/CardContextLine.tsx`, built from
`src/lib/scoring/card-context.ts`) that can show a class, but `ScoresDesk.tsx` never passes it, so
the class never appears. Separately, the standings table on the same screen prints the raw flight
id under each player's name (`row.flightId ?? "No flight"`, around line 1272 of
`src/components/scoring/ScoresDesk.tsx`), for example `flight-a` or a UUID. A desk user cannot read
that. In the app a "flight" is shown to people as a **class** (Class A, Class B, ...).

## What to build

Read first: `src/lib/data/scoring.ts` (`ScoringPlayerSeed`), `src/lib/data/supabase/scoring.ts` (how
players are loaded, around lines 255 to 335), `src/lib/data/supabase/scoring-open-round.test.ts`
(how the loader is tested with a fake client), and `src/components/scoring/ScorecardWorkspace.tsx`
(the optional `context` prop).

1. **Carry the class name on each scoring player.** Add `flightName?: string | null` to
   `ScoringPlayerSeed` in `src/lib/data/scoring.ts`, with a doc comment: `undefined` means the
   connected repository did not look it up (the demo), `null` means it looked and the player has
   no class.
2. **Load it.** In `src/lib/data/supabase/scoring.ts`, read the names of the flights used by the
   round's entries from the existing `flights` table (`id`, `name`) with one query, following the
   exact pattern, club scoping and error handling the other queries in that file use. Set
   `flightName` on each scoring player: the flight's name when the entry has a flight, `null` when
   `entry.flight_id` is null. If the entry has a flight id but no flight row comes back, use `null`
   (never the raw id). Do not add or change any table, column, policy, function or migration.
3. **Show it on the card.** In `ScoresDesk.tsx`, where `<ScorecardWorkspace ... />` is rendered,
   pass `context={{ className: selectedPlayer?.flightName }}`. Pass the value as it is: `undefined`
   stays `undefined`, so the demo (which has no names) shows no class, and `null` shows "Class Not
   set", which is then true. Do not pass partner, team handicap, tee or group; they are not loaded
   yet.
4. **Fix the results table.** Replace `{row.flightId ?? "No flight"}` with the class name looked
   up from the round's players by `row.playerId` (`players` is already in scope; check), falling
   back to `No class` when the name is `null` or `undefined`. A raw id must never appear.

## Tests (required, Vitest)

- Extend `scoring-open-round.test.ts` (or add a sibling test file) so the loader is checked: a
  player whose entry has a flight gets that flight's name; a player whose entry has no flight gets
  `flightName: null`; a flight id with no row gets `null`.
- If you add a small pure helper (for example `classLabel(flightName)` returning the name or
  `No class`), put it in `src/lib/scoring/` with its own test.
- All existing tests must still pass unchanged.

## Rules to respect

- Strict TypeScript with `noUncheckedIndexedAccess`, no `any`, no new dependencies.
- Plain language in comments and UI text. User-facing text says "class", not "flight".
- Do not weaken or delete any existing test.
- Do not touch the schema, auth, RLS, `supabase/migrations`, or any file under
  `src/components/public`. Do not touch `ScorecardWorkspace.tsx` or `card-context.ts` (they are
  done); only pass props to them.

## Done means

```bash
pnpm typecheck && pnpm lint && pnpm test
```

All three must pass; report the actual output. If lint reports formatting only, run
`pnpm exec biome check --write src/lib src/components/scoring` and run the three again. Commit with
one plain subject line and stop. Do not push. In your final message list the files changed, the
tests you added, and anything you were unsure about.
