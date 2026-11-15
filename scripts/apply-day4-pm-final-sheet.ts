/**
 * Makes the Day 4 afternoon draw of the 24th Bamboo Tee match the organiser's final 15 Nov 2026
 * "Tee-Off" sheet (11:30 AM shotgun), and publishes the result as the next pairings version.
 *
 * The sheet is absolute. It replaces the Day 4 PM groups only: every other published group (Days 1
 * to 3 and Day 4 AM) is carried over unchanged. Group "B" on a hole is a second group starting on
 * the same hole, written after the A group.
 *
 *   pnpm exec tsx scripts/apply-day4-pm-final-sheet.ts            plan only (the default)
 *   pnpm exec tsx scripts/apply-day4-pm-final-sheet.ts --apply    write, after backing up
 *
 * A sheet name with no match in the directory is added as a player with a registration that needs
 * review (the sheet carries no handicap index). A name that is a known person under another
 * spelling is listed in SAME_PERSON.
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

const TIME = "11:30";
const DAY = 4;

/** The sheet in reading order: hole, then A before B. Holes 4B, 10B and 16B are empty on the sheet. */
const SHEET: Array<{ hole: string; players: string[] }> = [
  { hole: "1", players: ["NOH, JOHN", "LAMATA, IGNACIO", "VILLARUZ, CHIKKI", "RUBRICO, RIC"] },
  { hole: "1B", players: ["FARIN, LEONARD", "LALLANA, ROLAND", "BRAGA, NONOY", "VINUYA, FERNANDO"] },
  { hole: "2", players: ["AN, HONG JUN", "TAÑADA, JOSE LEONARDO", "KOZONO, TAKAYUKI", "PAUIG, MARK"] },
  { hole: "2B", players: ["GELINDON, MEYNARD", "VILLAROSA, JASON", "VILLO, IOLO ANGELO", "GURREA, FELMAN"] },
  { hole: "3", players: ["BARCARLOS, JOHN NEIL", "DAUN, WAYNE", "VIOS, GREGG", "AMADOR, JOEMARIE"] },
  { hole: "3B", players: ["LOPERA, BOB", "PINTAC, JEFF", "UY BRILLANTES, DENNIS", "GUANZON, PAULO"] },
  { hole: "4", players: ["BENEDICTO, ANDIE", "ESO, MANDO", "IBE, NINO", "ESCANIEL, ACE"] },
  { hole: "5", players: ["RIVERA, MAGGIE", "LLEWELLYN, RICAMAY", "CACHO, MARIROSE", "CAJILI, RICO"] },
  { hole: "5B", players: ["PARK, PG", "KRISPILI, MICHAEL", "SO, JAN LAWRENCE", "CHUA, JANZEN"] },
  { hole: "6", players: ["CORNEJO, ANDREI", "CORNEJO, AJ", "JAVELOSA, JULIO", "JAVELOSA, GERARDO"] },
  { hole: "7", players: ["TAYLOR, WAYNE", "MACCSLIN, BRIAN", "SODUSTA, ANGELES", "SELFER, HANNAH JOY"] },
  { hole: "7B", players: ["SAMSON, MICHAEL", "HAMMOND, TREVOR", "HERRERA, PETE", "PANAGUITON, EMMIT"] },
  { hole: "8", players: ["KIM, IN SIL", "TOLEDO, ANGELICA", "DABAO, MICHELLE", "MERCADO, MICHAEL"] },
  { hole: "9", players: ["TAYLOR, JOY ANN", "GRIFFITHS, KIM", "MELOSANTOS, RANDY", "TERAZONA, JAN"] },
  { hole: "9B", players: ["GUZMAN, JOEL", "VASQUEZ, RUSSEL VANDRICK", "PEFIANCO, NAPOLEON", "DABAO, JOSE LUIS"] },
  { hole: "10", players: ["BUÑI, GERRY", "SEBASTIAN, BUTCH", "DACLES, GERARD"] },
  { hole: "11", players: ["YOUNG, JOHNNY", "GOCELA, VICTOR", "BARCARLOS, PAUL ERIK", "LOPINGCO, JOSHUA"] },
  { hole: "12", players: ["FRANCIA, PAUL", "JARDELEZA, BART", "JARDELEZA, STEVE", "JARDELEZA, ARMAND"] },
  { hole: "13", players: ["GOPIO, JUN", "CAPALUNGAN, RACHELLE RUTH", "CHUA, DODO", "SILVA, PINKY"] },
  { hole: "13B", players: ["ESPINO, MARK", "TECSON, BRYAN NEIL CHUA", "LOCSIN, WILSON", "DUONG, DA VIT"] },
  { hole: "14", players: ["LOCSIN, KRISTOFFER", "PAGDONSOLAN, MARK", "LUCERO, NOEL", "BULACLAC, RUSSELL"] },
  { hole: "15", players: ["MARQUEZ, MIKE", "TENEDERO, REY", "DESTREZA, GILDO", "MORENO, JUSTIN RAYNIER"] },
  { hole: "15B", players: ["ZARAGOZA, AMOR", "RODRIGUEZ, CHRISTOPPHER JOHN", "SODUSTA, NOLI", "SODUSTA, NEONITO"] },
  { hole: "16", players: ["LASANGUE, OSCAR", "ABRENILLA, MARCOS FRANCISCO", "PASAPORTE, INNO", "TAN, JUAN RICARDO"] },
  { hole: "17", players: ["VENTULAN, FELIPE", "CINIO, ETHELENNE", "IBE, FLOR ANDREA", "CHO, SHARON"] },
  { hole: "18", players: ["TAYAO, KEVIN", "BACANI, LUIGI", "DABAO, RAYMOND", "MERCADO, MARK STEVE"] },
  { hole: "18B", players: ["ROSALES, IAN", "ESPEJO, JOHN", "VILLARUZ, RICHIE", "VILLAROSA, II"] },
];

/** Sheet spellings that are a known person stored under another spelling. Filled from the plan run. */
const SAME_PERSON: Record<string, string> = {
  "RUBRICO, RIC": "RUBICO, RIC",
  "GUANZON, PAULO": "GUANZON, PAOLO",
  "CAPALUNGAN, RACHELLE RUTH": "CAPALUNGAN, RUTH",
  "DUONG, DA VIT": "DOUNG, DA VIT",
  "KRISPILI, MICHAEL": "KRISPLI, MICHAEL",
};

const wk = (name: string) => searchKey(name).split(" ").filter(Boolean).sort().join(" ");
function fail(where: string, error: { message: string } | null): void {
  if (error) throw new Error(`${where}: ${error.message}`);
}
const holeNumber = (hole: string) => Number.parseInt(hole, 10);

const tournament = (await db.from("tournaments").select("*").eq("name", "24th Bamboo Tee").single()).data;
if (!tournament) throw new Error("Tournament not found.");
const tid: string = tournament.id;
const clubId: string = tournament.club_id;
const days = (await db.from("tournament_days").select("id,day_number,play_date,label").eq("tournament_id", tid)).data ?? [];
const day = days.find((d) => d.day_number === DAY);
if (!day) throw new Error("Day 4 not found.");
const dayNo = new Map(days.map((d) => [d.id, d.day_number]));
const round = (await db.from("competition_rounds").select("id,status").eq("tournament_id", tid).eq("day_number", DAY).single()).data;
if (!round) throw new Error("Day 4 round not found.");
if ((await db.from("scorecards").select("id", { count: "exact", head: true }).eq("round_id", round.id)).count) throw new Error("Day 4 already has scorecards; refusing to replace its groups.");

const players: Array<{ id: string; full_name: string; deleted_at: string | null }> = [];
for (let from = 0; ; from += 1000) {
  const r = await db.from("players").select("id,full_name,deleted_at").eq("club_id", clubId).range(from, from + 999);
  fail("Reading players", r.error);
  players.push(...(r.data ?? []));
  if ((r.data ?? []).length < 1000) break;
}
const regs = (await db.from("registrations").select("id,player_id,status,flight_id").eq("tournament_id", tid)).data ?? [];
const regOf = new Map(regs.map((r) => [r.player_id, r]));
const regName = new Map(regs.map((r) => [r.id, players.find((p) => p.id === r.player_id)?.full_name ?? r.id]));
const flights = (await db.from("flights").select("id,name")).data ?? [];
const flightName = new Map(flights.map((f) => [f.id, f.name]));

interface Resolved {
  sheetName: string;
  playerId: string | null;
  registrationId: string | null;
  storedName: string;
  flightId: string | null;
}
const resolved = new Map<string, Resolved>();
for (const g of SHEET) {
  for (const sheetName of g.players) {
    if (resolved.has(sheetName)) continue;
    const target = SAME_PERSON[sheetName] ?? sheetName;
    const hits = players.filter((p) => !p.deleted_at && wk(p.full_name) === wk(target));
    if (hits.length > 1) throw new Error(`${sheetName} matches ${hits.length} players; the sheet cannot be applied.`);
    const hit = hits[0];
    const reg = hit ? regOf.get(hit.id) : undefined;
    if (hit && !reg) throw new Error(`${sheetName} is in the directory but not registered for this event.`);
    resolved.set(sheetName, { sheetName, playerId: hit?.id ?? null, registrationId: reg?.id ?? null, storedName: hit?.full_name ?? sheetName, flightId: reg?.flight_id ?? null });
  }
}
const toCreate = [...resolved.values()].filter((r) => !r.playerId);

const allDayRows: Array<Record<string, any>> = [];
for (let from = 0; ; from += 1000) {
  const r = await db
    .from("registration_days")
    .select("id,registration_id,tournament_day_id,selected,session,tee_time,start_hole,tee_confirmed,wave")
    .in("tournament_day_id", days.map((d) => d.id))
    .order("id")
    .range(from, from + 999);
  fail("Reading registration days", r.error);
  allDayRows.push(...(r.data ?? []));
  if ((r.data ?? []).length < 1000) break;
}
const dayRows = allDayRows.filter((r) => r.tournament_day_id === day.id);
const groupsNow = (await db.from("groups").select("*").eq("round_id", round.id)).data ?? [];
const pmGroups = groupsNow.filter((g) => g.wave === "PM");
const amGroups = groupsNow.filter((g) => g.wave !== "PM");
const membersNow = (await db.from("group_members").select("*").eq("round_id", round.id)).data ?? [];
const amMemberRegs = new Set(membersNow.filter((m) => amGroups.some((g) => g.id === m.group_id)).map((m) => m.registration_id as string));
const pv = (await db.from("pairings_versions").select("*").eq("tournament_id", tid).order("version", { ascending: false }).limit(1)).data?.[0];
if (!pv) throw new Error("No published version.");
const snap = pv.snapshot as { groups: Array<Record<string, any>>; [k: string]: unknown };

const onSheetRegs = new Set([...resolved.values()].map((r) => r.registrationId).filter((x): x is string => Boolean(x)));
const offSheet = dayRows.filter((r) => r.selected && r.session === "PM" && !onSheetRegs.has(r.registration_id));
const wrongSession = dayRows.filter((r) => onSheetRegs.has(r.registration_id) && r.selected && r.session !== "PM" && r.session !== null);
const inAm = [...resolved.values()].filter((r) => r.registrationId && amMemberRegs.has(r.registrationId));
const sheetPlayers = [...resolved.values()].length;

console.log(`Sheet: ${SHEET.length} groups, ${sheetPlayers} players at ${TIME} shotgun.`);
console.log(`Unmatched, would be added as needs_review: ${toCreate.map((r) => r.sheetName).join("; ") || "none"}`);
for (const r of toCreate) {
  const surname = wk(r.sheetName.split(",")[0] ?? "");
  const near = players.filter((p) => !p.deleted_at && wk(p.full_name.split(",")[0] ?? "") === surname).map((p) => p.full_name);
  console.log(`    ${r.sheetName}: same surname on file -> ${near.join("; ") || "none"}`);
}
console.log(`Off the sheet (Day 4 PM now; tee, hole and confirmation cleared, day kept): ${offSheet.map((r) => regName.get(r.registration_id)).join("; ") || "none"}`);
console.log(`On the sheet but stored as another Day 4 session (set to PM): ${wrongSession.map((r) => `${regName.get(r.registration_id)} (${r.session})`).join("; ") || "none"}`);
console.log(`Also in a Day 4 AM live group (live PM place skipped, published copy follows the sheet): ${inAm.map((r) => r.storedName).join("; ") || "nobody"}`);
console.log(`Live Day 4 PM groups now: ${pmGroups.length}; published Day 4 PM groups now: ${snap.groups.filter((g) => g.dayNumber === DAY && g.wave === "PM").length}`);

const keep = snap.groups.filter((g) => !(g.dayNumber === DAY && g.wave === "PM"));
const template = snap.groups.find((g) => g.dayNumber === DAY && g.wave === "PM");
if (!template) throw new Error("No Day 4 PM group to copy the shape from.");
const firstNumber = Math.min(...snap.groups.filter((g) => g.dayNumber === DAY && g.wave === "PM").map((g) => g.number as number));
const mode = (xs: string[]) => {
  const c = new Map<string, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};
const built = SHEET.map((g, i) => {
  const rs = g.players.map((n) => resolved.get(n) as Resolved);
  const flightId = mode(rs.map((r) => r.flightId).filter((x): x is string => Boolean(x))) ?? pmGroups[0]?.flight_id ?? null;
  return { ...g, number: firstNumber + i, rs, flightId, flight: flightId ? (flightName.get(flightId) ?? null) : (template.flight ?? null) };
});
for (const g of built) console.log(`  hole ${g.hole.padEnd(3)} #${g.number}  ${String(g.flight).padEnd(8)} ${g.players.join(" | ")}`);

const twice = new Map<string, number>();
for (const g of SHEET) for (const n of g.players) twice.set(n, (twice.get(n) ?? 0) + 1);
console.log(`Listed more than once on the sheet: ${[...twice].filter(([, c]) => c > 1).map(([n]) => n).join("; ") || "nobody"}`);

const maxDays = tournament.max_days ?? 99;
const blocked = [...resolved.values()].filter((r) => {
  if (!r.registrationId) return false;
  const mine = allDayRows.filter((d) => d.registration_id === r.registrationId);
  const existing = mine.find((d) => d.tournament_day_id === day.id);
  const others = mine.filter((d) => d.selected && d.tournament_day_id !== day.id).length;
  return !existing?.selected && others >= maxDays;
});
console.log(`Day rule (max ${maxDays}) would stop a Day 4 row for: ${blocked.map((r) => `${r.storedName} (Days ${allDayRows.filter((d) => d.registration_id === r.registrationId && d.selected).map((d) => dayNo.get(d.tournament_day_id)).sort().join(",")})`).join("; ") || "nobody"}`);

if (!apply) {
  console.log("\nPlan only. Run again with --apply to write.");
  process.exit(0);
}

mkdirSync("backups", { recursive: true });
const backupFile = join("backups", `day4-pm-final-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(backupFile, JSON.stringify({ groupsNow, membersNow, dayRows, publishedVersion: pv, draw_revision: tournament.draw_revision, published_snapshot: tournament.published_snapshot }, null, 1));
console.log(`backup written: ${backupFile}`);

for (const c of toCreate) {
  const parsed = parseName(c.sheetName);
  const inserted = await db.from("players").insert({ club_id: clubId, full_name: c.sheetName, first_name: parsed.given, last_name: parsed.surname }).select("id").single();
  fail(`Creating ${c.sheetName}`, inserted.error);
  const registration = await db
    .from("registrations")
    .insert({ club_id: clubId, tournament_id: tid, player_id: inserted.data?.id as string, status: "needs_review", reasons: ["Added from the 15 Nov 2026 Day 4 PM tee-off sheet. No handicap index or membership on file."], answers: {} })
    .select("id")
    .single();
  fail(`Registering ${c.sheetName}`, registration.error);
  c.playerId = inserted.data?.id as string;
  c.registrationId = registration.data?.id as string;
}

// A sheet player listed in a Day 4 AM group is on the final PM sheet, so the AM place is dropped
// (the player cannot be in two Day 4 groups). The published AM group loses the name too.
const amDrop = new Set(inAm.map((r) => r.registrationId as string));
const amDropIds = new Set(inAm.map((r) => r.playerId as string));
const amDropNames = new Set(inAm.map((r) => r.storedName));
if (amDrop.size) {
  const amGroupIds = amGroups.map((g) => g.id);
  fail("Removing AM places", (await db.from("group_members").delete().in("group_id", amGroupIds).in("registration_id", [...amDrop])).error);
  for (const id of amDrop) amMemberRegs.delete(id);
  for (const g of keep) {
    if (g.dayNumber !== DAY || g.wave === "PM") continue;
    const ids = (g.playerIds as string[]) ?? [];
    if (!ids.some((id) => amDropIds.has(id))) continue;
    const idx = ids.map((id, i) => (amDropIds.has(id) ? i : -1)).filter((i) => i >= 0);
    g.players = (g.players as string[]).filter((_, i) => !idx.includes(i));
    g.playerIds = ids.filter((_, i) => !idx.includes(i));
  }
  console.log(`Removed from the Day 4 AM groups (they are on the PM sheet): ${[...amDropNames].join("; ")}`);
}

const needDays = [...resolved.values()].filter((r) => {
  const mine = allDayRows.filter((d) => d.registration_id === r.registrationId);
  const existing = mine.find((d) => d.tournament_day_id === day.id);
  return !existing?.selected && mine.filter((d) => d.selected && d.tournament_day_id !== day.id).length >= maxDays;
});
let allowed = maxDays;
if (needDays.length) {
  allowed = maxDays + 1;
  fail("Raising max_days", (await db.from("tournaments").update({ max_days: allowed }).eq("id", tid)).error);
  console.log(`Setting max_days ${maxDays} -> ${allowed} so the sheet can place: ${needDays.map((r) => r.storedName).join("; ")} (the sheet is the authority, live event override)`);
}
const dayRuleBlocked: string[] = [];
for (const g of built) {
  for (const r of g.rs) {
    const mine = allDayRows.filter((d) => d.registration_id === r.registrationId);
    const existing = dayRows.find((d) => d.registration_id === r.registrationId);
    const others = mine.filter((d) => d.selected && d.tournament_day_id !== day.id).length;
    if (others >= allowed && !existing?.selected) {
      if (!dayRuleBlocked.includes(r.storedName)) dayRuleBlocked.push(r.storedName);
      continue;
    }
    const values = { session: "PM", selected: true, tee_time: `${TIME}:00`, start_hole: holeNumber(g.hole), tee_confirmed: true, wave: "A" };
    if (existing) fail(`Day 4 for ${r.storedName}`, (await db.from("registration_days").update(values).eq("id", existing.id)).error);
    else fail(`Day 4 for ${r.storedName}`, (await db.from("registration_days").insert({ registration_id: r.registrationId, tournament_day_id: day.id, ...values })).error);
  }
}
console.log(`Day rule: Day 4 row not changed for ${dayRuleBlocked.join("; ") || "nobody"}`);
for (const r of offSheet) {
  fail(`Clearing ${regName.get(r.registration_id)}`, (await db.from("registration_days").update({ tee_time: null, start_hole: null, tee_confirmed: false, wave: null }).eq("id", r.id)).error);
}

const pmIds = pmGroups.map((g) => g.id);
if (pmIds.length) {
  fail("Removing old Day 4 PM members", (await db.from("group_members").delete().in("group_id", pmIds)).error);
  fail("Removing old Day 4 PM groups", (await db.from("groups").delete().in("id", pmIds)).error);
}
const placed = new Set<string>(amMemberRegs);
for (const g of built) {
  const inserted = await db
    .from("groups")
    .insert({ club_id: clubId, tournament_id: tid, round_id: round.id, flight_id: g.flightId, number: g.number, start_hole: holeNumber(g.hole), wave: "PM", tee_time: `${TIME}:00`, locked: false })
    .select("id")
    .single();
  fail(`Group ${g.number}`, inserted.error);
  const members: Array<Record<string, unknown>> = [];
  for (const r of g.rs) {
    const regId = r.registrationId as string;
    if (placed.has(regId)) {
      console.log(`  live groups keep one place per player: ${r.storedName} is not added to the live PM group ${g.number}`);
      continue;
    }
    placed.add(regId);
    members.push({ club_id: clubId, group_id: inserted.data?.id as string, registration_id: regId, position: members.length + 1, round_id: round.id });
  }
  if (members.length) fail(`Members of group ${g.number}`, (await db.from("group_members").insert(members)).error);
}

const newPm = built.map((g) => ({
  time: TIME,
  wave: "PM",
  flight: g.flight,
  number: g.number,
  players: g.rs.map((r) => r.storedName),
  dayLabel: template.dayLabel,
  playDate: template.playDate,
  dayNumber: DAY,
  playerIds: g.rs.map((r) => r.playerId),
  startHole: holeNumber(g.hole),
}));
const finalGroups = [...keep, ...newPm];
const signature = finalGroups.map((g) => `${g.dayNumber}-${g.number}:${(g.players as string[]).join(",")}`).join("|");
const version = (pv.version as number) + 1;
const at = new Date().toISOString();
const snapshot = { ...snap, version, at, signature, groups: finalGroups };
const note = "Day 4 PM replaced with the organiser's final 15 Nov 2026 Tee-Off sheet (11:30 AM shotgun). All other groups carried over unchanged.";
fail("Publishing", (await db.from("pairings_versions").insert({ club_id: clubId, tournament_id: tid, version, snapshot, note, published_at: at })).error);
fail("Updating the live snapshot", (await db.from("tournaments").update({ published: true, published_snapshot: snapshot, draw_revision: (tournament.draw_revision as number) + 1 }).eq("id", tid)).error);
console.log(`\nDone. Published version ${version}; draw revision ${(tournament.draw_revision as number) + 1}; ${newPm.length} Day 4 PM groups.`);
