/**
 * Draws the event's draft board one playing day at a time, with the day's morning and afternoon
 * shotguns kept apart: the morning fills its own 18 holes from its own start time, the afternoon
 * does the same, and a second wave only starts when that session still has groups left.
 *
 * The app stores one board per event and its save call never names a playing day, so this writes the
 * plan out as a document instead of into `groups`. A board written per day would be merged back into
 * day one by the next desk save.
 *
 *   pnpm exec tsx scripts/generate-draft-draw.ts
 *   pnpm exec tsx scripts/generate-draft-draw.ts --out docs/draft-24th-bamboo-tee.md
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadTournamentPlayers } from "../src/lib/data/supabase/players";
import { loadTournamentRegistrations } from "../src/lib/data/supabase/registrations";
import { loadTournamentContext } from "../src/lib/data/supabase/tournaments";
import { route } from "../src/lib/routing";
import type { Group, Session } from "../src/lib/routing/types";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.");
}

/** The club's afternoon shotgun. The morning start is the event's own first tee time. */
const AFTERNOON_START = "12:30";

const outIndex = process.argv.indexOf("--out");
const outPath = outIndex === -1 ? null : process.argv[outIndex + 1];

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const club = await db.from("clubs").select("id").order("name").limit(1).maybeSingle();
if (club.error) throw new Error(`Reading the club: ${club.error.message}`);
if (!club.data) throw new Error("No club was found.");
const clubId = club.data.id;

const context = await loadTournamentContext(db, clubId);
const registrationRows = await loadTournamentRegistrations(db, clubId, context.tournament.id);
const { players } = await loadTournamentPlayers(db, clubId, registrationRows);

const days = await db
  .from("tournament_days")
  .select("id, day_number, play_date, start_time, is_playing_day")
  .eq("club_id", clubId)
  .eq("tournament_id", context.tournament.id)
  .eq("is_playing_day", true)
  .order("day_number");
if (days.error) throw new Error(`Reading the playing days: ${days.error.message}`);

const dayRows = await db
  .from("registration_days")
  .select("registration_id, tournament_day_id, session, selected")
  .eq("club_id", clubId)
  .eq("selected", true);
if (dayRows.error) throw new Error(`Reading the playing days per player: ${dayRows.error.message}`);

const playerByRegistration = new Map(registrationRows.map((row) => [row.id, row.player_id]));
const sessionByDay = new Map<string, Map<string, Session | null>>();
for (const row of dayRows.data ?? []) {
  const playerId = playerByRegistration.get(row.registration_id);
  if (!playerId) continue;
  const byPlayer = sessionByDay.get(row.tournament_day_id) ?? new Map<string, Session | null>();
  byPlayer.set(
    playerId,
    row.session === "AM" || row.session === "PM" ? (row.session as Session) : null,
  );
  sessionByDay.set(row.tournament_day_id, byPlayer);
}

const flightName = new Map(context.flights.map((flight) => [flight.id, flight.name]));
const nameById = new Map(players.map((player) => [player.id, player.name]));

let number = 0;
const drawnDays: {
  dayNumber: number;
  playDate: string;
  groups: Group[];
  warnings: string[];
  playerCount: number;
}[] = [];

for (const day of days.data ?? []) {
  const byPlayer = sessionByDay.get(day.id) ?? new Map<string, Session | null>();
  const dayPlayers = players.filter((player) => byPlayer.has(player.id));
  if (dayPlayers.length === 0) continue;
  const result = route({
    players: dayPlayers,
    config: context.config,
    tees: context.tees,
    categories: context.categories,
    flights: context.flights,
    sessions: {
      byPlayer,
      starts: {
        AM: (day.start_time ?? context.config.firstTeeTime).slice(0, 5),
        PM: AFTERNOON_START,
      },
      dayNumber: day.day_number,
    },
  }, { splitClassesAcrossWaves: true });
  // Group numbers run through the whole event, because the table holds one number per event.
  const groups = result.groups.map((group) => ({ ...group, number: (number += 1) }));
  drawnDays.push({
    dayNumber: day.day_number,
    playDate: day.play_date,
    groups,
    warnings: result.warnings,
    playerCount: dayPlayers.length,
  });
}

const lines: string[] = [];
const say = (line = "") => {
  lines.push(line);
  console.log(line);
};

say(`# ${context.tournament.name}: draft boards by playing day`);
say();
say(
  `Drawn from ${players.length} registered player(s). Nothing is published and no board was written: the desk saves one board per event, so these stay a plan until the board can be saved per playing day.`,
);
say();
say(`Morning shotgun at ${context.config.firstTeeTime}, afternoon at ${AFTERNOON_START}.`);
say();

for (const day of drawnDays) {
  const blocks = new Map<string, Group[]>();
  for (const group of day.groups) {
    const block = group.wave ?? "two-tee";
    blocks.set(block, [...(blocks.get(block) ?? []), group]);
  }
  say(`## Day ${day.dayNumber}, ${day.playDate}: ${day.playerCount} player(s)`);
  say();
  for (const [block, groups] of [...blocks].sort()) {
    const first = groups[0];
    say(`### ${block} (${first?.time}, ${groups.length} group(s))`);
    say();
    say("| Group | Hole | Class | Players |");
    say("| --- | --- | --- | --- |");
    for (const group of groups) {
      const names = group.playerIds.map((id) => nameById.get(id) ?? id).join(", ");
      say(
        `| ${group.number} | ${group.startHole} | ${flightName.get(group.flightId) ?? "Unclassified"} | ${names} |`,
      );
    }
    say();
  }
  if (day.warnings.length > 0) {
    say("Warnings:");
    for (const warning of day.warnings) say(`- ${warning}`);
    say();
  }
}

const totalGroups = drawnDays.reduce((n, day) => n + day.groups.length, 0);
const totalPlayers = drawnDays.reduce((n, day) => n + day.playerCount, 0);
console.log(`${totalGroups} group(s) over ${drawnDays.length} day(s), ${totalPlayers} player-day(s).`);
console.log("Nothing was written to the database.");

if (outPath) {
  writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`wrote ${outPath}`);
}
