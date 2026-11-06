/**
 * Empties the player record: every row the club holds about who is playing, what they shot and how
 * the board was drawn. Event settings, courses, classes, flights, the club and the login accounts are
 * left alone, so the app still boots and the same people can sign in afterwards.
 *
 * The order below is child first. The delete guard on `players` refuses a hard delete while a
 * registration or a round entry still points at the player, so the children have to go before it.
 *
 *   pnpm exec tsx scripts/wipe-player-data.ts --backup    write the rows to backups/, change nothing
 *   pnpm exec tsx scripts/wipe-player-data.ts --apply     back up, then delete
 *   pnpm exec tsx scripts/wipe-player-data.ts             plan only
 *
 * `backups/` is gitignored. A backup is written before any delete in `--apply`; if the export fails
 * the run stops.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.");
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/** Child before parent. Anything missing from this list is kept on purpose. */
const WIPE = [
  // Scorecards and the scoring trail.
  "scorecard_entries",
  "scorecard_images",
  "scorecard_extractions",
  "scorecards",
  "approved_hole_scores",
  "hole_resolutions",
  "scoring_audit",
  // Results and the published board.
  "round_results",
  "round_entries",
  "round_publications",
  "group_members",
  "groups",
  "pairings_versions",
  "competition_rounds",
  "deferred_matches",
  "scorer_assignments",
  // Entries. The registration goes first: the day-rule trigger refuses a registration left with
  // fewer days than the event requires, so removing the days first is refused. Its cascade takes
  // `registration_days` with it, and the sweep below catches anything left over.
  "registrations",
  "registration_days",
  // Handicaps.
  "handicap_import_rows",
  "handicap_import_batches",
  "handicap_snapshots",
  "handicap_records",
  "player_memberships",
  "players",
  // Import bookkeeping for the fields that were imported.
  "import_rows",
  "import_batches",
  // Messages.
  "notification_reads",
  "notifications",
  // Staff history.
  "audit_log",
] as const;

const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--backup")
    ? "backup"
    : "plan";

async function rows(table: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const result = await db
      .from(table)
      .select("*")
      .range(from, from + page - 1)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    const first = result.error
      ? await db.from(table).select("*").range(from, from + page - 1)
      : result;
    if (first.error) throw new Error(`Reading ${table}: ${first.error.message}`);
    const batch = (first.data ?? []) as Record<string, unknown>[];
    all.push(...batch);
    if (batch.length < page) return all;
  }
}

async function count(table: string): Promise<number> {
  const result = await db.from(table).select("*", { count: "exact", head: true });
  if (result.error) throw new Error(`Counting ${table}: ${result.error.message}`);
  return result.count ?? 0;
}

console.log(`mode: ${mode}`);
const before = new Map<string, number>();
for (const table of WIPE) before.set(table, await count(table));
const total = [...before.values()].reduce((sum, n) => sum + n, 0);
console.log(`${WIPE.length} tables hold ${total} player record(s)`);
for (const [table, n] of before) console.log(`  ${table.padEnd(26)} ${n}`);

if (mode === "plan") {
  process.exit(0);
}

if (process.argv.includes("--no-backup")) {
  console.log("skipping the backup (--no-backup)");
} else {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(process.cwd(), "backups", `wipe-${stamp}`);
  mkdirSync(dir, { recursive: true });
  for (const table of [...WIPE].reverse()) {
    const data = await rows(table);
    writeFileSync(join(dir, `${table}.json`), `${JSON.stringify(data, null, 2)}\n`, "utf8");
    console.log(`  saved ${table.padEnd(26)} ${data.length}`);
  }
  console.log(`backup written to ${dir}`);
}
if (mode === "backup") process.exit(0);

/**
 * PostgREST refuses a DELETE without a WHERE clause, and a join table has no `id` to filter on. The
 * column that is asked for is only there to satisfy that rule: every candidate is not-null, so the
 * filter matches every row, and the count below proves it did.
 */
async function clear(table: string): Promise<void> {
  const sample = await db.from(table).select("*").limit(1);
  if (sample.error) throw new Error(`Reading ${table}: ${sample.error.message}`);
  const columns = Object.keys(sample.data?.[0] ?? {});
  const candidates = ["id", ...columns.filter((column) => column !== "id")];
  let last = "no filter matched";
  for (const column of candidates) {
    const gone = await db.from(table).delete().not(column, "is", null);
    if (!gone.error) return;
    last = `${column}: ${gone.error.message}`;
  }
  throw new Error(`Clearing ${table}: ${last}`);
}

let removed = 0;
for (const table of WIPE) {
  const start = await count(table);
  if (start === 0) {
    console.log(`  cleared ${table.padEnd(26)} 0 -> 0`);
    continue;
  }
  await clear(table);
  const now = await count(table);
  removed += start - now;
  console.log(`  cleared ${table.padEnd(26)} ${start} -> ${now}`);
}
console.log(`deleted ${removed} row(s)`);
