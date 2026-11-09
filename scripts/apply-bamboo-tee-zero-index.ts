/**
 * Records a handicap index of 0 for every registration that has none, at the owner's instruction.
 *
 * Some of these players have an official NGAP record dated at the cut-off that says "NH" (no
 * handicap); for those, the 0 replaces that record rather than sitting beside it, because the import
 * this mirrors is keyed on (player, effective date). The owner was told this and chose 0.
 *
 * Behaviour on the course does not change: the routing engine already reads a missing index as 0
 * (`index ?? 0`). This makes the stored number match what the draw already uses, and stops the desk
 * from seeing a blank where a 0 was intended.
 *
 * The playing handicap is recalculated from the player's own tee. A player with no tee cannot have
 * one calculated, so it is left empty and reported.
 *
 *   pnpm exec tsx scripts/apply-bamboo-tee-zero-index.ts --dry-run
 *   pnpm exec tsx scripts/apply-bamboo-tee-zero-index.ts
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

function fail(where: string, error: { message: string } | null): never {
  throw new Error(`${where}: ${error?.message ?? "unknown error"}`);
}

const event = await db
  .from("tournaments")
  .select("id, club_id, name, cutoff_date, allowance")
  .ilike("name", "%bamboo%")
  .order("play_date", { ascending: false })
  .limit(1)
  .maybeSingle();
if (event.error) fail("Reading the event", event.error);
if (!event.data) throw new Error("No event matching 'bamboo' was found.");
const tournament = event.data;
const allowance = Number(tournament.allowance ?? 1);

const tees = await db
  .from("tees")
  .select("id, name, slope, course_rating, par")
  .eq("club_id", tournament.club_id);
if (tees.error) fail("Reading the tees", tees.error);
const teeById = new Map((tees.data ?? []).map((t) => [t.id as string, t]));

// PostgREST returns at most 1000 rows per response, so the field is read in pages.
async function allRegistrations() {
  const out: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += 1000) {
    const page = await db
      .from("registrations")
      .select("id, player_id, tee_id, frozen_index, status, player:players(full_name)")
      .eq("tournament_id", tournament.id)
      .order("id")
      .range(from, from + 999);
    if (page.error) fail("Reading the registrations", page.error);
    out.push(...(page.data ?? []));
    if ((page.data ?? []).length < 1000) return out;
  }
}

const regs = await allRegistrations();
const missing = regs.filter((r) => r.frozen_index === null);

console.log(`${regs.length} registration(s), ${missing.length} with no index on file.`);

if (dryRun) {
  const noTee = missing.filter((r) => !r.tee_id).length;
  console.log(`Would record index 0 for ${missing.length}; ${noTee} of them have no tee, so their playing handicap stays empty.`);
  process.exit(0);
}

let done = 0;
let noTee = 0;

for (const reg of missing) {
  const record = await db
    .from("handicap_records")
    .upsert(
      {
        club_id: tournament.club_id,
        player_id: reg.player_id as string,
        handicap_index: 0,
        effective_date: tournament.cutoff_date,
        source: "manual",
      },
      { onConflict: "player_id,effective_date" },
    )
    .select("id")
    .single();
  if (record.error) fail(`Handicap record for ${(reg.player as { full_name: string }).full_name}`, record.error);

  const tee = reg.tee_id ? teeById.get(reg.tee_id as string) : null;
  let playingHandicap: number | null = null;
  if (tee) {
    const raw =
      0 * (Number(tee.slope) / 113) + (Number(tee.course_rating) - Number(tee.par));
    playingHandicap = Math.round(raw * allowance);
  } else {
    noTee += 1;
  }

  const patch = await db
    .from("registrations")
    .update({
      frozen_index: 0,
      frozen_record_id: record.data.id,
      frozen_effective_date: tournament.cutoff_date,
      frozen_at: new Date().toISOString(),
      playing_handicap: playingHandicap,
    })
    .eq("id", reg.id as string);
  if (patch.error) fail(`Updating ${(reg.player as { full_name: string }).full_name}`, patch.error);
  done += 1;
  if (done % 10 === 0) console.log(`  ${done}/${missing.length}`);
}

console.log(`\n${done} registration(s) set to index 0. ${noTee} left without a playing handicap because they have no tee.`);
