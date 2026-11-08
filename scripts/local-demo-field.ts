/**
 * Runs the demo on the club's real Bamboo Tee field, on this machine only (issue 195).
 *
 * It reads the sheet already kept as data in supabase/seed/bamboo-tee-2026-field.psv and writes one
 * line, NEXT_PUBLIC_DEMO_FIELD, into .env.local. That file is ignored by git and is never deployed,
 * so the real names and indexes stay out of the repository's code and out of the site's published
 * scripts. Restart the dev server afterwards: the variable is read when the app is built.
 *
 *   pnpm exec tsx scripts/local-demo-field.ts          write the line
 *   pnpm exec tsx scripts/local-demo-field.ts --remove take it out again
 *
 * It prints counts, never names. Other lines in .env.local are kept exactly as they are.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LocalFieldRow } from "../src/lib/demo/field-seed";
import {
  MAX_READABLE_INDEX,
  type FieldPlayer,
  parseFieldSheet,
} from "../src/lib/seed/bamboo-tee-field";

const KEY = "NEXT_PUBLIC_DEMO_FIELD";
const ENV_FILE = join(process.cwd(), ".env.local");

const keepOtherLines = (): string[] =>
  existsSync(ENV_FILE)
    ? readFileSync(ENV_FILE, "utf8")
        .split(/\r?\n/)
        .filter((line) => !line.startsWith(`${KEY}=`))
    : [];

function writeEnv(lines: string[]) {
  const text = `${lines.join("\n").replace(/\n+$/, "")}\n`;
  writeFileSync(ENV_FILE, text.trim() === "" ? "" : text, "utf8");
}

if (process.argv.includes("--remove")) {
  writeEnv(keepOtherLines());
  console.log(`Removed ${KEY} from .env.local. Restart the dev server.`);
  process.exit(0);
}

const sheet = readFileSync(
  join(process.cwd(), "supabase", "seed", "bamboo-tee-2026-field.psv"),
  "utf8",
);
const pairs = parseFieldSheet(sheet);

let noSchedule = 0;
let unreadableIndex = 0;
const rows: LocalFieldRow[] = [];

const add = (player: FieldPlayer, role: "member" | "guest", pair: number) => {
  // A player whose schedule could not be read has no days to draw. Without days the app reads
  // "plays every day", which would put them on every board, so they are left out of the demo.
  if (player.schedule.length === 0) {
    noSchedule += 1;
    return;
  }
  let index = player.index;
  if (index !== null && (index < -10 || index > MAX_READABLE_INDEX)) {
    unreadableIndex += 1;
    index = null;
  }
  const sessions: Record<string, "AM" | "PM"> = {};
  for (const entry of player.schedule) sessions[String(entry.day)] = entry.session;
  rows.push({
    name: player.name.replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ").trim(),
    index,
    pair,
    role,
    days: [...new Set(player.schedule.map((entry) => entry.day))],
    sessions,
  });
};

for (const pair of pairs) {
  add(pair.member, "member", pair.number);
  add(pair.guest, "guest", pair.number);
}

const encoded = Buffer.from(JSON.stringify(rows), "utf8").toString("base64");
writeEnv([...keepOtherLines(), `${KEY}=${encoded}`]);

const perDay = new Map<string, number>();
for (const row of rows) {
  for (const day of row.days) {
    const session = row.sessions[String(day)] ?? "none";
    const key = `day ${day} ${session}`;
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
}

console.log(`Wrote ${KEY} to .env.local (${rows.length} players from ${pairs.length} pairs).`);
console.log(`Left out: ${noSchedule} with no readable schedule. Blanked: ${unreadableIndex} unreadable index.`);
for (const [key, count] of [...perDay.entries()].sort()) console.log(`  ${key}: ${count}`);
console.log("Restart the dev server to load it. Run with --remove to undo.");
