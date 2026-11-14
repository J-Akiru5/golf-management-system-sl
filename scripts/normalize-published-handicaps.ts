/**
 * Normalizes the playing handicap on every published card of Days 1 to 3 to the owner's rule
 * (14 Nov 2026):
 *   - The playing handicap is the WHS one: index (capped at the event maximum) x slope / 113 +
 *     course rating - par, rounded half up, times the round allowance. It always wins over the number
 *     written on the card.
 *   - The tee is the letter written on the card (B Blue, W White, L Ladies/Red); the registration tee
 *     only when the card has no letter.
 *   - No index on file, or 0, means index 0. Those players are listed for the admin to double-check.
 * Each card is recalculated from its own published holes (gross never changes, a pick-up stays 0
 * points), the player's current round_results row gets the new net, and a new version is published
 * per day where anything changed. Frozen handicap_snapshots are not touched (the database refuses it).
 *
 *   pnpm exec tsx scripts/normalize-published-handicaps.ts            plan
 *   pnpm exec tsx scripts/normalize-published-handicaps.ts --apply    write and publish
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

process.loadEnvFile(".env.local");
const APPLY = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
type Row = Record<string, any>;
const TOURN = "1f0d98d4-e5c8-4929-bca9-2920c1a74cbb";
const DL = "C:/Users/Lenovo/Downloads/";
const must = <T,>(r: { data: T | null; error: { message: string } | null }, w: string): T => {
  if (r.error) throw new Error(`${w}: ${r.error.message}`);
  return r.data as T;
};

const t = must(await db.from("tournaments").select("id,max_index").eq("id", TOURN).single(), "tournament") as Row;
const maxIndex = t.max_index == null ? null : Number(t.max_index);
const tees = must(await db.from("tees").select("id,name,course_rating,slope,par"), "tees") as Row[];
const teeByLetter: Record<string, Row | undefined> = {
  B: tees.find((x) => /blue/i.test(x.name)),
  W: tees.find((x) => /white/i.test(x.name)),
  L: tees.find((x) => /red|lad/i.test(x.name)),
};
for (const [k, v] of Object.entries(teeByLetter)) if (!v) throw new Error(`no tee for letter ${k}: ${tees.map((x) => x.name).join(", ")}`);
const teeById = new Map(tees.map((x) => [x.id, x]));
const regs = must(await db.from("registrations").select("id,player_id,frozen_index,tee_id").eq("tournament_id", TOURN).limit(2000), "regs") as Row[];
const regOf = new Map(regs.map((r) => [r.player_id, r]));
const players = must(await db.from("players").select("id,full_name").limit(5000), "players") as Row[];
const nameOf = new Map(players.map((p) => [p.id, p.full_name as string]));
const rounds = must(await db.from("competition_rounds").select("id,day_number,allowance,handicap_rounding,club_id").eq("tournament_id", TOURN).in("day_number", [1, 2, 3]).order("day_number"), "rounds") as Row[];

// Card tee letters, by day and player name.
const letters = new Map<number, Map<string, string>>();
const addFile = (day: number, file: string) => {
  const j = JSON.parse(readFileSync(DL + file, "utf8"));
  const m = letters.get(day) ?? new Map<string, string>();
  for (const c of j.cards) if (c.name && /^[BWL]$/.test(String(c.tee ?? ""))) m.set(String(c.name).trim().toUpperCase(), c.tee);
  letters.set(day, m);
};
addFile(1, "day1am-scores-final.json");
addFile(1, "day1pm-scores-final.json");
addFile(2, "DAY 2 AM FINAL.json");
addFile(2, "Day 2 PM final.json");
{
  const s = await db.storage.from("scorecard-documents").createSignedUrl("day1am-r5.json", 60);
  const j = await (await fetch(s.data!.signedUrl + "&t=" + Date.now(), { cache: "no-store" })).json();
  const m = new Map<string, string>();
  for (const c of j.payload.cards) if (String(c.day) === "3" && c.name && /^[BWL]$/.test(String(c.tee ?? ""))) m.set(String(c.name).trim().toUpperCase(), c.tee);
  letters.set(3, m);
}

const playingFor = (index: number, tee: Row, allowance: number, rounding: string) => {
  const used = maxIndex == null ? index : Math.min(index, maxIndex);
  const raw = used * (Number(tee.slope) / 113) + (Number(tee.course_rating) - Number(tee.par));
  const course = Math.floor(raw + 0.5);
  const playing = rounding === "whs" ? Math.floor(course * allowance + 0.5) : Math.floor(raw * allowance + 0.5);
  return { course, playing };
};
const strokesOn = (playing: number, si: number, holes = 18) => {
  const base = Math.trunc(playing / holes);
  const rem = playing - base * holes;
  return base + (rem > 0 && si <= rem ? 1 : rem < 0 && si > holes + rem ? -1 : 0);
};

const backup: Row = {};
const flaggedZero = new Map<string, string[]>();
const teeOverrides: string[] = [];
const publishes: Row[] = [];
const decisions: Row[] = [];
const heldZero: string[] = [];
for (const rd of rounds) {
  const latest = (must(await db.from("round_publications").select("*").eq("round_id", rd.id).order("version", { ascending: false }).limit(1), "pub") as Row[])[0];
  if (!latest) continue;
  backup[rd.day_number] = latest;
  const snap = latest.snapshot;
  const lm = letters.get(rd.day_number) ?? new Map();
  const changes: Row[] = [];
  const noHoles: string[] = [];
  let letterUsed = 0, regTeeUsed = 0, noTee = 0, same = 0, otherDayLetter = 0;
  for (const card of snap.cards as Row[]) {
    const reg = regOf.get(card.playerId);
    const name = String(card.playerName ?? nameOf.get(card.playerId) ?? "").toUpperCase();
    const own = lm.get(name);
    const other = own ? undefined : [1, 2, 3].map((d) => letters.get(d)?.get(name)).find(Boolean);
    // The owner's own word on a player's tee wins over the card letter (14 Nov: Alcaraz and Villa play White).
    const OWNER_TEE: Record<string, string> = { "ALCARAZ, FERDINAND": "W", "VILLA, RENE": "W" };
    const letter = OWNER_TEE[name] ?? own ?? other;
    if (!own && other) otherDayLetter++;
    const tee = letter ? teeByLetter[letter] : reg ? teeById.get(reg.tee_id) : undefined;
    if (letter) letterUsed++; else if (tee) regTeeUsed++;
    if (!tee) { noTee++; continue; }
    if (letter && reg && teeById.get(reg.tee_id)?.id !== tee.id) teeOverrides.push(`Day ${rd.day_number} ${name}: card ${letter}, registration ${teeById.get(reg.tee_id)?.name ?? "none"}`);
    const idx = reg?.frozen_index == null ? 0 : Number(reg.frozen_index);
    if (!reg || reg.frozen_index == null || Number(reg.frozen_index) === 0) flaggedZero.set(name, [...(flaggedZero.get(name) ?? []), `Day ${rd.day_number}`]);
    // Index 0 or none: held at the published card until the admin double-checks it against WHS (owner, 14 Nov).
    if (!reg || reg.frozen_index == null || Number(reg.frozen_index) === 0) { heldZero.push(`Day ${rd.day_number} ${name} (plays off ${card.playingHandicap ?? "-"} now)`); continue; }
    const { course, playing } = playingFor(idx, tee, Number(rd.allowance), rd.handicap_rounding);
    decisions.push({ round: rd, playerId: card.playerId, regId: reg.id, name, tee, used: maxIndex == null ? idx : Math.min(idx, maxIndex), course, playing });
    if (!Array.isArray(card.holes) || card.holes.length !== 18) { noHoles.push(name); continue; }
    if (card.playingHandicap === playing && card.holes.every((h: Row) => h.handicapStrokes === strokesOn(playing, h.strokeIndex))) { same++; continue; }
    const holes = card.holes.map((h: Row) => {
      const given = strokesOn(playing, h.strokeIndex);
      if (h.pickedUp || h.grossStrokes == null) return { ...h, handicapStrokes: given, netStrokes: null, netPoints: 0 };
      const net = h.grossStrokes - given;
      return { ...h, handicapStrokes: given, netStrokes: net, netPoints: Math.max(0, 2 + h.par - net) };
    });
    const netPoints = holes.reduce((s: number, h: Row) => s + h.netPoints, 0);
    const pickups = holes.filter((h: Row) => h.pickedUp).length;
    const netStrokes = pickups > 0 || holes.some((h: Row) => h.grossStrokes == null) ? null : holes.reduce((s: number, h: Row) => s + (h.netStrokes ?? 0), 0);
    changes.push({ playerId: card.playerId, name, from: card.playingHandicap, to: playing, tee: tee.name, idx, netFrom: card.netPoints, netTo: netPoints, card: { ...card, holes, netPoints, netStrokes, courseHandicap: course, playingHandicap: playing } });
  }
  console.log(`\nDay ${rd.day_number} (v${latest.version}, ${snap.cards.length} cards): change ${changes.length}, already right ${same}; tee from card letter ${letterUsed} (${otherDayLetter} from the same player's card on another day), from registration ${regTeeUsed}, no tee ${noTee}; cards without 18 holes ${noHoles.length}${noHoles.length ? ` (${noHoles.join("; ")})` : ""}`);
  for (const c of changes) console.log(`  ${c.name.padEnd(30)} idx ${String(c.idx).padStart(4)} ${String(c.tee).padEnd(6)} PH ${String(c.from).padStart(3)} -> ${String(c.to).padStart(3)}   net pts ${c.netFrom} -> ${c.netTo}`);
  if (changes.length) publishes.push({ rd, latest, snap, changes });
}
console.log(`\nTee letter on the card differs from the registration tee (${teeOverrides.length}):\n  ${teeOverrides.join("\n  ") || "none"}`);
console.log(`\nNo index on file or 0, scored as index 0; admin to double-check against WHS (${flaggedZero.size}):\n  ${[...flaggedZero].map(([n, d]) => `${n} (${d.join(", ")})`).join("\n  ") || "none"}`);

console.log(`
Held at the published card (index 0 or none): ${heldZero.length}`);
if (process.argv.includes("--sql")) {
  const lines: string[] = ["-- Aligns the frozen handicap snapshots of Days 1 to 3 with the published cards (owner's WHS rule, 14 Nov 2026).", "-- Run once, as a whole, in the Supabase SQL editor. Players with index 0 or none are not touched.", "begin;", "select set_config('teeline.allow_frozen_snapshot', 'on', true);"];
  let upd = 0, ins = 0;
  for (const dRound of rounds) {
    const ents = must(await db.from("round_entries").select("id,registration_id").eq("round_id", dRound.id).limit(2000), "entries") as Row[];
    const snaps = must(await db.from("handicap_snapshots").select("round_entry_id,playing_handicap,course_handicap,tee_id,handicap_index").eq("round_id", dRound.id).limit(2000), "snaps") as Row[];
    const full = must(await db.from("competition_rounds").select("play_date,rules_version").eq("id", dRound.id).single(), "round") as Row;
    for (const x of decisions.filter((q) => q.round.id === dRound.id)) {
      const e = ents.find((q) => q.registration_id === x.regId);
      if (!e) continue;
      const sn = snaps.find((q) => q.round_entry_id === e.id);
      const vals = { handicap_index: x.used, tee_id: x.tee.id, course_rating: x.tee.course_rating, slope: x.tee.slope, course_par: x.tee.par, course_handicap: x.course, playing_handicap: x.playing };
      if (sn) {
        if (sn.playing_handicap === x.playing && sn.course_handicap === x.course && sn.tee_id === x.tee.id && Number(sn.handicap_index) === x.used) continue;
        lines.push("update public.handicap_snapshots set handicap_index = " + x.used + ", tee_id = '" + x.tee.id + "', course_rating = " + x.tee.course_rating + ", slope = " + x.tee.slope + ", course_par = " + x.tee.par + ", course_handicap = " + x.course + ", playing_handicap = " + x.playing + " where round_entry_id = '" + e.id + "'; -- Day " + dRound.day_number + " " + x.name.replace(/'/g, "") );
        upd++;
      } else {
        lines.push("insert into public.handicap_snapshots (club_id, round_id, round_entry_id, handicap_index, index_source, index_effective_date, tee_id, course_rating, slope, course_par, allowance, rounding, course_handicap, playing_handicap, rules_version) values ('" + dRound.club_id + "', '" + dRound.id + "', '" + e.id + "', " + x.used + ", 'Registration freeze', '" + full.play_date + "', '" + x.tee.id + "', " + x.tee.course_rating + ", " + x.tee.slope + ", " + x.tee.par + ", " + Number(dRound.allowance) + ", '" + dRound.handicap_rounding + "', " + x.course + ", " + x.playing + ", '" + (full.rules_version ?? "unconfirmed") + "'); -- Day " + dRound.day_number + " " + x.name.replace(/'/g, ""));
        ins++;
      }
    }
    lines.push("insert into public.scoring_audit (club_id, round_id, entity, entity_id, action, reason) values ('" + dRound.club_id + "', '" + dRound.id + "', 'round', '" + dRound.id + "', 'handicap_snapshots_aligned', 'Snapshots aligned with the published cards: WHS playing handicap for the card tee, owner 14 Nov 2026.');");
  }
  lines.push("select set_config('teeline.allow_frozen_snapshot', 'off', true);", "commit;");
  writeFileSync(".tmp/run-migration/align-handicap-snapshots.sql", lines.join(String.fromCharCode(10)) + String.fromCharCode(10));
  console.log("SQL written: " + upd + " updates, " + ins + " inserts");
  process.exit(0);
}
if (!APPLY) process.exit(0);
mkdirSync("backups", { recursive: true });
writeFileSync(`backups/normalize-ph-before-${Date.now()}.json`, JSON.stringify(backup));
for (const p of publishes) {
  const { rd, latest, snap, changes } = p;
  for (const c of changes) {
    const r = await db.from("round_results").update({ net_points: c.card.netPoints, net_strokes: c.card.netStrokes }).eq("round_id", rd.id).eq("player_id", c.playerId).is("superseded_at", null);
    if (r.error) throw new Error(`result ${c.name}: ${r.error.message}`);
  }
  const byId = new Map<string, Row>(changes.map((c: Row) => [c.playerId, c.card]));
  const cards = (snap.cards as Row[]).map((c) => byId.get(c.playerId) ?? c);
  const net = (snap.net as Row[]).map((n) => { const c = byId.get(n.playerId); return c ? { ...n, points: c.netPoints, strokes: c.netStrokes } : n; }).sort((a, b) => Number(b.points) - Number(a.points));
  const version = latest.version + 1;
  const at = new Date().toISOString();
  const note = `Playing handicap normalized to the WHS figure for each player's tee (card tee letter, else registration tee; no index counts as 0), owner 14 Nov 2026. ${changes.length} cards recalculated.`;
  const ins = await db.from("round_publications").insert({ club_id: rd.club_id, round_id: rd.id, version, state: latest.state, snapshot: { ...snap, version, publishedAt: at, cards, net }, published_by: latest.published_by, published_at: at, note });
  if (ins.error) throw new Error(`publish Day ${rd.day_number}: ${ins.error.message}`);
  console.log(`PUBLISHED Day ${rd.day_number} v${version} (${changes.length} cards)`);
}
