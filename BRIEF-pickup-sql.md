# Brief: pick-up in the scoring database (step 3b, SQL file only, NOT applied)

You are a builder. Work only in this worktree (branch `agent/pickup-sql`). Do not push, merge,
deploy, apply a migration or touch any other branch. Read `AGENTS.md` first and follow it. Then read
`docs/spec/IGCC_Tournament_Desk.md`, section "Scoring as worked on the card, confirmed 12 November
2026", and `docs/tasks/2026-11-13-batch-scan-verify.md` (step 3).

## Why

On the paper card a player who cannot score a point on a hole picks up and the scorer writes an X.
The hole scores **0 points** (gross and net), counts as a **played** hole, and has **no stroke
count**. On Day 1, 28 of 36 cards had at least one X. The database cannot hold this today: nothing in
the migrations mentions a pick-up, `scorecard_entries.strokes` null is treated as "a blank or
illegible hole" and blocks `approve_scorecard`, and `recalculate_player_results` would score a
missing number as par + 2 points. A parallel builder is changing the TypeScript engine with the same
rules; this file is the database half. Follow the shape the published side already reads: a pick-up
is `picked_up = true` with no stroke count, and **wherever the database requires a number it stores
`0`** (see `src/lib/player/portal.ts` and `src/lib/player/paper-scorecard.ts`, which map a published
hole with `pickedUp: true` to `grossStrokes: 0`).

## Scope

One new file: `supabase/migrations/20261113000200_pickup_scores.sql`, and one new test file:
`src/lib/scoring/__tests__/pickup-scores-migration.test.ts`. Nothing else. Do not edit an existing
migration, `src/lib/supabase/types.ts`, the data layer or any component. If something else must
change, say so in your report.

The header follows the style of `20261035000000_scoring_schema.sql`: what it does, **"NOT APPLIED.
Review before `supabase db push`."**, and one line saying it **changes existing tables and replaces
existing functions, so the owner must approve applying it by name** (AGENTS.md). It depends on the
scoring schema, workflow and later migrations, which may not be applied to the live project.

## What to change

Find the **newest definition of every function you replace** by reading the migrations in filename
order (for example `build_round_snapshot` and `public_round_results` have several; the last one wins).
Copy that body, change only what this brief says, and keep everything else, including
`security definer`, `set search_path = ''`, role checks and error codes. `create or replace` keeps the
existing grants, so do not add grant or revoke lines for a function that already exists. Do **not**
change any function signature: a new signature would create a second function beside the old one.

1. **`scorecard_entries`**: add `picked_up boolean not null default false` and a named check
   `not picked_up or strokes is null`. A pick-up has no stroke count.
2. **`hole_resolutions`** and **`approved_hole_scores`**: add `picked_up boolean not null default
   false`. Both have `strokes smallint not null check (strokes > 0)`. Replace that check (drop the
   auto-named `<table>_strokes_check`, add a named check) with
   `(picked_up and strokes = 0) or (not picked_up and strokes > 0)`. These are the only constraints
   you may drop.
3. **`check_scorecard_entry`** (the entry trigger): a pick-up entry passes the stroke range check
   (it has no number). Read the whole function first and change only what a pick-up needs.
4. **`submit_scorecard`**: the entries JSON already uses snake-case keys (`hole`, `strokes`,
   `confidence`, `manually_confirmed`). Accept `picked_up` the same way. A true value requires strokes
   to be blank or absent, stores `strokes` null and `picked_up` true; true with a number raises
   `22023` with a plain message. Absent or false behaves exactly as now.
5. **`approve_scorecard`**: an entry with `picked_up` and null strokes is a filled hole, not "a blank
   or illegible hole". The sum for the written-total comparison leaves pick-ups out, and the
   written-total check is **skipped when the card has any pick-up** (the numbers cannot add up to a
   card total). A card with no pick-up behaves exactly as before. Keep the entry-count check, the
   low-confidence check and everything else.
6. **`apply_canonical`**: the proposal rows gain `"pickedUp": true` (with `"strokes": 0`). Today the
   function checks each row against the approved cards or the head resolution. Extend that check so a
   pick-up row is accepted only when every approved card that has an entry for that hole says
   pick-up (or the current resolution is a pick-up), and a row that says a number is refused when any
   source says pick-up and the reverse. A number against a pick-up is a conflict and must have no row,
   as two different numbers already do. Store `picked_up` and `strokes = 0` on the new
   `approved_hole_scores` row.
7. **`resolve_hole`**: keep the signature. `p_strokes = 0` means "settle this hole as a pick-up":
   it skips the range check against `stroke_min` and `stroke_max`, stores `picked_up = true` and
   `strokes = 0` on the resolution, and the audit `after` JSON gains `'pickedUp', true`. A negative
   value is still refused. `previous_strokes` keeps meaning "the number before", so when the previous
   canonical hole was a pick-up store null there and add `'previousPickedUp', true` to the audit
   `before`. Any other value behaves exactly as now.
8. **`recalculate_player_results`**: a hole with `picked_up` scores 0 gross points and 0 net points,
   counts in `holes_counted`, and adds nothing to `gross_strokes` or `net_strokes` (do not subtract
   handicap strokes from it). Holes without `picked_up` score exactly as now. Do not add a column to
   `round_results`.
9. **Published snapshot**: `build_round_scorecards` and `build_round_snapshot` (and
   `public_round_results` / `public_player_scorecard` if they read hole rows) must emit
   `pickedUp: true` on a pick-up hole, with `grossStrokes` 0, in the same JSON shape the portal reads.
   Read `src/lib/player/portal.ts` and `src/lib/player/paper-scorecard.ts` to see the exact key names
   and where the flag lives, and `20261042000000_player_scorecard_snapshot.sql` for how holes are
   built today. A hole that is not a pick-up must produce exactly the same JSON as before (no new
   key). If a function turns out not to read hole rows at all, leave it alone and say so.
10. Search the migrations for every other function that reads `approved_hole_scores.strokes`,
    `scorecard_entries.strokes` or `hole_resolutions.strokes` (also `20261108003000_public_profile_leaderboard.sql`).
    Each one must either treat a pick-up correctly or be listed in your report as "reads strokes,
    left unchanged because ...".

Golf rules stay tournament settings. Pick-up = 0 points is the only rule you encode. Never default a
missing value.

## The test file

There is no database here, so the test is a structural guard that reads the SQL file as text
(`node:fs` and `path`, fast). Assert at least:

- the header says `NOT APPLIED` and mentions owner approval;
- `picked_up` is added to the three tables with `default false`, the three named checks exist, and the
  only `drop constraint` statements are `hole_resolutions_strokes_check` and
  `approved_hole_scores_strokes_check`;
- each replaced function appears with `security definer` and `set search_path = ''`, keeps its
  `has_club_role` check where it had one, and mentions `picked_up`;
- no `drop table`, `drop function`, `delete from`, `truncate`, policy change or `storage.buckets` change;
- no `create or replace function` carries a different parameter list from its original (compare the
  parameter type list against the migration it came from, reading both files).

At the end of the migration add a comment block "Checks to run once applied to a disposable project":
a numbered list (a card with two pick-ups approves; the same card with a written total still
approves; a pick-up beside a number on two cards is a conflict; `resolve_hole` with 0 settles a
pick-up; results show 0 points and the right holes counted; the published JSON carries `pickedUp`).

## Rules to respect

- Plain SQL in the style of the existing migrations: lowercase keywords, two-space indent, plain
  language comments, no em-dash pile-ups, no marketing words.
- Do not weaken or delete any existing test. Do not edit any file outside the two named ones.

## Done means

```bash
pnpm typecheck && pnpm lint && pnpm test
```

All three must pass; report the actual output. If lint reports formatting only, run
`pnpm exec biome check --write src/lib/scoring/__tests__` and run the three again. Commit with one
plain subject line and stop. Do not push. In your final message list the files, the checks the test
makes, every judgment call, the functions you left unchanged and why, and anything outside the scope
that also needs changing (generated types, data layer, UI).
