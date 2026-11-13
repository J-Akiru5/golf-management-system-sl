/**
 * Follow-up to apply-day2-pm-sheet.ts (13 Nov 2026). Four players on the Day 2 PM sheet already had
 * two other days, so the two-day limit blocked their Day 2 row. The owner decided which day each
 * gives up: Paduano drops Day 3 (keeps Day 4 PM), Kim In Sil drops Day 1 PM (keeps Day 4 PM), and
 * both Villanuevas drop Day 3 (keep Day 4). Their Day 2 PM row is then written from the sheet, they
 * leave the dropped day's groups, and the next pairings version is published.
 *
 *   pnpm exec tsx scripts/fix-day2-pm-day-limits.ts --apply
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const apply = process.argv.includes("--apply");
const fail = (where: string, error: { message: string } | null) => {
  if (error) throw new Error(`${where}: ${error.message}`);
};

/** The sheet's slot for Day 2 PM and the day each player gives up. */
const PLAN = [
  { name: "PADUANO, JOSEPH STEPHAN", hole: 10, drop: 3 },
  { name: "KIM, IN SIL", hole: 16, drop: 1 },
  { name: "VILLANUEVA, TONY", hole: 12, drop: 3 },
  { name: "VILLANUEVA, CARLOS", hole: 12, drop: 3 },
];

const t = (await db.from("tournaments").select("*").eq("name", "24th Bamboo Tee").single()).data;
if (!t) throw new Error("Tournament not found.");
const days = (await db.from("tournament_days").select("id,day_number").eq("tournament_id", t.id)).data ?? [];
const dayId = (n: number) => days.find((d) => d.day_number === n)?.id as string;
const rounds = (await db.from("competition_rounds").select("id,day_number").eq("tournament_id", t.id)).data ?? [];
const roundId = (n: number) => rounds.find((r) => r.day_number === n)?.id as string;

const resolved: Array<(typeof PLAN)[number] & { playerId: string; regId: string }> = [];
for (const p of PLAN) {
  const player = (await db.from("players").select("id,full_name").eq("club_id", t.club_id).eq("full_name", p.name).is("deleted_at", null).single()).data;
  if (!player) throw new Error(`${p.name} not found.`);
  const reg = (await db.from("registrations").select("id").eq("tournament_id", t.id).eq("player_id", player.id).single()).data;
  if (!reg) throw new Error(`${p.name} has no registration.`);
  const scored = (await db.from("scorecards").select("round_id").eq("player_id", player.id).eq("round_id", roundId(p.drop))).data ?? [];
  if (scored.length > 0) throw new Error(`${p.name} has a scorecard on Day ${p.drop}; not removing that day.`);
  resolved.push({ ...p, playerId: player.id as string, regId: reg.id as string });
}
console.log(resolved.map((r) => `${r.name}: drop Day ${r.drop}, Day 2 PM hole ${r.hole}`).join("\n"));
if (!apply) process.exit(0);

const pv = (await db.from("pairings_versions").select("*").eq("tournament_id", t.id).order("version", { ascending: false }).limit(1)).data?.[0];
if (!pv) throw new Error("No published version.");
const before = {
  dayRows: (await db.from("registration_days").select("*").in("registration_id", resolved.map((r) => r.regId))).data,
  members: (await db.from("group_members").select("*").in("registration_id", resolved.map((r) => r.regId))).data,
  publishedVersion: pv,
  draw_revision: t.draw_revision,
};
mkdirSync("backups", { recursive: true });
writeFileSync(join("backups", `day-limits-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify(before, null, 1));

for (const r of resolved) {
  // Free the dropped day first so the two-day limit allows Day 2.
  fail(
    `Dropping Day ${r.drop} for ${r.name}`,
    (await db.from("registration_days").update({ selected: false, session: null, tee_time: null, start_hole: null, tee_confirmed: false, wave: null }).eq("registration_id", r.regId).eq("tournament_day_id", dayId(r.drop))).error,
  );
  fail(`Leaving Day ${r.drop} groups for ${r.name}`, (await db.from("group_members").delete().eq("registration_id", r.regId).eq("round_id", roundId(r.drop))).error);
  const values = { session: "PM", selected: true, tee_time: "12:30:00", start_hole: r.hole, tee_confirmed: true, wave: "A" };
  const existing = (await db.from("registration_days").select("id").eq("registration_id", r.regId).eq("tournament_day_id", dayId(2))).data?.[0];
  if (existing) fail(`Day 2 for ${r.name}`, (await db.from("registration_days").update(values).eq("id", existing.id)).error);
  else fail(`Day 2 for ${r.name}`, (await db.from("registration_days").insert({ registration_id: r.regId, tournament_day_id: dayId(2), ...values })).error);
}

// Publish: Day 2 PM is already right; only a dropped day's group loses the player.
const snap = pv.snapshot as { groups: Array<Record<string, any>>; [k: string]: unknown };
const groups = snap.groups.map((g) => {
  const gone = resolved.filter((r) => r.drop === g.dayNumber).map((r) => r.playerId);
  const ids: string[] = g.playerIds ?? [];
  if (!ids.some((id) => gone.includes(id))) return g;
  const keep = ids.map((id, i) => ({ id, name: g.players[i] })).filter((x) => !gone.includes(x.id));
  return { ...g, players: keep.map((x) => x.name), playerIds: keep.map((x) => x.id) };
});
const version = (pv.version as number) + 1;
const at = new Date().toISOString();
const signature = groups.map((g) => `${g.dayNumber}-${g.number}:${(g.players as string[]).join(",")}`).join("|");
const snapshot = { ...snap, version, at, signature, groups };
const note = "Day 2 PM rows confirmed for Paduano, Kim In Sil and the two Villanuevas; each gave up one other day, as decided by the owner.";
fail("Publishing", (await db.from("pairings_versions").insert({ club_id: t.club_id, tournament_id: t.id, version, snapshot, note, published_at: at })).error);
fail("Updating the live snapshot", (await db.from("tournaments").update({ published: true, published_snapshot: snapshot, draw_revision: (t.draw_revision as number) + 1 }).eq("id", t.id)).error);
console.log(`Done. Published version ${version}.`);
