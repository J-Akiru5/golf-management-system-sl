/**
 * Corrects the playing handicap two Day 3 cards were scored with, then publishes the next version of
 * that round (14 Nov 2026).
 *
 * The Day 3 cards were loaded with the handicap written on each paper card. Ferdinand Alcaraz and
 * Rene Villa had none written, so they were scored with 0 strokes. The owner gave their indexes
 * (19.2 and 22.4) and said both play from the White tee. This script:
 *   - works out course and playing handicap from the White tee (index x slope / 113 + rating - par,
 *     rounded the WHS way, at the round's allowance),
 *   - recalculates each card hole by hole (strokes by stroke index, net points = 2 + par - net, a
 *     pick-up is 0 points) and the player's net row in the net list,
 *   - updates the player's current `round_results` row, and
 *   - publishes the next `round_publications` version, the same way version 3 did for Mark Leviste.
 *
 * Gross points and strokes never change. The registrations were moved to White by the caller before
 * this ran.
 *
 *   pnpm exec tsx scripts/correct-day3-handicaps.ts            plan only
 *   pnpm exec tsx scripts/correct-day3-handicaps.ts --apply    write, after a backup
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const apply = process.argv.includes("--apply");

const ROUND = "7d74d5ac-9595-4fe0-9785-c59ec99e79b8";
const WHITE_TEE = "acc66759-4379-42af-84de-a054c5e7cf11";
const PLAN = [
  { playerId: "6f472374-4347-4f8c-b6cf-e9dc3c430e4a", index: 19.2 },
  { playerId: "dcebb6f7-ce2d-477d-b8ce-53a6abbbb2e2", index: 22.4 },
];

interface Hole {
  par: number;
  hole: number;
  strokeIndex: number;
  grossStrokes: number | null;
  grossPoints: number;
  netStrokes: number | null;
  netPoints: number;
  handicapStrokes: number;
  pickedUp?: boolean;
}
interface Card {
  playerId: string;
  playerName: string;
  holes: Hole[];
  pickups: number;
  netPoints: number;
  netStrokes: number | null;
  courseHandicap: number;
  playingHandicap: number;
  [k: string]: unknown;
}
interface NetRow {
  playerId: string;
  points: number;
  pickups: number;
  strokes: number | null;
  [k: string]: unknown;
}

const tee = (await db.from("tees").select("name,course_rating,slope,par").eq("id", WHITE_TEE).single()).data;
if (!tee) throw new Error("White tee not found.");
const round = (await db.from("competition_rounds").select("club_id,allowance,handicap_rounding,status").eq("id", ROUND).single()).data;
if (!round) throw new Error("Round not found.");
if (round.status === "final") throw new Error("The round is final; it cannot be corrected.");
const maxIndex = Number((await db.from("tournaments").select("max_index").eq("id", "1f0d98d4-e5c8-4929-bca9-2920c1a74cbb").single()).data?.max_index ?? 54);

const pubs = (await db.from("round_publications").select("*").eq("round_id", ROUND).order("version", { ascending: false })).data ?? [];
const latest = pubs[0];
if (!latest) throw new Error("No publication to build on.");
const snap = latest.snapshot as { cards: Card[]; net: NetRow[]; [k: string]: unknown };

/** Strokes a hole gives at a playing handicap, over 18 holes (the same rule as public.handicap_strokes). */
const strokesOn = (playing: number, strokeIndex: number) => Math.floor(playing / 18) + (strokeIndex <= playing % 18 ? 1 : 0);

function recalc(card: Card, index: number): { card: Card; course: number; playing: number } {
  const raw = Math.min(index, maxIndex) * (Number(tee?.slope) / 113) + (Number(tee?.course_rating) - Number(tee?.par));
  const course = Math.floor(raw + 0.5);
  const playing = round?.handicap_rounding === "whs" ? Math.floor(course * Number(round.allowance) + 0.5) : Math.floor(raw * Number(round?.allowance) + 0.5);
  const holes = card.holes.map((h) => {
    const given = strokesOn(playing, h.strokeIndex);
    if (h.pickedUp || h.grossStrokes === null) return { ...h, handicapStrokes: given, netStrokes: null, netPoints: 0 };
    const net = h.grossStrokes - given;
    return { ...h, handicapStrokes: given, netStrokes: net, netPoints: Math.max(0, 2 + h.par - net) };
  });
  const netPoints = holes.reduce((sum, h) => sum + h.netPoints, 0);
  const pickups = holes.filter((h) => h.pickedUp).length;
  const netStrokes = pickups > 0 ? null : holes.reduce((sum, h) => sum + (h.netStrokes ?? 0), 0);
  return { card: { ...card, holes, netPoints, netStrokes, courseHandicap: course, playingHandicap: playing }, course, playing };
}

const changes = PLAN.map((p) => {
  const card = snap.cards.find((c) => c.playerId === p.playerId);
  if (!card) throw new Error(`No published card for ${p.playerId}.`);
  const out = recalc(card, p.index);
  console.log(
    `${card.playerName}: index ${p.index} on ${tee.name} -> course ${out.course}, playing ${out.playing}; net points ${card.netPoints} -> ${out.card.netPoints}; gross points ${card.grossPoints} unchanged; pick-ups ${card.pickups}`,
  );
  return { ...p, before: card, after: out.card };
});

const nextNet = snap.net.filter((n) => !changes.some((c) => c.playerId === n.playerId));
for (const c of changes) {
  const old = snap.net.find((n) => n.playerId === c.playerId);
  if (!old) throw new Error(`${c.playerId} is not in the net list.`);
  const entry = { ...old, points: c.after.netPoints, strokes: c.after.netStrokes, pickups: c.after.pickups };
  const at = nextNet.findIndex((n) => n.points < entry.points);
  nextNet.splice(at < 0 ? nextNet.length : at, 0, entry);
}

if (!apply) {
  console.log(`\nPlan only. Would publish version ${latest.version + 1}. Run with --apply to write.`);
  process.exit(0);
}

mkdirSync("backups", { recursive: true });
const results = (await db.from("round_results").select("*").eq("round_id", ROUND).in("player_id", PLAN.map((p) => p.playerId)).is("superseded_at", null)).data;
writeFileSync(join("backups", `day3-handicap-before-${Date.now()}.json`), JSON.stringify({ latestVersion: latest, results }, null, 1));

for (const c of changes) {
  const r = await db.from("round_results").update({ net_points: c.after.netPoints, net_strokes: c.after.netStrokes }).eq("round_id", ROUND).eq("player_id", c.playerId).is("superseded_at", null);
  if (r.error) throw new Error(`round_results for ${c.after.playerName}: ${r.error.message}`);
}
const version = latest.version + 1;
const at = new Date().toISOString();
const cards = snap.cards.map((card) => changes.find((c) => c.playerId === card.playerId)?.after ?? card);
const note = "Alcaraz, Ferdinand (index 19.2) and Villa, Rene (index 22.4): White tee, playing handicap 19 and 23; their cards are recalculated.";
const published = await db
  .from("round_publications")
  .insert({ club_id: round.club_id, round_id: ROUND, version, state: latest.state, snapshot: { ...snap, version, publishedAt: at, cards, net: nextNet }, published_by: latest.published_by, published_at: at, note });
if (published.error) throw new Error(`Publishing: ${published.error.message}`);
console.log(`\nDone. Published version ${version}.`);
