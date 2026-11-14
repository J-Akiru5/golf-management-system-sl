/**
 * Recalculates the published rounds of the 24th Bamboo Tee with the system's playing handicap and
 * republishes them as a new provisional version.
 *
 * The system formula: Handicap Index (capped at the event's maximum) -> course handicap
 * (index x slope / 113 + rating - par, rounded) -> allowance -> playing handicap. It is the same
 * arithmetic as `save_handicap_snapshot` in the database.
 *
 * What it does, per round:
 *   - works out each entered player's playing handicap from the registration's frozen index and tee;
 *   - a round entry with no snapshot gets one (an INSERT; the database only freezes UPDATE/DELETE);
 *   - a round entry whose frozen snapshot already equals the formula is recalculated as it stands;
 *   - a frozen snapshot that differs from the formula is NOT touched (the database refuses it once
 *     scoring has started) and is reported, as is a player with no usable index or tee;
 *   - recalculates the net result through the database's own `recalculate_player_results`;
 *   - checks every recalculated result against an independent calculation before publishing;
 *   - builds the next publication with the database's `build_round_snapshot`, carries the previous
 *     card over unchanged for every player that was not recalculated, and inserts it as a new version.
 *     Earlier versions stay.
 *
 *   node scripts/recalc-published-handicaps.mjs --env <path to .env.local>            plan only
 *   node scripts/recalc-published-handicaps.mjs --env <path to .env.local> --apply    write
 *   add --rounds 2,3 to limit either mode to some days
 *
 * Plain Node, no dependencies. Writes a backup to backups/ before the first change.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const envPath = argv[argv.indexOf("--env") + 1];
if (!envPath) throw new Error("Pass --env <path to .env.local>.");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest(method, path, body, prefer) {
  let res;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(`${URL_}/rest/v1/${path}`, {
        method,
        headers: { ...H, ...(prefer ? { Prefer: prefer } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      break;
    } catch (error) {
      // A connection that was never made is always retried, so a write can never be sent twice.
      // A reset mid-request is retried only for reads and the recalculation, which is safe to repeat.
      const neverConnected = error?.cause?.code === "UND_ERR_CONNECT_TIMEOUT";
      const repeatable = method === "GET" || path.startsWith("rpc/recalculate_player_results");
      if (!(neverConnected || repeatable) || attempt >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}
const get = (p) => rest("GET", p);
async function getAll(p) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const page = await get(`${p}${p.includes("?") ? "&" : "?"}limit=1000&offset=${off}`);
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

// ---- the formula (mirrors save_handicap_snapshot and handicap_strokes) -------------------------
const roundHalfUp = (x) => Math.floor(x + 0.5);
function playingHandicapFor(index, tee, allowance, rounding, maxIndex) {
  const used = maxIndex == null ? index : Math.min(index, maxIndex);
  const raw = used * (tee.slope / 113) + (tee.course_rating - tee.par);
  const course = roundHalfUp(raw);
  const playing = rounding === "whs" ? roundHalfUp(course * allowance) : roundHalfUp(raw * allowance);
  return { used, course, playing };
}
function strokesOnHole(playing, strokeIndex, holes) {
  const base = Math.trunc(playing / holes);
  const rem = playing - base * holes;
  return base + (rem > 0 && strokeIndex <= rem ? 1 : rem < 0 && strokeIndex > holes + rem ? -1 : 0);
}
function netFor(scores, holeDefs, playing) {
  let points = 0;
  let strokes = 0;
  for (const s of scores) {
    const h = holeDefs.get(s.hole_number);
    if (!h || s.picked_up) continue;
    const got = strokesOnHole(playing, h.stroke_index, holeDefs.size);
    points += Math.max(0, 2 + h.par - (s.strokes - got));
    strokes += s.strokes - got;
  }
  return { points, strokes };
}

// ---- read ---------------------------------------------------------------------------------------
const [t] = await get("tournaments?select=id,club_id,course_id,max_index&name=eq.24th%20Bamboo%20Tee");
if (!t) throw new Error("Tournament not found.");
const rounds = await get(
  `competition_rounds?select=id,day_number,status,rules_version,allowance,handicap_rounding,play_date&tournament_id=eq.${t.id}&order=day_number`,
);
const holeDefs = new Map((await get(`holes?select=number,par,stroke_index&course_id=eq.${t.course_id}`)).map((h) => [h.number, h]));
const tees = Object.fromEntries((await get("tees?select=id,course_rating,slope,par")).map((x) => [x.id, x]));
const regs = await getAll(`registrations?select=id,player_id,frozen_index,tee_id,player:players(full_name)&tournament_id=eq.${t.id}`);
const regByPlayer = new Map(regs.map((r) => [r.player_id, r]));
const maxIndex = t.max_index == null ? null : Number(t.max_index);

const plan = [];
const backup = { at: new Date().toISOString(), rounds: [] };
const onlyRounds = argv.includes("--rounds") ? argv[argv.indexOf("--rounds") + 1].split(",").map(Number) : null;
for (const rd of rounds) {
  if (rd.day_number > 3) continue;
  if (onlyRounds && !onlyRounds.includes(rd.day_number)) continue;
  const results = await getAll(`round_results?select=*&round_id=eq.${rd.id}&superseded_at=is.null`);
  const entries = await getAll(`round_entries?select=id,registration_id,status&round_id=eq.${rd.id}`);
  const snaps = await getAll(`handicap_snapshots?select=*&round_id=eq.${rd.id}`);
  const scores = await getAll(
    `approved_hole_scores?select=player_id,hole_number,strokes,picked_up,verification&round_id=eq.${rd.id}&superseded_at=is.null`,
  );
  const [pub] = await get(`round_publications?select=*&round_id=eq.${rd.id}&order=version.desc&limit=1`);
  backup.rounds.push({ round: rd, results, snaps, latestPublication: pub ?? null });

  const entryOfReg = new Map(entries.filter((e) => e.status === "active").map((e) => [e.registration_id, e]));
  const snapOfEntry = new Map(snaps.map((s) => [s.round_entry_id, s]));
  const scoresOf = new Map();
  for (const s of scores) {
    if (s.verification !== "verified" && s.verification !== "provisional") continue;
    const list = scoresOf.get(s.player_id) ?? [];
    list.push(s);
    scoresOf.set(s.player_id, list);
  }
  const rows = [];
  for (const res of results) {
    const reg = regByPlayer.get(res.player_id);
    const name = reg?.player?.full_name ?? res.player_id;
    const row = { name, playerId: res.player_id, before: { net: res.net_points, netStrokes: res.net_strokes, gross: res.gross_points } };
    const entry = reg ? entryOfReg.get(reg.id) : null;
    const idx = reg?.frozen_index == null ? null : Number(reg.frozen_index);
    if (!reg || !entry) row.action = "skip: not entered in this round";
    else if (idx === null || idx === 0) row.action = "skip: no usable index on file (null or 0)";
    else if (!tees[reg.tee_id]) row.action = "skip: no tee";
    else {
      const calc = playingHandicapFor(idx, tees[reg.tee_id], Number(rd.allowance), rd.handicap_rounding, maxIndex);
      row.target = calc;
      row.entry = entry;
      row.reg = reg;
      const snap = snapOfEntry.get(entry.id);
      if (snap && snap.playing_handicap !== calc.playing) {
        row.action = `skip: frozen snapshot plays off ${snap.playing_handicap}, formula gives ${calc.playing}`;
        row.frozen = snap.playing_handicap;
      } else {
        row.action = snap ? "recalculate (snapshot already matches)" : "add snapshot and recalculate";
        const predicted = netFor(scoresOf.get(res.player_id) ?? [], holeDefs, calc.playing);
        row.predicted = predicted;
        row.tee = tees[reg.tee_id];
      }
    }
    rows.push(row);
  }
  plan.push({ rd, rows, pub, results, scoresOf });
}

// ---- model check: does the independent calculation reproduce today's stored results? ------------
// Each published card records the strokes it gave on every hole; their sum is the handicap that
// card was scored with. Scoring the same hole scores with that handicap must give the stored net.
let modelTotal = 0;
let modelOk = 0;
const modelMisses = [];
for (const { rd, rows, pub, scoresOf } of plan) {
  for (const card of pub?.snapshot?.cards ?? []) {
    const holes = card.holes ?? [];
    if (holes.length !== holeDefs.size || !holes.every((h) => typeof h.handicapStrokes === "number")) continue;
    const row = rows.find((r) => r.playerId === card.playerId);
    if (!row) continue;
    const applied = holes.reduce((a, h) => a + h.handicapStrokes, 0);
    const got = netFor(scoresOf.get(card.playerId) ?? [], holeDefs, applied);
    modelTotal++;
    if (got.points === row.before.net && got.strokes === row.before.netStrokes) modelOk++;
    else modelMisses.push(`Day ${rd.day_number} ${row.name}: stored ${row.before.net}, model ${got.points} at ${applied}`);
  }
}
console.log(`Model check: ${modelOk} of ${modelTotal} stored results are reproduced exactly from the hole scores and the handicap each card applied.`);
for (const m of modelMisses.slice(0, 8)) console.log(`  not reproduced: ${m}`);

// ---- report -------------------------------------------------------------------------------------
for (const { rd, rows } of plan) {
  const doing = rows.filter((r) => r.predicted);
  const changed = doing.filter((r) => r.predicted.points !== r.before.net);
  const skipped = rows.filter((r) => !r.predicted);
  console.log(`\nDay ${rd.day_number} (${rd.status}, allowance ${rd.allowance}, rounding ${rd.handicap_rounding}): ${rows.length} results`);
  console.log(`  to recalculate ${doing.length} (new snapshots ${doing.filter((r) => r.action.startsWith("add")).length}); net points change for ${changed.length}`);
  const bySkip = {};
  for (const r of skipped) (bySkip[r.action] ??= []).push(r.name);
  for (const [k, v] of Object.entries(bySkip)) console.log(`  ${k.startsWith("skip: frozen") ? "skip: frozen snapshot differs" : k}: ${v.length}${v.length <= 12 ? ` (${v.join("; ")})` : ""}`);
  const moves = changed.map((r) => ({ n: r.name, from: r.before.net, to: r.predicted.points, ph: r.target.playing })).sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
  for (const m of moves.slice(0, 8)) console.log(`    ${m.n}: net ${m.from} -> ${m.to} (plays off ${m.ph})`);
  const sum = changed.reduce((a, r) => a + (r.predicted.points - r.before.net), 0);
  console.log(`  total net points moved: ${sum >= 0 ? "+" : ""}${sum}; up ${changed.filter((r) => r.predicted.points > r.before.net).length}, down ${changed.filter((r) => r.predicted.points < r.before.net).length}`);
}
if (!apply) {
  console.log("\nPlan only. Run again with --apply to write.");
  process.exit(0);
}

// ---- write --------------------------------------------------------------------------------------
mkdirSync("backups", { recursive: true });
const backupFile = join("backups", `handicap-recalc-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(backupFile, JSON.stringify(backup));
console.log(`\nbackup written: ${backupFile}`);

for (const { rd, rows, pub, scoresOf } of plan) {
  const doing = rows.filter((r) => r.predicted);
  if (doing.length === 0) continue;
  const newSnaps = doing.filter((r) => r.action.startsWith("add"));
  if (newSnaps.length) {
    const inserted = await rest(
      "POST",
      "handicap_snapshots",
      newSnaps.map((r) => ({
        club_id: t.club_id,
        round_id: rd.id,
        round_entry_id: r.entry.id,
        handicap_index: r.target.used,
        index_source: "Registration freeze",
        index_effective_date: rd.play_date,
        tee_id: r.reg.tee_id,
        course_rating: r.tee.course_rating,
        slope: r.tee.slope,
        course_par: r.tee.par,
        allowance: Number(rd.allowance),
        rounding: rd.handicap_rounding,
        course_handicap: r.target.course,
        playing_handicap: r.target.playing,
        rules_version: rd.rules_version ?? "unconfirmed",
      })),
      "return=representation",
    );
    await rest(
      "POST",
      "scoring_audit",
      inserted.map((s) => ({
        club_id: t.club_id,
        round_id: rd.id,
        entity: "handicap_snapshot",
        entity_id: s.id,
        action: "saved",
        reason: "Recalculated with the system playing-handicap formula (14 Nov 2026)",
        after: { handicapIndex: Number(s.handicap_index), courseHandicap: s.course_handicap, playingHandicap: s.playing_handicap, allowance: Number(s.allowance), rounding: s.rounding },
      })),
    );
    console.log(`Day ${rd.day_number}: ${inserted.length} snapshots added`);
  }
  for (const r of doing) {
    await rest("POST", "rpc/recalculate_player_results", { p_round: rd.id, p_player: r.playerId });
  }
  // Check the database's results against the independent calculation before anything is published.
  const after = await getAll(`round_results?select=player_id,net_points,net_strokes,gross_points,superseded_at&round_id=eq.${rd.id}&superseded_at=is.null`);
  const afterOf = new Map(after.map((a) => [a.player_id, a]));
  const bad = doing.filter((r) => {
    const a = afterOf.get(r.playerId);
    return !a || a.net_points !== r.predicted.points || a.net_strokes !== r.predicted.strokes || a.gross_points !== r.before.gross;
  });
  if (bad.length) {
    throw new Error(`Day ${rd.day_number}: ${bad.length} recalculated result(s) differ from the independent check (${bad.slice(0, 5).map((b) => b.name).join("; ")}). Nothing was published.`);
  }
  console.log(`Day ${rd.day_number}: ${doing.length} results recalculated and verified`);

  const version = (pub?.version ?? 0) + 1;
  const built = await rest("POST", "rpc/build_round_snapshot", { p_round: rd.id, p_state: "provisional", p_version: version });
  const recalculated = new Set(doing.map((r) => r.playerId));
  const previousCards = new Map((pub?.snapshot?.cards ?? []).map((c) => [c.playerId, c]));
  // A player that was not recalculated keeps exactly the card the public has now.
  built.cards = (built.cards ?? []).map((c) => (recalculated.has(c.playerId) ? c : (previousCards.get(c.playerId) ?? c)));
  if ((built.gross ?? []).length === 0) throw new Error(`Day ${rd.day_number}: the builder returned no results; nothing was published.`);
  await rest("POST", "round_publications", {
    club_id: t.club_id,
    round_id: rd.id,
    version,
    state: "provisional",
    snapshot: built,
    note: "Playing handicap recalculated with the system formula (14 Nov 2026). Earlier versions are kept.",
  });
  console.log(`Day ${rd.day_number}: published version ${version} (${built.cards.length} cards)`);
}
console.log("\nDone.");
