/**
 * Loads the 24th Bamboo Tee Day 4 (15 Nov 2026) draw from the organiser's two "Tee-Off Schedule"
 * PDFs (6:00 AM and 11:30 AM shotguns) and publishes it as the next pairings version.
 *
 * The sheet is `supabase/seed/bamboo-tee-2026-day4-sheet.psv`. It is absolute for Day 4: the
 * unpublished draft groups the engine made for Day 4 are replaced (backed up first). Days 1 to 3 are
 * carried over from the last published version unchanged.
 *
 *   node scripts/apply-day4-sheet.mjs --env <path to .env.local>            plan only (default)
 *   node scripts/apply-day4-sheet.mjs --env <path to .env.local> --apply    write, after backing up
 *
 * Options (decided by the owner, never guessed):
 *   DAY4_ALIASES="SHEET NAME=>STORED NAME;..."  a sheet name that is a known person under another spelling
 *   --add-missing                              add every still-unmatched sheet name as a new player with a
 *                                              needs_review registration (no index on file), as for Day 2 PM
 *   --raise-max-days                           set the event's max_days to 3 so nobody is left without a Day 4 row
 *
 * Plain Node, no dependencies: it talks to the project's REST API with the service key.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const addMissing = argv.includes("--add-missing");
const raiseMaxDays = argv.includes("--raise-max-days");
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

const DAY = 4;
const TIMES = { AM: "06:00", PM: "11:30" };
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest(method, path, body, prefer) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: { ...H, ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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

/** Surname-first or given-name-first, any spacing, accents plain; words sorted. */
const wk = (s) =>
  s
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");

const ALIASES = { [wk("ADORIO, RONEL")]: "ADORIO, RONNEL" };
for (const pair of (process.env.DAY4_ALIASES ?? "").split(";").filter(Boolean)) {
  const [a, b] = pair.split("=>");
  ALIASES[wk(a)] = b.trim();
}

// ---- the sheet -------------------------------------------------------------------------------
const lines = readFileSync(join("supabase", "seed", "bamboo-tee-2026-day4-sheet.psv"), "utf8").split(/\r?\n/).filter(Boolean).slice(1);
const bySlot = new Map(); // "AM|1B" -> names in slot order
for (const line of lines) {
  const [, session, hole, slot, name] = line.split("|");
  const k = `${session}|${hole}`;
  const list = bySlot.get(k) ?? [];
  list[Number(slot) - 1] = name;
  bySlot.set(k, list);
}
const order = (h) => [Number.parseInt(h, 10), h.endsWith("B") ? 1 : 0];
const sheetGroups = [];
for (const session of ["AM", "PM"]) {
  const rows = [...bySlot.entries()]
    .filter(([k]) => k.startsWith(`${session}|`))
    .map(([k, names]) => ({ session, hole: k.split("|")[1], names: names.filter(Boolean) }))
    .sort((a, b) => order(a.hole)[0] - order(b.hole)[0] || order(a.hole)[1] - order(b.hole)[1]);
  for (const r of rows) sheetGroups.push({ ...r, startHole: Number.parseInt(r.hole, 10) });
}
const playersOnSheet = sheetGroups.reduce((n, g) => n + g.names.length, 0);
console.log(`Sheet: ${sheetGroups.length} groups, ${playersOnSheet} players (AM ${sheetGroups.filter((g) => g.session === "AM").length} groups at ${TIMES.AM}, PM ${sheetGroups.filter((g) => g.session === "PM").length} at ${TIMES.PM}).`);

// ---- live state ------------------------------------------------------------------------------
const [t] = await get("tournaments?select=*&name=eq.24th%20Bamboo%20Tee");
if (!t) throw new Error("Tournament not found.");
const eventDays = await get(`tournament_days?select=id,day_number,play_date,label&tournament_id=eq.${t.id}`);
const day = eventDays.find((d) => d.day_number === DAY);
const dayNo = new Map(eventDays.map((d) => [d.id, d.day_number]));
const [round] = await get(`competition_rounds?select=id,day_number,status&tournament_id=eq.${t.id}&day_number=eq.${DAY}`);
if (!day || !round) throw new Error("Day 4 or its round is missing.");
const players = await getAll(`players?select=id,full_name,deleted_at&club_id=eq.${t.club_id}`);
const regs = await getAll(`registrations?select=id,player_id,status,flight_id&tournament_id=eq.${t.id}`);
const regOf = new Map(regs.map((r) => [r.player_id, r]));
const flights = await get("flights?select=id,name");
const flightName = new Map(flights.map((f) => [f.id, f.name]));
const allDays = await getAll(
  `registration_days?select=id,registration_id,tournament_day_id,selected,session,tee_time,start_hole,tee_confirmed,wave&tournament_day_id=in.(${eventDays.map((d) => d.id).join(",")})`,
);
const dayRowsOf = (regId) => allDays.filter((d) => d.registration_id === regId);
const liveGroups = await getAll(`groups?select=*&tournament_id=eq.${t.id}`);
const day4Groups = liveGroups.filter((g) => g.round_id === round.id);
const day4Members = await getAll(`group_members?select=*&round_id=eq.${round.id}`);
const [pv] = await get(`pairings_versions?select=*&tournament_id=eq.${t.id}&order=version.desc&limit=1`);
const snap = pv.snapshot;
const scorecards = await get(`scorecards?select=id&round_id=eq.${round.id}&limit=1`);
console.log(`Latest published version ${pv.version} (${snap.groups.length} groups; Day 4 in it: ${snap.groups.filter((g) => g.dayNumber === DAY).length}). Day 4 live draft groups: ${day4Groups.length} with ${day4Members.length} members. Day 4 scorecards: ${scorecards.length}.`);
if (scorecards.length) throw new Error("Day 4 already has scorecards; refusing to replace its groups.");

// ---- resolve names ---------------------------------------------------------------------------
const resolved = new Map();
const problems = [];
for (const g of sheetGroups) {
  for (const sheetName of g.names) {
    if (resolved.has(sheetName)) continue;
    const target = ALIASES[wk(sheetName)] ?? sheetName;
    const hits = players.filter((p) => !p.deleted_at && wk(p.full_name) === wk(target));
    if (hits.length !== 1) {
      const surname = wk(sheetName.split(",")[0]);
      const near = players.filter((p) => !p.deleted_at && wk(p.full_name.split(",")[0]) === surname).map((p) => `${p.full_name}${regOf.has(p.id) ? "" : " (no registration)"}`);
      problems.push({ sheetName, why: hits.length === 0 ? "no match" : `${hits.length} matches`, near });
      continue;
    }
    const reg = regOf.get(hits[0].id);
    if (!reg) {
      problems.push({ sheetName, why: "in the directory, not registered for this event", near: [hits[0].full_name], player: hits[0] });
      continue;
    }
    resolved.set(sheetName, { player: hits[0], reg });
  }
}
console.log(`\nResolved ${resolved.size} of ${new Set(sheetGroups.flatMap((g) => g.names)).size} names.`);
for (const p of problems) console.log(`  NOT RESOLVED: ${p.sheetName} (${p.why}); same surname on file: ${p.near.join("; ") || "none"}`);

// ---- day rule and status ---------------------------------------------------------------------
const maxDays = raiseMaxDays ? 3 : (t.max_days ?? 99);
const blocked = [];
const nonOk = [];
for (const [name, { reg }] of resolved) {
  const rows = dayRowsOf(reg.id);
  const elsewhere = rows.filter((r) => r.selected && r.tournament_day_id !== day.id).map((r) => dayNo.get(r.tournament_day_id)).sort();
  const has4 = rows.find((r) => r.tournament_day_id === day.id);
  if (!has4?.selected && elsewhere.length >= maxDays) blocked.push(`${name} (Day ${elsewhere.join(" and ")})`);
  if (reg.status !== "ok" && reg.status !== "confirmed") nonOk.push(`${name} (${reg.status})`);
}
console.log(`\nDay rule (max ${maxDays}) would stop a Day 4 selection for: ${blocked.join("; ") || "nobody"}`);
console.log(`Registrations that are not confirmed: ${nonOk.join("; ") || "none"}`);
const sheetRegIds = new Set([...resolved.values()].map((r) => r.reg.id));
const sel4 = allDays.filter((r) => r.tournament_day_id === day.id && r.selected);
console.log(`Registered for Day 4 now: ${sel4.length}; of those on the sheet: ${sel4.filter((r) => sheetRegIds.has(r.registration_id)).length}; not on the sheet: ${sel4.filter((r) => !sheetRegIds.has(r.registration_id)).length}`);

// ---- build groups ----------------------------------------------------------------------------
const mode = (xs) => {
  const c = new Map();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};
const built = sheetGroups.map((g, i) => {
  const rs = g.names.map((n) => resolved.get(n));
  const known = rs.filter(Boolean);
  const flightId = mode(known.map((r) => r.reg.flight_id).filter(Boolean)) ?? day4Groups[0]?.flight_id;
  return { ...g, number: i + 1, rs, flightId, flight: flightName.get(flightId) ?? null };
});
console.log(`\nDay 4 groups would be numbered 1 to ${built.length} (AM first, then PM, as Day 3 is).`);
for (const g of built) console.log(`  ${g.session} hole ${g.hole.padEnd(3)} #${String(g.number).padStart(2)} ${String(g.flight).padEnd(8)} ${g.names.join(" | ")}`);

const seenOnce = new Map();
for (const g of built) for (const n of g.names) seenOnce.set(n, [...(seenOnce.get(n) ?? []), `${g.session} hole ${g.hole}`]);
const twice = [...seenOnce.entries()].filter(([, w]) => w.length > 1);
console.log(`Listed more than once on the sheet: ${twice.map(([n, w]) => `${n} (${w.join(" and ")})`).join("; ") || "nobody"}`);

if (problems.length && !addMissing) {
  console.log("\nStopping: resolve the names above (DAY4_ALIASES, or --add-missing) first.");
  process.exit(apply ? 1 : 0);
}
if (problems.length && addMissing) console.log(`\n--add-missing: ${problems.map((p) => p.sheetName).join("; ")} would be added as needs_review players.`);
if (!apply) {
  console.log("\nPlan only. Run again with --apply to write.");
  process.exit(0);
}
if (snap.groups.some((g) => g.dayNumber === DAY)) throw new Error("Day 4 is already published; refusing to overwrite.");

// ---- back up, then write ---------------------------------------------------------------------
mkdirSync("backups", { recursive: true });
const backup = join("backups", `day4-sheet-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(backup, JSON.stringify({ tournament: t, publishedVersion: pv, day4Groups, day4Members, day4Rows: allDays.filter((r) => r.tournament_day_id === day.id) }, null, 1));
console.log(`backup written: ${backup}`);

if (raiseMaxDays) await rest("PATCH", `tournaments?id=eq.${t.id}`, { max_days: 3 });

// New players for names that stay unmatched (owner chose --add-missing). No index is invented.
if (addMissing) {
  for (const p of problems) {
    if (p.player) continue;
    const [surname, ...rest_] = p.sheetName.split(",");
    const given = rest_.join(",").trim();
    const [np] = await rest("POST", "players", { club_id: t.club_id, full_name: p.sheetName, first_name: given || null, last_name: surname.trim() }, "return=representation");
    const [nr] = await rest(
      "POST",
      "registrations",
      { club_id: t.club_id, tournament_id: t.id, player_id: np.id, status: "needs_review", reasons: ["Added from the 15 Nov 2026 Day 4 tee-off schedule. No handicap index or membership on file."], answers: {} },
      "return=representation",
    );
    resolved.set(p.sheetName, { player: np, reg: nr });
  }
  for (const g of built) g.rs = g.names.map((n) => resolved.get(n));
}

// Day 4 selections: on the sheet get their session, hole and time; off the sheet keep the day but lose the tee.
const onSheet = new Map();
for (const g of built) for (const r of g.rs) if (!onSheet.has(r.reg.id)) onSheet.set(r.reg.id, g);
for (const [regId, g] of onSheet) {
  const rows = dayRowsOf(regId);
  const has4 = rows.find((r) => r.tournament_day_id === day.id);
  const others = rows.filter((r) => r.selected && r.tournament_day_id !== day.id).length;
  if (!has4?.selected && others >= maxDays) continue;
  const values = { session: g.session, selected: true, tee_time: `${TIMES[g.session]}:00`, start_hole: g.startHole, tee_confirmed: true, wave: "A" };
  if (has4) await rest("PATCH", `registration_days?id=eq.${has4.id}`, values);
  else await rest("POST", "registration_days", { club_id: t.club_id, registration_id: regId, tournament_day_id: day.id, ...values });
}
for (const r of sel4.filter((x) => !sheetRegIds.has(x.registration_id))) {
  await rest("PATCH", `registration_days?id=eq.${r.id}`, { tee_time: null, start_hole: null, tee_confirmed: false, wave: null });
}

// Live groups: the Day 4 drafts go (they are in the backup), the sheet's groups come in.
if (day4Groups.length) {
  await rest("DELETE", `group_members?round_id=eq.${round.id}`);
  await rest("DELETE", `groups?round_id=eq.${round.id}`);
}
// One group per player per day in the database. A player the sheet lists twice keeps the first
// place in the live groups; the published copy below still follows the sheet exactly.
const placed = new Set();
for (const g of built) {
  const [row] = await rest(
    "POST",
    "groups",
    { club_id: t.club_id, tournament_id: t.id, round_id: round.id, flight_id: g.flightId, number: g.number, start_hole: g.startHole, wave: null, tee_time: `${TIMES[g.session]}:00`, locked: false },
    "return=representation",
  );
  const members = [];
  for (const r of g.rs) {
    if (placed.has(r.reg.id)) {
      console.log(`  listed twice on the sheet, live groups keep the first place only: ${r.player.full_name} (also ${g.session} hole ${g.hole})`);
      continue;
    }
    placed.add(r.reg.id);
    members.push({ club_id: t.club_id, group_id: row.id, registration_id: r.reg.id, position: members.length + 1, round_id: round.id });
  }
  if (members.length) await rest("POST", "group_members", members);
}

// Publish the next version: everything already published is carried over unchanged.
const newGroups = built.map((g) => ({
  time: TIMES[g.session],
  wave: g.session,
  flight: g.flight,
  number: g.number,
  players: g.rs.map((r) => r.player.full_name),
  dayLabel: day.label,
  playDate: day.play_date,
  dayNumber: DAY,
  playerIds: g.rs.map((r) => r.player.id),
  startHole: g.startHole,
}));
const finalGroups = [...snap.groups, ...newGroups];
const signature = finalGroups.map((g) => `${g.dayNumber}-${g.number}:${g.players.join(",")}`).join("|");
const version = pv.version + 1;
const at = new Date().toISOString();
const snapshot = { ...snap, version, at, signature, groups: finalGroups };
await rest("POST", "pairings_versions", {
  club_id: t.club_id,
  tournament_id: t.id,
  version,
  snapshot,
  note: "Day 4 added from the organiser's 15 Nov 2026 Tee-Off Schedules (6:00 AM and 11:30 AM shotguns). Days 1 to 3 carried over unchanged.",
  published_at: at,
});
await rest("PATCH", `tournaments?id=eq.${t.id}`, { published: true, published_snapshot: snapshot, draw_revision: t.draw_revision + 1 });
console.log(`\nDone. Published version ${version}; draw revision ${t.draw_revision + 1}; ${newGroups.length} Day 4 groups.`);
