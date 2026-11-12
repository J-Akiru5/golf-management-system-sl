/**
 * Brings the player directory in line with the club's 24th Bamboo Tee sheet, names only.
 *
 * What it does, and nothing else:
 *   1. Rewrites a player's name as "SURNAME, GIVEN" (the sheet's spelling, accents kept) when the
 *      stored name has the same words in another order, case or spacing.
 *   2. Renames the few near matches the owner confirmed one by one (see OVERRIDES).
 *   3. Restores a retired player the owner asked for, and retires the empty duplicates.
 *   4. Adds the players who are on the sheet but not in the directory, with their schedule.
 *
 * What it never touches: groups, group members, the published snapshot, the draw revision, the
 * publish views, or any existing registration. Before and after a real run it fingerprints all of
 * those and stops with an error if anything differs, so a rename cannot move a published pairing.
 *
 *   pnpm exec tsx scripts/fix-player-names.ts "<sheet.xlsx>"           plan only (the default)
 *   pnpm exec tsx scripts/fix-player-names.ts "<sheet.xlsx>" --apply   write, after backing up
 *
 * Names on the sheet that look misspelled are left exactly as they are stored: a rename needs the
 * same letters (accents aside) unless the owner confirmed it in OVERRIDES.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { parseName, searchKey, tidyName } from "../src/lib/names";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.");
}
const sheetPath = process.argv[2];
if (!sheetPath || sheetPath.startsWith("--")) {
  throw new Error('Give the sheet: tsx scripts/fix-player-names.ts "<sheet.xlsx>" [--apply]');
}
const apply = process.argv.includes("--apply");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/** Owner decisions, 2026-11-13. Each one names the sheet cell it answers. */
const OVERRIDES = {
  /** Sheet cell -> the stored name it is the same person as, and the spelling to end up with. */
  rename: [
    { sheet: "CAPARROS, MARVIN", from: "CAPAROS, MARVIN", to: "CAPARROS, MARVIN" },
    { sheet: "MIN, HYANG GEE", from: "Min Hyanggee", to: "MIN, HYANG GEE" },
    // The owner corrected the sheet: it is ARRIANE, as the NGAP record has it.
    { sheet: "CAMOT, ARIANNE", from: "Arriane Camot", to: "CAMOT, ARRIANE" },
    { sheet: "LIM, APOY", from: "Adoy Lim", to: "LIM, APOY" },
  ],
  /** Same person as a stored name; the stored spelling stays. */
  keep: [{ sheet: "MANGALINDAN, VIC", stored: "MANGALINDAN, VICTOR" }],
  /** A retired player the owner asked to bring back. */
  restore: ["ARENAS, BUNNY"],
  /** Empty duplicates the owner asked to remove (retired, not deleted). Matched by stored name. */
  retire: ["Youn Smith", "Ira Alquiros", "Dennis Superfacial"],
  /** On the sheet, a different person from anyone stored: add them. */
  create: [
    "JARDELEZA, BART",
    "VILLO, IOLO ANGELO",
    "GUANZON, PAULO",
    "JUNSAY, MELVIN",
    "BENEDICTO, ANDIE",
    "BAYLON, LOUISE",
    "GURREA, FELMAN",
  ],
} as const;

interface SheetRow {
  no: number;
  role: "member" | "guest";
  raw: string;
  name: string;
  index: number | null;
  schedule: { day: number; session: "AM" | "PM" }[];
}

const wordsKey = (name: string) => searchKey(name).split(" ").filter(Boolean).sort().join(" ");

async function readSheet(): Promise<SheetRow[]> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(sheetPath as string);
  const sheet = book.worksheets[0];
  if (!sheet) throw new Error("The workbook has no sheet.");
  const rows: SheetRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 9) return;
    const values = row.values as unknown[];
    const no = values[1];
    if (typeof no !== "number") return;
    const cell = (c: number): unknown => {
      const value = values[c];
      if (value && typeof value === "object") {
        const v = value as { text?: unknown; result?: unknown };
        return v.text ?? v.result ?? "";
      }
      return value;
    };
    for (const [role, n, i, s] of [
      ["member", 2, 3, 4],
      ["guest", 5, 6, 7],
    ] as const) {
      const raw = String(cell(n) ?? "").trim();
      if (!raw) continue;
      const indexCell = cell(i);
      const index =
        typeof indexCell === "number"
          ? indexCell
          : Number.isFinite(Number.parseFloat(String(indexCell ?? "")))
            ? Number.parseFloat(String(indexCell))
            : null;
      const schedule = [...String(cell(s) ?? "").matchAll(/DAY\s*(\d)\s*(AM|PM)/gi)].map((m) => ({
        day: Number(m[1]),
        session: (m[2] ?? "AM").toUpperCase() as "AM" | "PM",
      }));
      rows.push({ no, role, raw, name: tidyName(raw), index, schedule });
    }
  });
  return rows;
}

type Row = Record<string, unknown> & { id: string; full_name: string };

async function all(table: string, filter?: (q: ReturnType<typeof db.from>) => unknown) {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const base = db.from(table).select("*").range(from, from + 999);
    const result = (await (filter ? (filter(base as never) as typeof base) : base)) as {
      data: Record<string, unknown>[] | null;
      error: { message: string } | null;
    };
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
    out.push(...(result.data ?? []));
    if ((result.data ?? []).length < 1000) break;
  }
  return out;
}

const stable = (value: unknown): string =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
const hash = (value: unknown) => createHash("sha256").update(stable(value)).digest("hex").slice(0, 16);

const event = await db
  .from("tournaments")
  .select("*")
  .ilike("name", "%bamboo%")
  .order("play_date", { ascending: false })
  .limit(1)
  .maybeSingle();
if (event.error || !event.data) throw new Error(`Reading the event: ${event.error?.message}`);
const tournament = event.data as Record<string, unknown> & { id: string; club_id: string };
const clubId = tournament.club_id;

/** Everything a rename must leave exactly as it is. */
async function fingerprint(existingPlayerIds: Set<string>) {
  const t = (await db.from("tournaments").select("*").eq("id", tournament.id).single()).data as Record<
    string,
    unknown
  >;
  const groups = await all("groups", (q) => (q as never as { eq: (a: string, b: string) => unknown }).eq("tournament_id", tournament.id));
  const members = await all("group_members");
  const regs = (await all("registrations", (q) => (q as never as { eq: (a: string, b: string) => unknown }).eq("tournament_id", tournament.id))).filter(
    (r) => existingPlayerIds.has(String(r.player_id)),
  );
  const parts = {
    snapshot: hash(t.published_snapshot),
    published: t.published,
    draw_revision: t.draw_revision,
    publish_views: hash(t.publish_views),
    groups: `${groups.length}:${hash(groups)}`,
    group_members: `${members.length}:${hash(members)}`,
    registrations_before: `${regs.length}:${hash(regs)}`,
  };
  return parts;
}

const sheet = await readSheet();
const players = (await all("players", (q) => (q as never as { eq: (a: string, b: string) => unknown }).eq("club_id", clubId))) as Row[];
const registrations = await all("registrations", (q) => (q as never as { eq: (a: string, b: string) => unknown }).eq("tournament_id", tournament.id));
const registered = new Set(registrations.map((r) => String(r.player_id)));
const gm = await all("group_members");
const regById = new Map(registrations.map((r) => [String(r.id), r]));
const inGroups = new Set(
  gm.map((g) => String(regById.get(String(g.registration_id))?.player_id ?? "")).filter(Boolean),
);
const existingIds = new Set(players.map((p) => p.id));

const isRetired = (p: Row) => p.deleted_at !== null && p.deleted_at !== undefined;
const byName = (name: string) => players.filter((p) => p.full_name === name);

interface Rename {
  id: string;
  from: string;
  to: string;
  why: string;
}
const renames: Rename[] = [];
const notes: string[] = [];
const retire: { id: string; name: string }[] = [];
const restore: { id: string; name: string }[] = [];
const create: SheetRow[] = [];
const claimed = new Set<string>();

const overrideSheet = new Set<string>([
  ...OVERRIDES.rename.map((o) => o.sheet),
  ...OVERRIDES.keep.map((o) => o.sheet),
  ...OVERRIDES.create,
]);
const overrideKey = new Set([...overrideSheet].map((s) => tidyName(s)));

// 1. Owner-confirmed near matches.
for (const o of OVERRIDES.rename) {
  const hits = byName(o.from);
  if (hits.length !== 1 || !hits[0]) throw new Error(`Expected one "${o.from}", found ${hits.length}.`);
  renames.push({ id: hits[0].id, from: hits[0].full_name, to: o.to, why: `owner: ${o.sheet}` });
  claimed.add(hits[0].id);
}
for (const o of OVERRIDES.keep) {
  const hits = byName(o.stored);
  if (hits.length !== 1 || !hits[0]) throw new Error(`Expected one "${o.stored}", found ${hits.length}.`);
  claimed.add(hits[0].id);
  notes.push(`kept as stored: ${o.stored} (sheet says ${o.sheet})`);
}

// 2. Restores.
for (const name of OVERRIDES.restore) {
  const hits = byName(name);
  if (hits.length !== 1 || !hits[0]) throw new Error(`Expected one "${name}", found ${hits.length}.`);
  const p = hits[0];
  if (isRetired(p)) restore.push({ id: p.id, name });
  claimed.add(p.id);
}

// 3. Retirements: the owner named them, and each must be empty.
for (const name of OVERRIDES.retire) {
  const hits = byName(name).filter((p) => !isRetired(p));
  if (hits.length !== 1 || !hits[0]) throw new Error(`Expected one active "${name}", found ${hits.length}.`);
  const p = hits[0];
  if (registered.has(p.id) || inGroups.has(p.id) || p.user_id || p.photo_path) {
    throw new Error(`${name} is not an empty duplicate (registration, group, account or photo). Stopping.`);
  }
  retire.push({ id: p.id, name });
  claimed.add(p.id);
}

// 4. Sheet rows matched by the same words: write the sheet's form.
const retiringIds = new Set(retire.map((r) => r.id));
for (const row of sheet) {
  if (overrideSheet.has(row.raw) || overrideKey.has(row.name)) continue;
  const key = wordsKey(row.raw);
  const hits = players.filter(
    (p) => wordsKey(p.full_name) === key && !retiringIds.has(p.id) && (!isRetired(p) || restore.some((r) => r.id === p.id)),
  );
  if (hits.length === 0) {
    notes.push(`not in the directory, not covered by a decision: ${row.no}${row.role[0]} ${row.name}`);
    continue;
  }
  if (hits.length > 1) {
    notes.push(`more than one record for ${row.name}: ${hits.map((h) => h.id.slice(0, 8)).join(", ")}; left alone`);
    continue;
  }
  const p = hits[0] as Row;
  if (claimed.has(p.id)) continue;
  claimed.add(p.id);
  if (p.full_name !== row.name) {
    renames.push({ id: p.id, from: p.full_name, to: row.name, why: "same words, club form" });
  }
}

// 5. New players. Their sheet days must be playing days of this event.
const dayRows = await db
  .from("tournament_days")
  .select("id, day_number, play_date, is_playing_day")
  .eq("tournament_id", tournament.id)
  .eq("club_id", clubId);
if (dayRows.error) throw new Error(`Reading the playing days: ${dayRows.error.message}`);
const days = new Map<number, { id: string; date: string }>();
for (const d of dayRows.data ?? []) if (d.is_playing_day) days.set(d.day_number, { id: d.id, date: d.play_date });
const teamOf = (r: Record<string, unknown>) => (r.answers as { teamNo?: number } | null)?.teamNo;
const nameOfPlayer = new Map(players.map((p) => [p.id, p.full_name]));
/**
 * The pair number from the sheet is used only when it is free, or when the one entry already on it
 * is this player's partner on the sheet. Otherwise the player is added without a pair number, so
 * nobody is put into someone else's pair.
 */
function pairFor(row: SheetRow): number | null {
  const holders = registrations.filter((r) => teamOf(r) === row.no);
  if (holders.length === 0) return row.no;
  const partner = sheet.find((s) => s.no === row.no && s.role !== row.role);
  if (holders.length === 1 && partner) {
    const holderName = nameOfPlayer.get(String(holders[0]?.player_id)) ?? "";
    if (wordsKey(holderName) === wordsKey(partner.raw)) return row.no;
  }
  return null;
}
for (const raw of OVERRIDES.create) {
  const row = sheet.find((r) => r.raw.replace(/\s*,\s*/g, ", ") === raw || r.name === raw);
  if (!row) throw new Error(`"${raw}" is not on the sheet.`);
  if (players.some((p) => wordsKey(p.full_name) === wordsKey(raw) && !isRetired(p))) {
    throw new Error(`"${raw}" is already in the directory.`);
  }
  const required = Number(tournament.required_days ?? row.schedule.length);
  if (row.schedule.length !== required) {
    throw new Error(`${raw}: the sheet gives ${row.schedule.length} day(s) and the event needs ${required}.`);
  }
  for (const s of row.schedule) {
    if (!days.has(s.day)) throw new Error(`${raw}: Day ${s.day} is not a playing day of this event.`);
  }
  create.push(row);
}

// Report ---------------------------------------------------------------------------------------
const label = (p: Row) =>
  `${p.full_name}${registered.has(p.id) ? " [reg]" : ""}${inGroups.has(p.id) ? " [grp]" : ""}`;
console.log(`${tournament.name} · ${players.length} players · ${sheet.length} sheet names`);
console.log(`\nRENAME ${renames.length}`);
for (const r of renames) console.log(`  ${JSON.stringify(r.from)} -> ${JSON.stringify(r.to)}   (${r.why})`);
console.log(`\nRESTORE ${restore.length}: ${restore.map((r) => r.name).join(", ") || "-"}`);
console.log(`RETIRE ${retire.length}: ${retire.map((r) => r.name).join(", ") || "-"}`);
console.log(`\nCREATE ${create.length}`);
for (const r of create) {
  console.log(
    `  ${r.name} · ${r.role} · index ${r.index ?? "blank"} · ${r.schedule.map((s) => `Day ${s.day} ${s.session}`).join(" & ")} · ${pairFor(r) === null ? `no pair number (${r.no} belongs to other entries)` : `joins pair ${r.no}`}`,
  );
}
console.log(`\nNOTES ${notes.length}`);
for (const n of notes) console.log(`  ${n}`);
for (const wanted of ["BUÑI, GERRY", "SEBASTIAN, BUTCH", "ALAS-AS, FRED"]) {
  const found = players.filter((p) => wordsKey(p.full_name) === wordsKey(wanted));
  console.log(`  check ${wanted}: ${found.map(label).join(" | ") || "NOT IN DIRECTORY"}`);
}

if (!apply) {
  console.log("\nPlan only. Nothing was written. Add --apply to write.");
  process.exit(0);
}

// Apply ----------------------------------------------------------------------------------------
const before = await fingerprint(existingIds);
console.log("\nfingerprint before", before);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(join(process.cwd(), "backups"), { recursive: true });
const touched = new Set([...renames.map((r) => r.id), ...restore.map((r) => r.id), ...retire.map((r) => r.id)]);
const backupFile = join(process.cwd(), "backups", `player-names-${stamp}.json`);
writeFileSync(
  backupFile,
  JSON.stringify(
    { takenAt: new Date().toISOString(), before, players: players.filter((p) => touched.has(p.id)) },
    null,
    1,
  ),
);
console.log(`backup written: ${backupFile}`);

function fail(where: string, error: { message: string } | null): void {
  if (error) throw new Error(`${where}: ${error.message}`);
}

for (const r of renames) {
  const parsed = parseName(r.to);
  const { error } = await db
    .from("players")
    .update({ full_name: r.to, first_name: parsed.given || null, last_name: parsed.surname || null })
    .eq("club_id", clubId)
    .eq("id", r.id);
  fail(`Renaming ${r.from}`, error);
}
for (const r of restore) {
  const { error } = await db
    .from("players")
    .update({ active: true, deleted_at: null })
    .eq("club_id", clubId)
    .eq("id", r.id);
  fail(`Restoring ${r.name}`, error);
}
for (const r of retire) {
  const { error } = await db
    .from("players")
    .update({ active: false, deleted_at: new Date().toISOString() })
    .eq("club_id", clubId)
    .eq("id", r.id);
  fail(`Retiring ${r.name}`, error);
}

const createdIds: string[] = [];
for (const row of create) {
  const parsed = parseName(row.name);
  const inserted = await db
    .from("players")
    .insert({ club_id: clubId, full_name: row.name, first_name: parsed.given, last_name: parsed.surname })
    .select("id")
    .single();
  fail(`Creating ${row.name}`, inserted.error);
  const playerId = inserted.data?.id as string;
  createdIds.push(playerId);

  fail(
    `Membership for ${row.name}`,
    (await db.from("player_memberships").insert({ club_id: clubId, player_id: playerId, membership_type: row.role })).error,
  );
  fail(
    `Handicap record for ${row.name}`,
    (
      await db.from("handicap_records").upsert(
        {
          club_id: clubId,
          player_id: playerId,
          handicap_index: row.index,
          effective_date: tournament.cutoff_date,
          source: row.index === null ? "manual" : "ngap_import",
        },
        { onConflict: "player_id,effective_date" },
      )
    ).error,
  );

  const teePreferences: Record<string, string> = {};
  for (const s of row.schedule) {
    const day = days.get(s.day);
    if (!day) throw new Error(`${row.name}: Day ${s.day} is not a playing day of this event.`);
    teePreferences[day.date] = s.session;
  }
  const reasons = row.index === null ? ["No index on the club sheet; none was recorded."] : [];
  const registration = await db
    .from("registrations")
    .upsert(
      {
        club_id: clubId,
        tournament_id: tournament.id,
        player_id: playerId,
        frozen_index: row.index,
        status: "ok",
        membership_type: row.role,
        reasons,
        answers: pairFor(row) === null ? { teePreferences } : { teamNo: row.no, teePreferences },
      },
      { onConflict: "tournament_id,player_id" },
    )
    .select("id")
    .single();
  fail(`Registering ${row.name}`, registration.error);
  const registrationId = registration.data?.id as string;
  for (const session of ["AM", "PM"] as const) {
    const ids = row.schedule
      .filter((s) => s.session === session)
      .map((s) => days.get(s.day)?.id)
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) continue;
    fail(
      `The ${session} day for ${row.name}`,
      (
        await db
          .from("registration_days")
          .update({ session, selected: true })
          .eq("registration_id", registrationId)
          .in("tournament_day_id", ids)
      ).error,
    );
  }
}

const after = await fingerprint(existingIds);
console.log("fingerprint after ", after);
const changed = (Object.keys(before) as (keyof typeof before)[]).filter((k) => before[k] !== after[k]);
if (changed.length > 0) {
  throw new Error(`PUBLISHED STATE CHANGED: ${changed.join(", ")}. Restore from ${backupFile}.`);
}
console.log(`\nDone. ${renames.length} renamed, ${restore.length} restored, ${retire.length} retired, ${createdIds.length} added.`);
console.log("Groups, group members, snapshot, draw revision, publish views and existing registrations are identical.");
