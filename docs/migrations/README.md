# Migration probe

The owner applies migrations by pasting scripts into the Supabase SQL editor. The SQL editor does not
record them in `supabase_migrations.schema_migrations`, so neither the repository nor the app can say
which migrations the live database has. The probe answers that question by asking the database
catalogue what exists. It is read-only.

Health triage F6 and desk F4 are the two places this gap was recorded.

## Run it

1. Generate the query from the migrations in this repository:

   ```
   pnpm migrations:probe
   ```

   It reads `supabase/migrations`, writes `docs/migrations/probe.sql`, and prints how many migrations
   and objects it found. It does not connect to a database. Run it again whenever a migration is
   added or changed; `pnpm test` fails if the committed `probe.sql` is not the file the script would
   write now.

2. Open the Supabase SQL editor for the project you want to check, paste the whole of
   `docs/migrations/probe.sql`, and press Run. It is one statement. It selects from
   `to_regclass`, `to_regprocedure`, `pg_policies`, `pg_indexes`, `information_schema.columns` and
   `pg_type`. It writes nothing: no DDL, no insert, no update, no `do` block.

3. Read the result, which has one row per migration in filename order:

| Column | Meaning |
| --- | --- |
| `migration` | The migration file name, without `.sql` |
| `objects_expected` | How many schema objects that migration creates |
| `objects_found` | How many of those objects the database has now |
| `status` | `applied` (all found), `partly` (some found), `missing` (none found) |

4. Record the result in `docs/PLAN.md`, section "Database scripts the owner runs". State the date,
   the project, the counts of `applied`, `partly` and `missing`, and name every `partly` or
   `missing` migration with the objects it is short of. A result that is not written down is lost
   when the SQL editor history turns over.

## Reading the result

- `missing` on a migration whose script the owner has not pasted yet is expected. That is how a
  pending script shows up.
- `partly` means the migration started and did not finish, or a later change dropped one of its
  objects. Name the missing objects, then look for the migration that should create them.
- `applied` means every object the file creates exists. It does not prove the body of a function is
  the current one, and it does not prove that grants or seed rows are right. Read it as "the schema
  is there", not as "the migration is correct".
- An object created by an earlier migration also counts for a later one that writes it again
  (`create or replace function`), because the probe asks whether the object exists, not when it
  arrived.
- The repository holds the golf desk migrations and the workspace migrations. Paste the same file
  into each Supabase project you maintain and read the rows that belong to that project; a project
  that does not hold the workspace tables will show the workspace migrations as `missing`.

## Migrations the probe cannot check

Six migrations create no object the catalogue can be asked about. `pnpm migrations:probe` refuses to
run if a new migration joins them without an entry and a reason in `ALLOW_LIST` in
`scripts/migrations-probe.mjs`.

| Migration | Why it has no object to check |
| --- | --- |
| `20261023000001_player_portal_grants` | Grants only: three `revoke execute` statements |
| `20261030000000_revoke_anon_execute` | Grants only: `revoke` anon and `grant` authenticated on existing functions |
| `20261032000000_photo_bucket_limits` | Storage bucket settings only: file size limit and mime types |
| `20261105000200_flights_field_wide_classes` | One constraint dropped, nothing created |
| `20261108004000_public_leaderboard_sides` | Retired no-op, kept so the version is on record |
| `20261123000600_timeline_permission` | Three permission rows inserted, nothing created |

Check those by hand if it matters, and say in `docs/PLAN.md` that they were checked by hand.

## What the extractor reads

`scripts/migrations-probe.mjs` recognises the object-creating statements a migration can contain:

- `create table` (with or without `if not exists`)
- `create type`
- `create or replace function` and `create function`, with their argument types, which is what
  `to_regprocedure` needs
- `create index` and `create unique index`
- `create policy`
- `alter table ... add column`

Comments, single-quoted strings and dollar-quoted function bodies are ignored, so a commented-out
statement or a `create table` inside a function body is not counted.

The test is `src/lib/data/migrations-probe.test.ts`. It runs the extractor on two fixtures and on
every real migration, and checks that `docs/migrations/probe.sql` is current and read-only.
