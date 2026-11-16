# Brief: scan inbox table and functions (step 4a, SQL file only, NOT applied)

You are a builder. Work only in this worktree (branch `agent/scan-inbox-sql`). Do not push, merge,
deploy, apply a migration or touch any other branch. Read `AGENTS.md` first and follow it. Then read
`docs/tasks/2026-11-13-batch-scan-verify.md` (step 4 and the decisions D1 to D8) and the two
migrations whose conventions you must copy: `supabase/migrations/20261035000000_scoring_schema.sql`
(tables, `scorecards`, `scorecard_images`, RLS, the private `scorecard-images` bucket) and
`supabase/migrations/20261036000000_scoring_workflow.sql` (`submit_scorecard`, `approve_scorecard`,
grants and revokes). The newest migration on `develop` is `20261112000200_desk_can_correct_scorecard.sql`.

## Why

The owner scans a whole batch of paper cards, the system reads and suggests a player for each, and
the desk confirms the player and the marker on the card view. A scan therefore exists before any
`scorecards` row does, and `scorecards.player_id` and `scorer_id` are `not null`, so scans need
their own table. The owner decided (13 Nov): the system suggests and the desk confirms (D2); the
marker is a player from another team in the group, picked by the desk (D6); confirming is the
approval step (D7); migrations are written for review and **not applied** (D4).

## Scope

One new file: `supabase/migrations/20261113000100_scorecard_scans.sql`, and one new test file:
`src/lib/scoring/__tests__/scorecard-scans-migration.test.ts`. Nothing else. Do not edit an existing
migration, `src/lib/supabase/types.ts`, the data layer or any component. If you think something else
must change, say so in your report.

The file starts with a header in the same style as the scoring schema: what it does, **"NOT APPLIED.
Review before `supabase db push`."**, and its dependencies (it needs the scoring schema and workflow
migrations, which are also not applied to the live project). Additive only: no change to an existing
table, column, policy or function.

## The table: `public.scorecard_scans`

Columns (types follow the existing scoring tables: `uuid` ids with `gen_random_uuid()`, `timestamptz`
with `now()`, `club_id` on the row):

- `id`, `club_id` (references `public.clubs`), `round_id` (composite FK to `competition_rounds
  (id, club_id)` on delete cascade, like `scorecards`).
- `storage_path text not null` with the same check as `scorecard_images` (non-blank and starts with
  `club_id::text || '/'`), `sha256 text not null` (64 lowercase hex), `mime_type` (same allowed list
  as `scorecard_images`), `byte_size bigint > 0`.
- Reading: `reader_engine text`, `reader_engine_version text`, `reader_name text`,
  `reader_written_total smallint` (null or > 0), `reader_holes jsonb` (null or a JSON array),
  `reader_raw jsonb`, `read_at timestamptz`.
- `candidates jsonb not null default '[]'` (must be a JSON array): the suggestions the matcher made,
  each `{playerId, score, reasons}`. They are a record of what was suggested, not a decision.
- `state text not null default 'uploaded'` with a check on exactly these six values: `uploaded`,
  `read`, `matched`, `confirmed`, `card_created`, `set_aside`.
- Decision: `player_id uuid`, `marker_id uuid` (both composite FK to `players (id, club_id)`),
  `confirmed_by uuid` (references `auth.users` on delete set null), `confirmed_at timestamptz`,
  `scorecard_id uuid` (composite FK to `scorecards (id, club_id)`, on delete set null),
  `set_aside_reason text`, `set_aside_by uuid`, `set_aside_at timestamptz`.
- `created_by uuid references auth.users on delete set null default auth.uid()`, `created_at`,
  `updated_at`.
- `unique (id, club_id)` and `unique (club_id, sha256)`: the same image uploaded twice is one scan.

Table checks (one named check each so a failure is readable):

- `player_id is distinct from marker_id` when both are set (a player cannot mark their own card).
- State consistency: `uploaded` has no reading, player, marker, confirmation or card; `read` has a
  reading (`reader_name` or `reader_holes` not null, `read_at` not null) and no player, marker,
  confirmation or card; `matched` has `player_id`, no confirmation, no card; `confirmed` has
  `player_id`, `marker_id`, `confirmed_by`, `confirmed_at`, no card; `card_created` has `player_id`,
  `marker_id`, `scorecard_id`, `confirmed_by`; `set_aside` has `set_aside_reason` (at least 3
  characters after trim), `set_aside_by`, `set_aside_at` and no card.
  Express this as one `check (...)` with a `case state when ...` or one check per state.
- Indexes: `(round_id, state)` and `(club_id, created_at)`.

RLS: enable it, add `scorecard_scans_member_read` (`select` for `authenticated`,
`public.is_club_member(club_id)`), exactly like `scorecards_member_read`. No insert, update or delete
policy: every write goes through the functions below.

Storage: the existing private `scorecard-images` bucket and its policy already cover a path that
starts with the club id. Do **not** create a bucket or change a storage policy.

## The functions

Every function is `security definer`, `set search_path = ''`, has the role check
`public.has_club_role(v_club, array['owner', 'organizer', 'desk'])` that raises `42501` with a plain
message otherwise, ends with `revoke all on function ... from public, anon;` and
`grant execute on function ... to authenticated;`, and writes one `public.scoring_audit` row (same
columns as `record_scorecard_correction` in `20261112000200_desk_can_correct_scorecard.sql`;
entity `'scorecard_scan'`, an action name you choose per function). Look the club up from the row
(or from the round for create), never from a parameter the caller could lie about. A missing row
raises `P0002`; a bad value raises `22023`; a not-allowed state change raises `23514`.

1. `create_scorecard_scan(p_round uuid, p_storage_path text, p_sha256 text, p_mime text, p_bytes bigint) returns uuid`.
   Idempotent by `(club_id, sha256)`: if the scan exists, return its id and change nothing.
2. `record_scan_reading(p_scan uuid, p_engine text, p_engine_version text, p_name text, p_written_total smallint, p_holes jsonb, p_raw jsonb, p_candidates jsonb) returns void`.
   Allowed from `uploaded` and `read`. A second call replaces the reading and the candidates. Moves
   the scan to `read`.
3. `match_scorecard_scan(p_scan uuid, p_player uuid) returns void`. Allowed from `read`, `matched`
   and `confirmed`. A non-null player moves the scan to `matched` (and clears `marker_id`,
   `confirmed_by`, `confirmed_at`, so changing the player reopens the decision). A null player moves
   it back to `read` and clears player, marker and confirmation. The player must belong to the scan's club.
4. `confirm_scorecard_scan(p_scan uuid, p_marker uuid) returns void`. Allowed only from `matched`.
   Sets `marker_id`, `confirmed_by = auth.uid()`, `confirmed_at = now()`, state `confirmed`. Raises if
   the marker is the player. Confirming is the approval step (D7), so it requires the desk role and
   nothing weaker. The marker must belong to the same club.
5. `set_aside_scorecard_scan(p_scan uuid, p_reason text) returns void`. Allowed from `uploaded`,
   `read`, `matched` and `confirmed`. Reason of at least 3 characters. Never from `card_created`.
6. `restore_scorecard_scan(p_scan uuid) returns void`. Only from `set_aside`: back to `read` when a
   reading exists, otherwise `uploaded`. Clears the set-aside fields.
7. `attach_scan_card(p_scan uuid, p_card uuid) returns void`. Allowed only from `confirmed`. The card
   must exist in the same club and round and its `player_id` must equal the scan's `player_id`;
   otherwise raise. Sets `scorecard_id` and state `card_created`. It does **not** create the card:
   the card is created by the existing `submit_scorecard`, and this function only links it.

`updated_at` is set by every function that changes the row.

State changes are exactly these and no others; `card_created` is final:

```
uploaded -> read -> matched -> confirmed -> card_created
read -> read (re-read)            matched -> matched (other player)     matched -> read (clear)
confirmed -> matched (reopen via match)
uploaded|read|matched|confirmed -> set_aside -> read|uploaded (restore)
```

## The test file

The migration is not applied and there is no database in this repo, so the test is a structural
guard that reads the SQL file as text (use `node:fs` and `path`; keep it fast). Assert at least:

- the header says `NOT APPLIED`;
- the table has RLS enabled and a member-read policy, and no `for insert|update|delete|all` policy
  on `scorecard_scans`;
- all seven functions exist, each with `security definer` and `set search_path = ''`, a
  `has_club_role` check naming `owner`, `organizer` and `desk`, a `revoke all ... from public, anon`
  and a `grant execute ... to authenticated`;
- the six states appear in the state check and every legal transition above is present in the SQL
  (search for the guard text, do not reimplement a parser);
- no statement drops, alters or deletes anything that exists (`drop table`, `alter table` on any
  table other than `scorecard_scans`, `delete from`, `truncate` must not appear), and nothing touches
  `storage.buckets`.

At the end of the migration add a comment block "Checks to run once applied to a disposable project":
a short numbered list of what to try by hand (create twice with the same hash gives one row; a player
equal to the marker is refused; confirm without a match is refused; attach with a card for another
player is refused; a member who is not owner, organizer or desk cannot call any function).

## Rules to respect

- Plain SQL in the style of the existing migrations: lowercase keywords, two-space indent, comments
  in plain language, no em-dash pile-ups, no marketing words.
- Do not weaken or delete any existing test. Do not edit any file outside the two named ones.
- Never invent a rule. Golf rules stay tournament settings; nothing here hard-codes one.

## Done means

```bash
pnpm typecheck && pnpm lint && pnpm test
```

All three must pass; report the actual output. If lint reports formatting only, run
`pnpm exec biome check --write src/lib/scoring/__tests__` and run the three again. Commit with one
plain subject line and stop. Do not push. In your final message list the files, the checks the test
makes, every judgment call, and anything outside the scope that also needs changing (the generated
types, the data layer and the UI are separate steps).
