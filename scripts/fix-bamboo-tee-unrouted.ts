/**
 * Completes three registrations the owner gave explicit instructions for.
 *
 * These three were marked `ok` but had no tee, no category and no flight, and were the only players
 * left unpaired, so they could not enter a draw.
 *
 * Owner's instruction:
 * - TAKAYUKI KOZONO plays the Silver tee.
 * - MARK PAUIG has no handicap on file; the index is recorded as 0.
 * - VICTOR LEX JR BERMEJO has no handicap on file; the index is recorded as 0.
 * - MARK PAUIG and VICTOR default to the Blue tee.
 * - TAKAYUKI KOZONO's pair is MARK PAUIG.
 *
 * The playing handicap is recalculated from the tee with the event's own allowance rather than
 * typed in, so it cannot disagree with the rest of the field.
 *
 *   pnpm exec tsx scripts/fix-bamboo-tee-unrouted.ts --dry-run
 *   pnpm exec tsx scripts/fix-bamboo-tee-unrouted.ts
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

/** Tee by name, and the index to freeze (null keeps the index already on file). */
const PLAN: Array<{ name: string; tee: string; index: number | null }> = [
  { name: "TAKAYUKI KOZONO", tee: "Silver", index: null },
  { name: "MARK PAUIG", tee: "Blue", index: 0 },
  { name: "VICTOR LEX JR BERMEJO", tee: "Blue", index: 0 },
];

/** The pair the owner named, in the order the two players appear on the sheet. */
const PAIR: [string, string] = ["TAKAYUKI KOZONO", "MARK PAUIG"];

const norm = (s: string) => s.normalize("NFKD").replace(/\s+/g, " ").trim().toUpperCase();

/** WHS course handicap with the allowance applied, rounded once at the end. */
function playingHandicap(index: number, tee: { slope: number; courseRating: number; par: number }, allowance: number) {
  const raw = index * (tee.slope / 113) + (tee.courseRating - tee.par);
  return Math.round(raw * allowance);
}

function fail(where: string, error: { message: string } | null): never {
  throw new Error(`${where}: ${error?.message ?? "unknown error"}`);
}

const event = await db
  .from("tournaments")
  .select("id, club_id, course_id, name, cutoff_date, allowance")
  .ilike("name", "%bamboo%")
  .order("play_date", { ascending: false })
  .limit(1)
  .maybeSingle();
if (event.error) fail("Reading the event", event.error);
if (!event.data) throw new Error("No event matching 'bamboo' was found.");
const tournament = event.data;
// Stored as a fraction: 1.000 is a 100% allowance.
const allowance = Number(tournament.allowance ?? 1);

const tees = await db
  .from("tees")
  .select("id, name, slope, course_rating, par")
  .eq("club_id", tournament.club_id)
  .eq("course_id", tournament.course_id);
if (tees.error) fail("Reading the tees", tees.error);
const teeByName = new Map((tees.data ?? []).map((t) => [String(t.name), t]));

const regs = await db
  .from("registrations")
  .select("id, player_id, membership_type, frozen_index, player:players(full_name)")
  .eq("tournament_id", tournament.id);
if (regs.error) fail("Reading the registrations", regs.error);
const regByName = new Map(
  (regs.data ?? []).map((r) => {
    const player = r.player as unknown as { full_name?: string } | null;
    return [norm(player?.full_name ?? ""), r] as const;
  }),
);

for (const item of PLAN) {
  const reg = regByName.get(norm(item.name));
  if (!reg) throw new Error(`${item.name} is not registered in this event.`);
  const tee = teeByName.get(item.tee);
  if (!tee) throw new Error(`No ${item.tee} tee exists for this course.`);
  const index = item.index ?? Number(reg.frozen_index);
  const ph = playingHandicap(index, {
    slope: Number(tee.slope),
    courseRating: Number(tee.course_rating),
    par: Number(tee.par),
  }, allowance);
  console.log(`${item.name}: ${item.tee} tee, index ${index}, playing handicap ${ph}`);
}

if (dryRun) {
  console.log(`\nWould pair ${PAIR[0]} with ${PAIR[1]}. No writes made.`);
  process.exit(0);
}

for (const item of PLAN) {
  const reg = regByName.get(norm(item.name))!;
  const tee = teeByName.get(item.tee)!;
  const index = item.index ?? Number(reg.frozen_index);

  if (item.index !== null) {
    const record = await db.from("handicap_records").upsert(
      {
        club_id: tournament.club_id,
        player_id: reg.player_id as string,
        handicap_index: item.index,
        effective_date: tournament.cutoff_date,
        source: "manual",
      },
      { onConflict: "player_id,effective_date" },
    );
    if (record.error) fail(`Handicap record for ${item.name}`, record.error);
  }

  const patch = await db
    .from("registrations")
    .update({
      tee_id: tee.id,
      frozen_index: index,
      frozen_effective_date: tournament.cutoff_date,
      frozen_at: new Date().toISOString(),
      playing_handicap: playingHandicap(
        index,
        { slope: Number(tee.slope), courseRating: Number(tee.course_rating), par: Number(tee.par) },
        allowance,
      ),
    })
    .eq("id", reg.id);
  if (patch.error) fail(`Updating ${item.name}`, patch.error);
  console.log(`ok ${item.name}`);
}

const a = regByName.get(norm(PAIR[0]));
const b = regByName.get(norm(PAIR[1]));
if (!a || !b) throw new Error("Both players in the pair must be registered.");

const existing = await db
  .from("registration_pair_members")
  .select("registration_id")
  .in("registration_id", [a.id, b.id]);
if (existing.error) fail("Reading the pair members", existing.error);

if ((existing.data ?? []).length > 0) {
  console.log(`pair already set for ${PAIR[0]} / ${PAIR[1]}`);
} else {
  const top = await db
    .from("registration_pairs")
    .select("number")
    .eq("tournament_id", tournament.id)
    .order("number", { ascending: false })
    .limit(1);
  if (top.error) fail("Reading the highest pair number", top.error);
  const number = Number(top.data?.[0]?.number ?? 0) + 1;

  const member = a.membership_type === "member" ? a : b;
  const guest = member === a ? b : a;
  const created = await db
    .from("registration_pairs")
    .insert({ club_id: tournament.club_id, tournament_id: tournament.id, number })
    .select("id")
    .single();
  if (created.error) fail(`Creating pair ${number}`, created.error);
  const members = await db.from("registration_pair_members").insert([
    { club_id: tournament.club_id, pair_id: created.data.id, registration_id: member.id, side: "member" },
    { club_id: tournament.club_id, pair_id: created.data.id, registration_id: guest.id, side: "guest" },
  ]);
  if (members.error) fail(`Adding members to pair ${number}`, members.error);
  console.log(`ok pair ${number}: ${PAIR[0]} + ${PAIR[1]}`);
}
