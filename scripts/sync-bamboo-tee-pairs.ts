/**
 * Brings the 24th Bamboo Tee pairings in line with the club's pairing sheet.
 *
 * The sheet is the record: it re-pairs three players and adds eight pairs, five of which involve the
 * players added from the sheet. This script makes exactly those changes and nothing else.
 *
 * Two groups of pairs are deliberately left alone:
 * - Pairs 7, 34, 93 and 98. The sheet lists both members as unpaired, but the two never play in the
 *   same block, so leaving them paired changes nothing on the course. The desk chose to leave them.
 * - Every pair that already matches the sheet.
 *
 * A pair with fewer than two members is removed, because the desk's own pairing screen treats a pair
 * as exactly two players. Members removed from the event earlier left a few of those behind.
 *
 *   pnpm exec tsx scripts/sync-bamboo-tee-pairs.ts --dry-run
 *   pnpm exec tsx scripts/sync-bamboo-tee-pairs.ts
 */
import { existsSync } from "node:fs";
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

/** Pairs to break because at least one member is paired differently on the sheet. */
const DISSOLVE: Array<[string, string]> = [
  ["BUÑI, GERRY", "JAVELOSA, GERARDO"],
  ["CABANAYAN, ED", "CABREROS, VICTOR"],
  ["MANGALINDAN, VICTOR", "YATCO, OSCAR"],
];

/** Pairs the sheet has that TeeLine does not. Order is member, then guest. */
const CREATE: Array<[string, string]> = [
  ["ALQUIROS, IRA", "ALINSANGAN, NEIL"],
  ["SUPERFICIAL, DENNIS", "GORRICETA, MICHAEL"],
  ["YOUN, SMITH", "DARIUS, GREGORIO"],
  ["PECINA, TIM", "VILLASIS, VEL"],
  ["ARENAS, BUNNY", "HENARES, FIDEL"],
  ["CABANAYAN, ED", "YATCO, OSCAR"],
  ["CABREROS, VICTOR", "MANGALINDAN, VICTOR"],
  ["JAVELOSA, GERARDO", "JAVELOSA, JULIO"],
];

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

const sortNames = (a: string, b: string) => [norm(a), norm(b)].sort().join(" + ");

function fail(where: string, error: { message: string } | null): never {
  throw new Error(`${where}: ${error?.message ?? "unknown error"}`);
}

const event = await db
  .from("tournaments")
  .select("id, club_id, name")
  .ilike("name", "%bamboo%")
  .order("play_date", { ascending: false })
  .limit(1)
  .maybeSingle();
if (event.error) fail("Reading the event", event.error);
if (!event.data) throw new Error("No event matching 'bamboo' was found.");
const tournament = event.data;

const regs = await db
  .from("registrations")
  .select("id, membership_type, player:players(full_name)")
  .eq("tournament_id", tournament.id);
if (regs.error) fail("Reading the registrations", regs.error);

const regByName = new Map<string, { id: string; side: string }>();
for (const row of regs.data ?? []) {
  const name = (row.player as { full_name?: string } | null)?.full_name;
  if (name) regByName.set(norm(name), { id: row.id as string, side: (row.membership_type as string) ?? "member" });
}

const pairs = await db
  .from("registration_pairs")
  .select("id, number, members:registration_pair_members(registration_id, side)")
  .eq("tournament_id", tournament.id);
if (pairs.error) fail("Reading the pairs", pairs.error);

const idToName = new Map<string, string>();
for (const [name, entry] of regByName) idToName.set(entry.id, name);

type Pair = { id: string; number: number; names: string[]; regIds: string[] };
const current: Pair[] = (pairs.data ?? []).map((row) => {
  const members = (row.members ?? []) as Array<{ registration_id: string; side: string }>;
  return {
    id: row.id as string,
    number: row.number as number,
    names: members.map((m) => idToName.get(m.registration_id) ?? "?"),
    regIds: members.map((m) => m.registration_id),
  };
});

const currentByKey = new Map<string, Pair>();
for (const pair of current) {
  if (pair.names.length === 2) currentByKey.set(sortNames(pair.names[0]!, pair.names[1]!), pair);
}

const toDrop: Pair[] = [];
for (const pair of current) {
  if (pair.names.length < 2) {
    toDrop.push(pair);
    continue;
  }
  const key = sortNames(pair.names[0]!, pair.names[1]!);
  const listed = DISSOLVE.some(([a, b]) => sortNames(a, b) === key);
  if (listed) toDrop.push(pair);
}

const toCreate = CREATE.filter(([a, b]) => !currentByKey.has(sortNames(a, b)));

for (const pair of toDrop) {
  console.log(`drop   pair ${pair.number}: ${pair.names.join(" + ") || "(empty)"}`);
}
for (const [a, b] of toCreate) {
  console.log(`create ${a} + ${b}`);
}

if (dryRun) {
  console.log(`\n${toDrop.length} pair(s) to drop, ${toCreate.length} to create. No writes made.`);
  process.exit(0);
}

for (const pair of toDrop) {
  const members = await db.from("registration_pair_members").delete().eq("pair_id", pair.id);
  if (members.error) fail(`Clearing pair ${pair.number}`, members.error);
  const removed = await db.from("registration_pairs").delete().eq("id", pair.id);
  if (removed.error) fail(`Removing pair ${pair.number}`, removed.error);
}

let next = Math.max(0, ...current.map((pair) => pair.number)) + 1;

for (const [first, second] of toCreate) {
  const a = regByName.get(norm(first));
  const b = regByName.get(norm(second));
  if (!a || !b) {
    throw new Error(`Both players must be registered: ${first} / ${second}`);
  }
  // The pair trigger insists the two sides are one member and one guest, so the side comes from the
  // registration itself rather than from the order the names were written in this file.
  const member = a.side === "member" ? a : b.side === "member" ? b : null;
  const guest = a.side === "guest" ? a : b.side === "guest" ? b : null;
  if (!member || !guest) {
    console.log(`skip ${first} + ${second}: both are recorded as the same side`);
    continue;
  }
  const inserted = await db
    .from("registration_pairs")
    .insert({ club_id: tournament.club_id, tournament_id: tournament.id, number: next })
    .select("id")
    .single();
  if (inserted.error) fail(`Creating pair ${next}`, inserted.error);
  const pairId = inserted.data.id as string;
  const members = await db.from("registration_pair_members").insert([
    { club_id: tournament.club_id, pair_id: pairId, registration_id: member.id, side: "member" },
    { club_id: tournament.club_id, pair_id: pairId, registration_id: guest.id, side: "guest" },
  ]);
  if (members.error) fail(`Adding members to pair ${next}`, members.error);
  console.log(`ok pair ${next}: ${first} + ${second}`);
  next += 1;
}

console.log(`\n${toDrop.length} pair(s) dropped, ${toCreate.length} created.`);
