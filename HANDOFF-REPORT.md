# Handoff report: issue #149, open a round for a scanned card

Branch: `feat/149-open-round` in this worktree. Nothing was pushed. The migration was not applied.

## What changed and why

A paper card could be scanned, but `/scores` had no way to accept it because nothing created
`competition_rounds`, `round_entries` or `handicap_snapshots` for the event. The demo hid the gap by
seeding all three in memory.

The change adds one guarded database function, `open_round`, that copies the **published** draw into
one playing day's round, its entries and its handicap snapshots in a single transaction. The desk
gets a Round setup panel on `/scores` that names the four settings, opens the round, and says why it
cannot: unpublished draw, draw that moved after the publish, old publish with no player ids, missing
setting, or unconfirmed tie-break. Owner and organizer can act; the desk sees the same state
read-only.

### Round settings

- Required cards per player, final approval authority and rules version come from the caller.
- The tie-break policy comes from the caller, then the stored round, then the club's **single**
  confirmed policy. If more than one confirmed policy exists it is left missing rather than picked.
- If any setting cannot be resolved the function refuses and names it. Nothing is defaulted by guess.
- The round status becomes `open`. The existing status guard allows draft to open and freezes the
  settings once scoring starts.

### Multi-day choice

The schema models one `competition_rounds` row per playing day. `open_round` now creates a draft
round for **every** playing day in `tournament_days` on its first call, because nothing else created
rounds for days after the first. It then opens the day the caller names, or the earliest existing
day. The published draw must still match the live board of the day being opened, so each day needs
its own published board before it can open. The `/scores` screen still reads the earliest day; the
day selector is listed as a follow-up.

### Stale and moved draws

- `p_expected_revision` must equal `tournaments.draw_revision`. A lower value is refused as stale.
- The published snapshot and the live board are reduced to the same signature
  (`groupNumber:playerId,playerId` joined by `|`, ordered by group number, empty groups left out).
  A difference is refused as "the draw changed after it was published".
- Calling again on the same revision returns the same round and changes nothing.

### Handicaps

No second handicap calculation was written. Each entry with a frozen index goes through the existing
`save_handicap_snapshot`, which recomputes Course and Playing Handicap from the registration's tee.
The index source comes from the frozen `handicap_records` row when present. A player with no frozen
index gets no snapshot; net scoring leaves them out rather than estimating. A player with a frozen
index but no tee or no effective date refuses the whole open with a message naming the player.

## Files

Changed:

- `supabase/migrations/20261108000100_open_round.sql` (new)
- `src/lib/data/open-round.ts` (new): shared decision rules, messages, codes, signature.
- `src/lib/data/open-round.test.ts` (new)
- `src/lib/data/scoring.ts`: `loadOpenRoundState`, `openRound`, demo behaviour, `rulesVersion`.
- `src/lib/data/scoring.test.ts`: demo open tests.
- `src/lib/demo/scoring.ts`: demo draw and rules version.
- `src/lib/data/supabase/scoring.ts`: connected state read, `openRound`, `openRoundRequest`,
  `publishedGroupsFromJson`, `buildView`/`roundForId` refactor.
- `src/lib/data/supabase/scoring-open-round.test.ts` (new)
- `src/lib/supabase/generated-types.ts`: `open_round` function entry only.
- `src/components/scoring/OpenRoundPanel.tsx` (new)
- `src/app/(desk)/scores/page.tsx`: panel wiring, state load, open handler.
- `src/lib/help/guides.ts`: help steps for the two new anchors (`scores-round`,
  `scores-round-open`), required by the existing help test.
- `docs/SCORECARD_SCAN.md`: "Open the round before the first card".

Commits on this branch:

```
abc993c Treat an unknown tie-break id as a missing setting
4b3b0ce Add Round setup to the Scores desk and the scan runbook
a6e0461 Open a round from the published draw in the demo and the connected app
265f113 Add the open-round decision rules shared by the desk and the database
c8afb60 Add open_round so a scanned card can be registered
```

## The migration

File: `supabase/migrations/20261108000100_open_round.sql`.

It is **additive**. It creates one new function,
`public.open_round(uuid, integer, smallint, text, uuid, text, smallint)`, with
`security definer`, `set search_path = ''`, an owner/organizer role check through
`has_club_role`, `revoke all ... from public, anon`, and `grant execute ... to authenticated`.
There are no `drop`, `alter table`, policy, RLS or grant changes to existing objects. It writes only
through the existing tables and the existing `save_handicap_snapshot`.

Behaviour: locks the event and the playing-day round; creates draft rounds for every playing day in
`tournament_days` when missing; refuses a stale revision, an unpublished draw, a published list
without player ids, a live board that no longer matches the publish, and any unresolved setting;
inserts the round entries from the published player ids; calls `save_handicap_snapshot` per frozen
index; writes one `scoring_audit` row with action `opened`; returns the round id. It is idempotent
for the same revision and never reads the live board to decide who is in the round.

## Commands run and results

Targeted while assembling:

```
pnpm vitest run src/lib/data/open-round.test.ts src/lib/data/scoring.test.ts src/lib/data/supabase/scoring-open-round.test.ts
Test Files  3 passed (3)
Tests       54 passed (54)
```

```
pnpm vitest run src/lib/help/guides.test.ts
Test Files  1 passed (1)
Tests       12 passed (12)
```

Full gate, final tree:

```
pnpm typecheck   -> clean (tsc --noEmit, no output)
pnpm lint        -> Checked 453 files. No fixes applied.
pnpm test        -> Test Files 120 passed (120), Tests 1160 passed (1160)
```

No `pnpm build` was run, per the brief. No SQL was executed and no database was touched.

## Not verified

- The SQL was never parsed by PostgreSQL or executed. There is no local database in this worktree and
  applying it is the orchestrator's job. Syntax, variable shapes and the signature comparison were
  reviewed by hand, not proven by a database.
- The connected path (`loadOpenRoundState`, `openRound`, `openRoundRequest`) was exercised only with
  fake Supabase clients. It was not run against a live project, so RLS behaviour, PostgREST argument
  casting and the read-back after opening are unproven.
- The `/scores` panel was not opened in a browser. Rendering, the keyed reset after opening, and the
  Reload path are reviewed but not observed. No dev server was started.
- The full multi-day round creation was not executed. It is written against `tournament_days`
  (`day_number`, `play_date`, `is_playing_day`) and reviewed, not run.

## Risks

- The draw signature exists in two places, TypeScript (`drawSignature`) and SQL (section H). They
  are tested on the TypeScript side and mirrored by hand. If one changes without the other, a
  published draw can be refused as moved. The refusal is safe, but it would block opening.
- A published snapshot written before player ids were stored cannot be opened. That is deliberate
  (never match by name), but the desk must publish the pairings again first. The screen says so.
- No confirmed `tie_break_policies` row exists yet in the schema or the UI. Until one is recorded,
  `open_round` correctly refuses. The first card cannot be registered before that row exists.
- Creating draft rounds for every playing day changes what `loadRound` sees only in the sense that
  there are more rows; it still takes the earliest day. A day 2 board is not reachable from `/scores`
  yet.
- `open_round` creates all day rows inside its transaction. If an event has duplicate play dates
  across `tournament_days`, the unique `(tournament_id, play_date)` constraint skips one day; opening
  that specific day then raises `open_round_round_conflict` with a clear message.
- The UI offers `owner` and `organizer` only for the finalization authority because the existing
  finalization function does not implement `committee`. The database column still accepts
  `committee`, so an API caller could store it.

## Follow-up issues

1. **Record the written tie-break policy from the desk**
   There is no screen or RPC that creates a confirmed `tie_break_policies` row, so `open_round`
   cannot succeed until one is inserted by hand.
2. **Let `/scores` choose the playing day**
   The scoring repository still loads the earliest round; day 2 boards need a day selector and
   `loadRound(tournamentId, dayNumber)`.
3. **Keep later scoring actions on the opened day**
   `submitCard`, `approveCard` and the other writes refresh the earliest round, not necessarily the
   day that was opened.
4. **Prove `open_round` against a disposable event**
   Add a transactional test that creates a disposable tournament, calls the function, asserts the
   entries and snapshots, then rolls back, in the style used for the scoring workflow verification.
5. **Show the round settings after opening**
   The panel shows the stored settings, but the rest of the page still shows only the authority and
   card policy; the tie-break policy and rules version could be surfaced beside the round status.
