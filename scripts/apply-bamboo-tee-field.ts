/**
 * Applies the 24th Bamboo Tee field to the connected Supabase project.
 *
 * `supabase/seed/bamboo-tee-2026-field.sql` is the same data as one transaction, for anyone with a
 * database password. This script does it through the REST API with the project's service key, so it
 * works from the workspace without the Postgres password.
 *
 * The database decides the day rule: a registration whose playing days do not match the event's
 * required days is refused by the deferred constraint trigger. Such a player is reported and left
 * out rather than given days the club sheet does not have.
 *
 *   pnpm exec tsx scripts/apply-bamboo-tee-field.ts             apply, and report what is there
 *   pnpm exec tsx scripts/apply-bamboo-tee-field.ts --dry-run   plan only
 *   pnpm exec tsx scripts/apply-bamboo-tee-field.ts --status    counts only
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  MAX_READABLE_INDEX,
  parseFieldSheet,
  parseWaitingList,
  type FieldPair,
} from "../src/lib/seed/bamboo-tee-field";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.");
}

const mode = process.argv.includes("--dry-run")
  ? "plan"
  : process.argv.includes("--status")
    ? "status"
    : "apply";
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const SEED = join(process.cwd(), "supabase", "seed");
const field = parseFieldSheet(readFileSync(join(SEED, "bamboo-tee-2026-field.psv"), "utf8"));
const waiting = parseWaitingList(
  readFileSync(join(SEED, "bamboo-tee-2026-waiting-list.psv"), "utf8"),
);

const tidyName = (name: string) =>
  name.replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ").replace(/,$/, "").trim();
const nameKey = (name: string) => tidyName(name).toLowerCase();

/** The note the desk reads next to a player. It never holds the entry back. */
function notesFor(pair: FieldPair, side: "member" | "guest"): string[] {
  const player = pair[side];
  const notes: string[] = [];
  if (!/^\S[^,]*,\s*\S/.test(player.name)) notes.push("The name on the club sheet is incomplete.");
  if (player.index === null) notes.push("No index on the club sheet; 0 was recorded.");
  else if (player.index > MAX_READABLE_INDEX) {
    notes.push(`The club sheet shows ${player.index}, which is not an index; 0 was recorded.`);
  }
  if (player.schedule.length === 0) notes.push("No schedule on the club sheet.");
  else if (player.scheduleNote) {
    notes.push(`The schedule on the club sheet is incomplete: ${player.scheduleNote}`);
  }
  return notes;
}

function fail(where: string, error: { message: string } | null): never {
  throw new Error(`${where}: ${error?.message ?? "unknown error"}`);
}

const event = await db
  .from("tournaments")
  .select("id, club_id, name, cutoff_date, required_days, play_date")
  .ilike("name", "%bamboo%")
  .order("play_date", { ascending: false })
  .limit(1)
  .maybeSingle();
if (event.error) fail("Reading the event", event.error);
if (!event.data) throw new Error("No event matching 'bamboo' was found.");

const tournament = event.data;
const dayRows = await db
  .from("tournament_days")
  .select("id, day_number, play_date, is_playing_day")
  .eq("tournament_id", tournament.id)
  .eq("club_id", tournament.club_id);
if (dayRows.error) fail("Reading the playing days", dayRows.error);

const days = new Map<number, { id: string; date: string }>();
for (const row of dayRows.data ?? []) {
  if (row.is_playing_day) days.set(row.day_number, { id: row.id, date: row.play_date });
}

async function report(): Promise<void> {
  const ready = await db
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournament.id)
    .eq("status", "ok");
  const records = await db
    .from("handicap_records")
    .select("id", { count: "exact", head: true })
    .eq("club_id", tournament.club_id)
    .eq("effective_date", tournament.cutoff_date);
  const players = await db
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("club_id", tournament.club_id);
  const directory = await db
    .from("players")
    .select("id, full_name")
    .eq("club_id", tournament.club_id);
  const counts = new Map<string, number>();
  for (const row of directory.data ?? []) {
    counts.set(nameKey(row.full_name), (counts.get(nameKey(row.full_name)) ?? 0) + 1);
  }
  const duplicates = [...counts.entries()].filter(([, n]) => n > 1);
  console.log(`${tournament.name} · cut-off ${tournament.cutoff_date}`);
  console.log(`  players in the club:               ${players.count ?? "?"}`);
  console.log(`  ready registrations in the event:  ${ready.count ?? "?"}`);
  console.log(`  handicap records at the cut-off:   ${records.count ?? "?"}`);
  console.log(
    `  names held more than once:         ${duplicates.length}${
      duplicates.length > 0 ? ` (${duplicates.slice(0, 8).map(([name]) => name).join(", ")})` : ""
    }`,
  );
}

console.log(
  `${tournament.name} · cut-off ${tournament.cutoff_date} · ${days.size} playing days · requires ${tournament.required_days ?? "no fixed number of"} day(s)`,
);

if (mode === "status") {
  await report();
  process.exit(0);
}

const playerRows = await db
  .from("players")
  .select("id, full_name")
  .eq("club_id", tournament.club_id);
if (playerRows.error) fail("Reading the players", playerRows.error);
const playerByName = new Map<string, string>();
for (const row of playerRows.data ?? []) playerByName.set(nameKey(row.full_name), row.id);

const membershipRows = await db
  .from("player_memberships")
  .select("player_id")
  .eq("club_id", tournament.club_id)
  .eq("status", "active");
if (membershipRows.error) fail("Reading the memberships", membershipRows.error);
const members = new Set((membershipRows.data ?? []).map((row) => row.player_id as string));

const failures: string[] = [];
let done = 0;

async function ensurePlayer(name: string): Promise<string> {
  const known = playerByName.get(nameKey(name));
  if (known) return known;
  const inserted = await db
    .from("players")
    .insert({ club_id: tournament.club_id, full_name: tidyName(name) })
    .select("id")
    .single();
  if (inserted.error) fail(`Creating ${name}`, inserted.error);
  const id = inserted.data.id as string;
  playerByName.set(nameKey(name), id);
  return id;
}

async function applyPlayer(pair: FieldPair, side: "member" | "guest"): Promise<void> {
  const player = pair[side];
  const name = tidyName(player.name);
  const fromSheet = player.index !== null && player.index <= MAX_READABLE_INDEX;
  const index = fromSheet && player.index !== null ? player.index : 0;
  const playerId = await ensurePlayer(player.name);

  if (!members.has(playerId)) {
    const inserted = await db.from("player_memberships").insert({
      club_id: tournament.club_id,
      player_id: playerId,
      membership_type: side,
    });
    if (inserted.error) fail(`Membership for ${name}`, inserted.error);
    members.add(playerId);
  }

  const record = await db.from("handicap_records").upsert(
    {
      club_id: tournament.club_id,
      player_id: playerId,
      handicap_index: index,
      effective_date: tournament.cutoff_date,
      source: fromSheet ? "ngap_import" : "manual",
    },
    { onConflict: "player_id,effective_date" },
  );
  if (record.error) fail(`Handicap record for ${name}`, record.error);

  // The day rows are created by the registration trigger from these date keys, inside the same
  // transaction, so the event's day rule sees them before the transaction commits.
  const teePreferences: Record<string, string> = {};
  for (const entry of player.schedule) {
    const day = days.get(entry.day);
    if (day) teePreferences[day.date] = entry.session;
  }

  const registration = await db
    .from("registrations")
    .upsert(
      {
        club_id: tournament.club_id,
        tournament_id: tournament.id,
        player_id: playerId,
        frozen_index: index,
        status: "ok",
        reasons: notesFor(pair, side),
        answers: { teamNo: pair.number, teePreferences },
      },
      { onConflict: "tournament_id,player_id" },
    )
    .select("id")
    .single();
  if (registration.error) {
    failures.push(`${pair.number}. ${name}: ${registration.error.message}`);
    return;
  }

  const registrationId = registration.data.id as string;
  for (const session of ["AM", "PM"] as const) {
    const ids = player.schedule
      .filter((entry) => entry.session === session)
      .map((entry) => days.get(entry.day)?.id)
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) continue;
    const saved = await db
      .from("registration_days")
      .update({ session, selected: true })
      .eq("registration_id", registrationId)
      .in("tournament_day_id", ids);
    if (saved.error) fail(`The ${session} day for ${name}`, saved.error);
  }
  done += 1;
}

const tasks = field.flatMap((pair) =>
  (["member", "guest"] as const).map((side) => ({ pair, side })),
);

if (mode === "plan") {
  console.log(`would register ${tasks.length} player(s)`);
  process.exit(0);
}

for (let at = 0; at < tasks.length; at += 10) {
  await Promise.all(
    tasks.slice(at, at + 10).map(async ({ pair, side }) => {
      try {
        await applyPlayer(pair, side);
      } catch (error) {
        failures.push(
          `${pair.number}. ${tidyName(pair[side].name)}: ${(error as Error).message}`,
        );
      }
    }),
  );
}

for (const entry of waiting) {
  try {
    await ensurePlayer(entry.name);
  } catch (error) {
    failures.push(`waiting list, ${tidyName(entry.name)}: ${(error as Error).message}`);
  }
}

console.log(`registered ${done} of ${tasks.length} player(s)`);
if (failures.length > 0) {
  console.log(`${failures.length} player(s) not registered:`);
  for (const failure of failures) console.log(`  ${failure}`);
}
await report();
