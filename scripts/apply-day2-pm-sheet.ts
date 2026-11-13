/**
 * Makes the Day 2 afternoon schedule of the 24th Bamboo Tee match the club's 13 Nov 2026
 * "Tee-Off Sheet" (12:30 PM shotgun), and publishes the result as the next pairings version.
 *
 * The sheet is absolute. It replaces the Day 2 PM groups, nothing else:
 *   - Day 1 and the Day 2 AM groups are carried over from the last published version unchanged.
 *   - The only other change is removing a player the owner deleted (REMOVED_PLAYERS) from the
 *     groups that have not been played.
 *
 *   pnpm exec tsx scripts/apply-day2-pm-sheet.ts            plan only (the default)
 *   pnpm exec tsx scripts/apply-day2-pm-sheet.ts --apply    write, after backing up
 *
 * A player on the sheet whose name has no match is added to the directory with a registration that
 * needs review, because the sheet carries no handicap index for them.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseName, searchKey } from "../src/lib/names";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.");
const apply = process.argv.includes("--apply");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const TIME = "12:30";
const DAY = 2;

/** The sheet, one entry per hole that has a group. Hole 4, 7 and 18 are empty on the sheet. */
const SHEET: Array<{ hole: number; players: string[] }> = [
  { hole: 1, players: ["TAMBA, DAL", "COO, EARL STEPHEN", "CO, JB", "SALDANA, BOY"] },
  { hole: 2, players: ["YOUN, SMITH", "DARIUS, GREGORIO", "PO, JC", "MENDEZ, PAUL"] },
  { hole: 3, players: ["ALEJO, JONAS", "JUBILAN, AMIEL", "CELIS, RAY", "LOCSIN, BEBOT"] },
  { hole: 5, players: ["DARROCA, PHILIP", "DARROCA, PAOLO", "HERRERA, PETE", "PANAGUITON, EMMIT"] },
  { hole: 6, players: ["SEO, EUN JIN", "HONG, KEUN SEON", "YU, JI YOUN", "LEE, JENNY"] },
  { hole: 8, players: ["MIN, HYANG GEE", "CAMOT, ARIANNE", "ALBA, MARIAN", "YAO, JOHANNA"] },
  { hole: 9, players: ["JAVELOSA, JULIO", "JAVELOSA, GERARDO", "PALOMO, RONALD", "NUNEZ, ALBERT"] },
  { hole: 10, players: ["ITA-AS, TINA", "YUSAY, JAIME", "PADUANO, JOSEPH"] },
  { hole: 11, players: ["LOCSIN, MANUEL", "RIVERA, KYLE", "DELFIN, ROD KENNETH", "JAMELO, JESSIE"] },
  { hole: 12, players: ["DELA CRUZ, EDGAR", "NG, ROCKY", "VILLANUEVA, TONY", "VILLANUEVA, CARLOS"] },
  { hole: 13, players: ["DILAG, FRANCIS", "JARA, ROLLIE", "LONGNO, HENRY", "HINNERS, KEN"] },
  { hole: 14, players: ["MARAVILLA, HERMINIO", "DELOS SANTOS, FLORENE", "ESTOQUE, LITO", "ANALUCAS, ZALDY"] },
  { hole: 15, players: ["YAO, TOM PETER", "NG, LARRY", "LOCSIN, FRANKIE", "LOCSIN, LUIS"] },
  { hole: 16, players: ["DU, MATT", "PAMA, RAM", "BUNI, GERRY", "KIM IN SIL"] },
  { hole: 17, players: ["MABALOT, FLORANTE", "BINAS, MATT", "CAMBAY, JESUS", "CAMBAY, JESSE CHARLO"] },
];

/** Sheet spellings that are a known person stored under a longer or different name. */
const SAME_PERSON: Record<string, string> = {
  "PADUANO, JOSEPH": "PADUANO, JOSEPH STEPHAN",
  "ANALUCAS, ZALDY": "AÑALUCAS, RIZALDY",
};

/** The owner deleted this player; they leave every group that has not been played. */
const REMOVED_PLAYERS = ["RODRIGUEZ, JOSHUA"];

const wk = (name: string) => searchKey(name).split(" ").filter(Boolean).sort().join(" ");
function fail(where: string, error: { message: string } | null): void {
  if (error) throw new Error(`${where}: ${error.message}`);
}

const tournament = (await db.from("tournaments").select("*").eq("name", "24th Bamboo Tee").single()).data;
if (!tournament) throw new Error("Tournament not found.");
const tid: string = tournament.id;
const clubId: string = tournament.club_id;

const days = (await db.from("tournament_days").select("id,day_number,play_date,label").eq("tournament_id", tid)).data ?? [];
const day = days.find((d) => d.day_number === DAY);
if (!day) throw new Error("Day 2 not found.");
const rounds = (await db.from("competition_rounds").select("id,day_number").eq("tournament_id", tid)).data ?? [];
const round = rounds.find((r) => r.day_number === DAY);
if (!round) throw new Error("Day 2 round not found.");

const players: Array<{ id: string; full_name: string; deleted_at: string | null }> = [];
for (let from = 0; ; from += 1000) {
  const r = await db.from("players").select("id,full_name,deleted_at").eq("club_id", clubId).range(from, from + 999);
  fail("Reading players", r.error);
  players.push(...(r.data ?? []));
  if ((r.data ?? []).length < 1000) break;
}
const regs = (await db.from("registrations").select("id,player_id,status").eq("tournament_id", tid)).data ?? [];
const regOf = new Map(regs.map((r) => [r.player_id, r]));

// 1. Resolve every sheet name to a player with a registration (or mark it to be created).
interface Resolved {
  sheetName: string;
  playerId: string | null;
  registrationId: string | null;
  storedName: string;
}
const resolved = new Map<string, Resolved>();
for (const g of SHEET) {
  for (const sheetName of g.players) {
    const target = SAME_PERSON[sheetName] ?? sheetName;
    const hits = players.filter((p) => !p.deleted_at && wk(p.full_name) === wk(target));
    if (hits.length > 1) throw new Error(`${sheetName} matches ${hits.length} players; the sheet cannot be applied.`);
    const hit = hits[0];
    const reg = hit ? regOf.get(hit.id) : undefined;
    if (hit && !reg) throw new Error(`${sheetName} is in the directory but not registered for this event.`);
    resolved.set(sheetName, {
      sheetName,
      playerId: hit?.id ?? null,
      registrationId: reg?.id ?? null,
      storedName: hit?.full_name ?? sheetName,
    });
  }
}
const toCreate = [...resolved.values()].filter((r) => !r.playerId);

// 2. Current state.
const dayRows = (
  await db.from("registration_days").select("id,registration_id,selected,session,tee_time,start_hole,tee_confirmed,wave").eq("tournament_day_id", day.id)
).data ?? [];
const groupsNow = (await db.from("groups").select("id,number,start_hole,tee_time,wave,flight_id,locked").eq("round_id", round.id)).data ?? [];
const pmGroups = groupsNow.filter((g) => g.wave === "D2-PM-A");
const pmGroupIds = new Set(pmGroups.map((g) => g.id));
const memberRows = (await db.from("group_members").select("*").eq("round_id", round.id)).data ?? [];
const pv = (await db.from("pairings_versions").select("*").eq("tournament_id", tid).order("version", { ascending: false }).limit(1)).data?.[0];
if (!pv) throw new Error("No published version.");
const snap = pv.snapshot as { groups: Array<Record<string, any>>; [k: string]: unknown };

const onSheetRegs = new Set([...resolved.values()].map((r) => r.registrationId).filter((x): x is string => Boolean(x)));
const offSheet = dayRows.filter((r) => r.selected && r.session === "PM" && !onSheetRegs.has(r.registration_id));
const regName = new Map(regs.map((r) => [r.id, players.find((p) => p.id === r.player_id)?.full_name ?? r.id]));
const wrongSession = dayRows.filter((r) => onSheetRegs.has(r.registration_id) && r.session !== "PM" && r.session !== null && r.selected);

console.log(`Sheet: ${SHEET.length} groups, ${[...resolved.values()].length} players at ${TIME} shotgun.`);
console.log(`To add to the directory: ${toCreate.map((r) => r.sheetName).join("; ") || "none"}`);
console.log(`Off the sheet (cleared of tee, hole and confirmation, day selection kept): ${offSheet.map((r) => regName.get(r.registration_id)).join("; ") || "none"}`);
console.log(`On the sheet but stored as another session on Day 2 (set to PM): ${wrongSession.map((r) => `${regName.get(r.registration_id)} (${r.session})`).join("; ") || "none"}`);
console.log(`Live Day 2 PM groups now: ${pmGroups.length}; published PM groups now: ${snap.groups.filter((g) => g.dayNumber === DAY && g.wave === "PM").length}`);

const removedIds = players.filter((p) => REMOVED_PLAYERS.some((n) => wk(n) === wk(p.full_name))).map((p) => p.id);
console.log(`Removed players found: ${removedIds.length}`);
// Their stored choice is AM but the published Day 2 groups already put them in the afternoon and
// they are in no AM group. The sheet is absolute, so their Day 2 session becomes PM below.

// Cards the removed player scored: those groups are history and stay.
const scored = new Set<string>();
for (const id of removedIds) {
  const sc = (await db.from("scorecards").select("round_id").eq("player_id", id)).data ?? [];
  for (const s of sc) scored.add(s.round_id as string);
}
console.log(`Rounds where a removed player has a scorecard: ${[...scored].join(", ") || "none"}`);

// 3. Build the new published groups: everything else carried over, Day 2 PM replaced.
const snapKeep = snap.groups.filter((g) => !(g.dayNumber === DAY && g.wave === "PM"));
const templatePm = snap.groups.find((g) => g.dayNumber === DAY && g.wave === "PM");
if (!templatePm) throw new Error("No Day 2 PM group to copy the shape from.");
const lastIndexKept = snap.groups.map((g, i) => (g.dayNumber === DAY && g.wave === "PM" ? -1 : i)).reduce((a, b) => Math.max(a, b), -1);
const firstPmIndex = snap.groups.findIndex((g) => g.dayNumber === DAY && g.wave === "PM");
if (firstPmIndex < lastIndexKept) console.log("note: Day 2 PM groups were not last in the snapshot; they are placed last now.");

const firstNumber = Math.min(...snap.groups.filter((g) => g.dayNumber === DAY && g.wave === "PM").map((g) => g.number as number));
const newPm = SHEET.map((g, i) => {
  const rs = g.players.map((n) => resolved.get(n) as Resolved);
  return {
    time: TIME,
    wave: "PM",
    flight: templatePm.flight,
    number: firstNumber + i,
    players: rs.map((r) => r.storedName),
    dayLabel: templatePm.dayLabel,
    playDate: templatePm.playDate,
    dayNumber: DAY,
    playerIds: rs.map((r) => r.playerId),
    startHole: g.hole,
    _sheet: g.players,
  };
});

const stripRemoved = (g: Record<string, any>): Record<string, any> => {
  if (g.dayNumber === 1 && scored.size > 0) return g; // a played, scored round is history
  const ids: string[] = g.playerIds ?? [];
  if (!ids.some((id) => removedIds.includes(id))) return g;
  const keep = ids.map((id, i) => ({ id, name: g.players[i] })).filter((x) => !removedIds.includes(x.id));
  return { ...g, players: keep.map((x) => x.name), playerIds: keep.map((x) => x.id) };
};
const keptOut = snapKeep.map(stripRemoved);
console.log("Published groups touched by the removal:", keptOut.filter((g, i) => g !== snapKeep[i]).map((g) => `Day ${g.dayNumber} ${g.wave} #${g.number}`).join("; ") || "none");

for (const g of newPm) console.log(`  hole ${String(g.startHole).padStart(2)}  #${g.number}  ${g.players.join(" | ")}`);

if (!apply) {
  console.log("\nPlan only. Run again with --apply to write.");
  process.exit(0);
}

// 4. Back up, then write.
mkdirSync("backups", { recursive: true });
const backupFile = join("backups", `day2-pm-sheet-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(backupFile, JSON.stringify({ groupsNow, memberRows, dayRows, publishedVersion: pv, draw_revision: tournament.draw_revision, published_snapshot: tournament.published_snapshot }, null, 1));
console.log(`backup written: ${backupFile}`);

const nameOf = new Map<string, string>();
for (const c of toCreate) {
  const parsed = parseName(c.sheetName);
  const inserted = await db
    .from("players")
    .insert({ club_id: clubId, full_name: c.sheetName, first_name: parsed.given, last_name: parsed.surname })
    .select("id")
    .single();
  fail(`Creating ${c.sheetName}`, inserted.error);
  const registration = await db
    .from("registrations")
    .insert({
      club_id: clubId,
      tournament_id: tid,
      player_id: inserted.data?.id as string,
      status: "needs_review",
      reasons: ["Added from the 13 Nov 2026 Day 2 PM tee-off sheet. No handicap index or membership on file."],
      answers: {},
    })
    .select("id")
    .single();
  fail(`Registering ${c.sheetName}`, registration.error);
  c.playerId = inserted.data?.id as string;
  c.registrationId = registration.data?.id as string;
  nameOf.set(c.sheetName, c.sheetName);
}
for (const g of newPm) {
  g.playerIds = g._sheet.map((n) => (resolved.get(n) as Resolved).playerId);
}

// Per-player Day 2 rows on the sheet. The event allows at most two playing days per player: a
// sheet player who already has two other days keeps those rows as they are (the owner picks which
// day to give up) and still gets the group slot below.
const allDayRows = (await db.from("registration_days").select("registration_id,tournament_day_id,selected").in("registration_id", [...resolved.values()].map((r) => r.registrationId).filter((x): x is string => Boolean(x)))).data ?? [];
const dayRuleBlocked: string[] = [];
for (const g of SHEET) {
  for (const n of g.players) {
    const r = resolved.get(n) as Resolved;
    const existing = dayRows.find((d) => d.registration_id === r.registrationId);
    const otherDays = allDayRows.filter((d) => d.registration_id === r.registrationId && d.selected && d.tournament_day_id !== day.id).length;
    if (otherDays >= 2 && !existing?.selected) {
      dayRuleBlocked.push(n);
      continue;
    }
    const values = { session: "PM", selected: true, tee_time: `${TIME}:00`, start_hole: g.hole, tee_confirmed: true, wave: "A" };
    if (existing) {
      fail(`Day 2 for ${n}`, (await db.from("registration_days").update(values).eq("id", existing.id)).error);
    } else {
      fail(`Day 2 for ${n}`, (await db.from("registration_days").insert({ registration_id: r.registrationId, tournament_day_id: day.id, ...values })).error);
    }
  }
}
console.log(`Day rule (max 2 days): Day 2 row not changed for ${dayRuleBlocked.join("; ") || "nobody"}`);
for (const r of offSheet) {
  fail(`Clearing ${regName.get(r.registration_id)}`, (await db.from("registration_days").update({ tee_time: null, start_hole: null, tee_confirmed: false, wave: null }).eq("id", r.id)).error);
}

// Live groups: replace the Day 2 PM groups.
const flightFor = (hole: number) => pmGroups.find((g) => g.start_hole === hole)?.flight_id ?? pmGroups[0]?.flight_id;
fail("Removing old Day 2 PM members", (await db.from("group_members").delete().in("group_id", [...pmGroupIds])).error);
fail("Removing old Day 2 PM groups", (await db.from("groups").delete().in("id", [...pmGroupIds])).error);
for (const g of newPm) {
  const inserted = await db
    .from("groups")
    .insert({ club_id: clubId, tournament_id: tid, round_id: round.id, flight_id: flightFor(g.startHole), number: g.number, start_hole: g.startHole, wave: "D2-PM-A", tee_time: `${TIME}:00`, locked: false })
    .select("id")
    .single();
  fail(`Group ${g.number}`, inserted.error);
  const members = g.playerIds.map((pid, i) => ({
    club_id: clubId,
    group_id: inserted.data?.id as string,
    registration_id: regs.find((r) => r.player_id === pid)?.id ?? (toCreate.find((c) => c.playerId === pid)?.registrationId as string),
    position: i + 1,
    round_id: round.id,
  }));
  fail(`Members of group ${g.number}`, (await db.from("group_members").insert(members)).error);
}

// A removed player leaves the unplayed live groups too.
for (const id of removedIds) {
  const reg = regOf.get(id)?.id;
  if (!reg) continue;
  const keepRounds = [...scored];
  const q = db.from("group_members").delete().eq("registration_id", reg);
  fail(`Removing ${id} from groups`, (keepRounds.length > 0 ? await q.not("round_id", "in", `(${keepRounds.join(",")})`) : await q).error);
}

// Publish the next version.
const finalGroups = [...keptOut, ...newPm.map(({ _sheet, ...g }) => g)];
const signature = finalGroups.map((g) => `${g.dayNumber}-${g.number}:${(g.players as string[]).join(",")}`).join("|");
const version = (pv.version as number) + 1;
const at = new Date().toISOString();
const snapshot = { ...snap, version, at, signature, groups: finalGroups };
const note = "Day 2 PM replaced with the club's 13 Nov 2026 Tee-Off Sheet (12:30 PM shotgun). Day 1 and Day 2 AM carried over; a player the owner deleted is removed from unplayed groups.";
fail(
  "Publishing",
  (await db.from("pairings_versions").insert({ club_id: clubId, tournament_id: tid, version, snapshot, note, published_at: at })).error,
);
fail(
  "Updating the live snapshot",
  (await db.from("tournaments").update({ published: true, published_snapshot: snapshot, draw_revision: (tournament.draw_revision as number) + 1 }).eq("id", tid)).error,
);
console.log(`\nDone. Published version ${version}; draw revision ${(tournament.draw_revision as number) + 1}.`);
