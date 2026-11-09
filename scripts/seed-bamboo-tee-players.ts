/**
 * Adds the players who are on the 24th Bamboo Tee club sheet but were never entered in TeeLine.
 *
 * These eight names appear on the sheet with no birthdate, gender, NGAP ID or handicap anywhere the
 * club has supplied. The desk form will not accept a player without those fields, so this script
 * writes them through the service key instead, at the owner's instruction: name only, no invented
 * birthdate, gender or contact number. They land `needs_review` so the desk can complete them.
 *
 * Rules this script follows:
 * - A missing handicap is stored as 0 dated at the event cut-off, which is the owner's standing
 *   decision for this event. The routing engine already reads a missing index as 0, so the number is
 *   recorded rather than guessed at.
 * - The tee defaults to Blue, as the owner asked. Category and flight are left empty because they
 *   are derived from a handicap class nobody has supplied.
 * - Nothing is deleted or overwritten: an existing player with the same name is reused, and an
 *   existing registration is updated in place.
 *
 *   pnpm exec tsx scripts/seed-bamboo-tee-players.ts --dry-run   plan only
 *   pnpm exec tsx scripts/seed-bamboo-tee-players.ts             apply
 *
 * The environment is read from `.env.local` by default; point `SEED_ENV` at another file to change
 * that. The script never prints the service key.
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envFile = process.env.SEED_ENV ?? ".env.local";
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error(
    `NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (looked in ${envFile}).`,
  );
}

const dryRun = process.argv.includes("--dry-run");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/** The eight names the club sheet has and TeeLine does not, with the sheet's own side and days. */
const SEED: Array<{
  name: string;
  side: "member" | "guest";
  days: Record<number, "AM" | "PM">;
}> = [
  { name: "ALQUIROS, IRA", side: "member", days: { 1: "AM", 2: "AM" } },
  { name: "ALINSANGAN, NEIL", side: "guest", days: { 1: "AM", 2: "AM" } },
  { name: "SUPERFICIAL, DENNIS", side: "member", days: { 1: "AM", 2: "AM" } },
  { name: "GORRICETA, MICHAEL", side: "guest", days: { 1: "AM", 2: "AM" } },
  { name: "YOUN, SMITH", side: "member", days: { 1: "PM", 2: "PM" } },
  { name: "DARIUS, GREGORIO", side: "guest", days: { 1: "PM", 2: "PM" } },
  { name: "VILLASIS, VEL", side: "member", days: { 2: "PM", 4: "PM" } },
  { name: "DABAO, JOSE LUIS", side: "guest", days: { 3: "AM", 4: "PM" } },
];

const TEE_NAME = "Blue";

/** The note the desk reads on the row. It explains the gap without blocking the player. */
const REASONS = [
  "No birthdate, gender, NGAP ID or handicap on the club sheet; added name only from the sheet.",
  "No handicap index on file; 0 is used.",
];

const nameKey = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

function fail(where: string, error: { message: string } | null): never {
  throw new Error(`${where}: ${error?.message ?? "unknown error"}`);
}

const event = await db
  .from("tournaments")
  .select("id, club_id, course_id, name, cutoff_date, required_days, max_days")
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
  .order("day_number");
if (dayRows.error) fail("Reading the event days", dayRows.error);
const days = new Map<number, { id: string; date: string }>();
for (const row of dayRows.data ?? []) {
  if (row.is_playing_day) days.set(row.day_number as number, { id: row.id as string, date: row.play_date as string });
}

const tee = await db
  .from("tees")
  .select("id, name")
  .eq("club_id", tournament.club_id)
  .eq("course_id", tournament.course_id)
  .eq("name", TEE_NAME)
  .maybeSingle();
if (tee.error) fail(`Reading the ${TEE_NAME} tee`, tee.error);
if (!tee.data) throw new Error(`No ${TEE_NAME} tee exists for this course.`);

const existing = await db
  .from("players")
  .select("id, full_name")
  .eq("club_id", tournament.club_id);
if (existing.error) fail("Reading the players", existing.error);
const playerByName = new Map<string, string>();
for (const row of existing.data ?? []) playerByName.set(nameKey(row.full_name), row.id as string);

const membershipRows = await db
  .from("player_memberships")
  .select("player_id")
  .eq("club_id", tournament.club_id)
  .eq("status", "active");
if (membershipRows.error) fail("Reading the memberships", membershipRows.error);
const members = new Set((membershipRows.data ?? []).map((row) => row.player_id as string));

if (dryRun) {
  for (const person of SEED) {
    const known = playerByName.has(nameKey(person.name));
    const schedule = Object.entries(person.days)
      .map(([day, session]) => `D${day} ${session}`)
      .join(", ");
    console.log(`${known ? "reuse" : "create"} ${person.name} (${person.side}) ${schedule}`);
  }
  console.log(`\n${SEED.length} player(s), tee ${TEE_NAME}, no writes made.`);
  process.exit(0);
}

let created = 0;
let reused = 0;

for (const person of SEED) {
  let playerId = playerByName.get(nameKey(person.name)) ?? null;
  if (playerId) {
    reused += 1;
  } else {
    const inserted = await db
      .from("players")
      .insert({ club_id: tournament.club_id, full_name: person.name })
      .select("id")
      .single();
    if (inserted.error) fail(`Creating ${person.name}`, inserted.error);
    playerId = inserted.data.id as string;
    playerByName.set(nameKey(person.name), playerId);
    created += 1;
  }

  if (!members.has(playerId)) {
    const membership = await db.from("player_memberships").insert({
      club_id: tournament.club_id,
      player_id: playerId,
      membership_type: person.side,
    });
    if (membership.error) fail(`Membership for ${person.name}`, membership.error);
    members.add(playerId);
  }

  const record = await db.from("handicap_records").upsert(
    {
      club_id: tournament.club_id,
      player_id: playerId,
      handicap_index: 0,
      effective_date: tournament.cutoff_date,
      source: "manual",
    },
    { onConflict: "player_id,effective_date" },
  );
  if (record.error) fail(`Handicap record for ${person.name}`, record.error);

  const teePreferences: Record<string, "AM" | "PM"> = {};
  for (const [day, session] of Object.entries(person.days)) {
    const found = days.get(Number(day));
    if (found) teePreferences[found.date] = session;
  }

  const registration = await db
    .from("registrations")
    .upsert(
      {
        club_id: tournament.club_id,
        tournament_id: tournament.id,
        player_id: playerId,
        status: "needs_review",
        reasons: REASONS,
        frozen_index: 0,
        frozen_effective_date: tournament.cutoff_date,
        tee_id: tee.data.id,
        playing_handicap: 0,
        membership_type: person.side,
        answers: { teePreferences },
        source: "desk",
      },
      { onConflict: "tournament_id,player_id" },
    )
    .select("id")
    .single();
  if (registration.error) fail(`Registration for ${person.name}`, registration.error);
  const registrationId = registration.data.id as string;

  for (const session of ["AM", "PM"] as const) {
    const ids = Object.entries(person.days)
      .filter(([, value]) => value === session)
      .map(([day]) => days.get(Number(day))?.id)
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) continue;
    const saved = await db
      .from("registration_days")
      .update({ session, selected: true })
      .eq("registration_id", registrationId)
      .in("tournament_day_id", ids);
    if (saved.error) fail(`The ${session} day for ${person.name}`, saved.error);
  }

  console.log(`ok ${person.name} (${person.side}) tee ${TEE_NAME}`);
}

console.log(`\n${SEED.length} player(s): ${created} created, ${reused} reused.`);
