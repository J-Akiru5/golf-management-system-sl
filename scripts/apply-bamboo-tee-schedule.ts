/**
 * Sets every registration's playing days and morning/afternoon choice to exactly what the club's
 * 24th Bamboo Tee sheet says.
 *
 * `supabase/seed/bamboo-tee-2026-schedule.psv` is the sheet in one line per player per day:
 *
 *   name|day|session|side
 *
 * The sheet is the record. A player not on it has no days here, and the events's own rule requires
 * exactly two, so the finished state is two selected days per player with the session the sheet
 * names.
 *
 * Why this exists: `registration_days` had drifted. Rows were missing entirely for some players and
 * others kept a single day, so the per-day field did not match the sheet's own totals (Saturday
 * morning must be 126 players). The desk's day editor can only move one player at a time, and the
 * event's deferred day rule makes a half-finished move fail, so the whole field is reconciled here
 * in one pass instead.
 *
 * One upsert per registration, in a single request, so the deferred day rule sees the finished
 * state rather than an intermediate one.
 *
 *   pnpm exec tsx scripts/apply-bamboo-tee-schedule.ts --dry-run
 *   pnpm exec tsx scripts/apply-bamboo-tee-schedule.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const envFile = process.env.SEED_ENV ?? ".env.local";
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error(`NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (${envFile}).`);
}

const dryRun = process.argv.includes("--dry-run");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/**
 * A name key that survives the sheet's habits: surname-first or given-name-first, no space after the
 * comma, and accented letters written plainly. Words are sorted, so "PAUIG, MARK" and "Mark Pauig"
 * land on the same key.
 */
const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .sort()
    .join(" ");

/** Sheet spellings that differ from the name stored on the player record. */
const ALIASES = new Map<string, string>([
  [norm("CAMOT, ARIANNE"), norm("Arriane Camot")],
  [norm("MIN, HYANG GEE"), norm("Min Hyanggee")],
  [norm("MANGALINDAN, VIC"), norm("MANGALINDAN, VICTOR")],
]);

const file = join(process.cwd(), "supabase", "seed", "bamboo-tee-2026-schedule.psv");
const lines = readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
const [, ...body] = lines;

const schedule = new Map<string, Map<number, "AM" | "PM">>();
for (const line of body) {
  const [name, day, session] = line.split("|");
  if (!name || !day || !session) continue;
  const key = ALIASES.get(norm(name)) ?? norm(name);
  const days = schedule.get(key) ?? new Map<number, "AM" | "PM">();
  days.set(Number(day), session as "AM" | "PM");
  schedule.set(key, days);
}

function fail(where: string, error: { message: string } | null): never {
  throw new Error(`${where}: ${error?.message ?? "unknown error"}`);
}

const event = await db
  .from("tournaments")
  .select("id, club_id, name, required_days")
  .ilike("name", "%bamboo%")
  .order("play_date", { ascending: false })
  .limit(1)
  .maybeSingle();
if (event.error) fail("Reading the event", event.error);
if (!event.data) throw new Error("No event matching 'bamboo' was found.");
const tournament = event.data;

const dayRows = await db
  .from("tournament_days")
  .select("id, day_number, is_playing_day")
  .eq("tournament_id", tournament.id)
  .order("day_number");
if (dayRows.error) fail("Reading the event days", dayRows.error);
const playingDays = (dayRows.data ?? []).filter((d) => d.is_playing_day);

const regs = await db
  .from("registrations")
  .select("id, player:players(full_name)")
  .eq("tournament_id", tournament.id);
if (regs.error) fail("Reading the registrations", regs.error);

const unmatched: string[] = [];
const work: Array<{ id: string; name: string; rows: Array<Record<string, unknown>> }> = [];

for (const row of regs.data ?? []) {
  const name = (row.player as { full_name?: string } | null)?.full_name ?? "";
  const key = norm(name);
  const target = schedule.get(key);
  if (!target) {
    unmatched.push(name);
    continue;
  }
  if (target.size !== tournament.required_days) {
    throw new Error(`${name} has ${target.size} day(s) on the sheet; this event requires ${tournament.required_days}.`);
  }
  work.push({
    id: row.id as string,
    name,
    rows: playingDays.map((day) => ({
      club_id: tournament.club_id,
      registration_id: row.id as string,
      tournament_day_id: day.id as string,
      selected: target.has(day.day_number as number),
      session: target.get(day.day_number as number) ?? null,
    })),
  });
}

if (unmatched.length) {
  console.log(`not on the sheet (left untouched): ${unmatched.join(", ")}`);
}

if (dryRun) {
  console.log(`\n${work.length} registration(s) would be set to the sheet's exact days and sessions.`);
  process.exit(0);
}

let saved = 0;
for (const item of work) {
  // One request per registration: the upsert replaces that registration's four day rows as a
  // single transaction, so the deferred "exactly N days" rule only ever sees the finished state.
  const result = await db
    .from("registration_days")
    .upsert(item.rows, { onConflict: "registration_id,tournament_day_id" });
  if (result.error) fail(`Days for ${item.name}`, result.error);
  saved += 1;
  if (saved % 50 === 0) console.log(`  ${saved}/${work.length}`);
}

console.log(`\n${saved} registration(s) set from the sheet.`);
