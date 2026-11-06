/**
 * Runs the desk's own router over an imported field and saves the class it computes for each player.
 *
 * The importer writes who is playing and on which days. The class - category, tee, playing handicap
 * and flight - is not on the club sheet: it is computed from the handicap index by
 * `src/lib/routing`, which is also what the desk does when it loads the board. This script does the
 * same thing without a browser, so a freshly imported field is already classed before anyone opens it.
 *
 *   pnpm exec tsx scripts/classify-field.ts --dry-run    show what would be saved
 *   pnpm exec tsx scripts/classify-field.ts --apply      save it
 *
 * Only the registration columns the router owns are written. The draw is not generated or published
 * here: grouping and tee times stay an organizer decision.
 */
import { createClient } from "@supabase/supabase-js";
import { loadTournamentPlayers } from "../src/lib/data/supabase/players";
import { saveRegistrationClassifications, loadTournamentRegistrations } from "../src/lib/data/supabase/registrations";
import { loadTournamentContext } from "../src/lib/data/supabase/tournaments";
import type { Database } from "../src/lib/supabase/types";
import { type Registration, route } from "../src/lib/routing";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.");
}

const apply = process.argv.includes("--apply");
const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const club = await db.from("clubs").select("id, name").order("name").limit(1).maybeSingle();
if (club.error) throw new Error(`Reading the club: ${club.error.message}`);
if (!club.data) throw new Error("No club was found.");

const context = await loadTournamentContext(db, club.data.id);
const registrationRows = await loadTournamentRegistrations(db, club.data.id, context.tournament.id);
const { players } = await loadTournamentPlayers(db, club.data.id, registrationRows);

const result = route({
  players,
  config: context.config,
  tees: context.tees,
  categories: context.categories,
  flights: context.flights,
});

const categoryName = new Map(context.categories.map((rule) => [rule.id, rule.name]));
const flightName = new Map(context.flights.map((flight) => [flight.id, flight.name]));
const short = (map: Map<string | null, string>, id: string | null) => (id ? (map.get(id) ?? id) : "-");

const tally = new Map<string, number>();
for (const registration of result.registrations) {
  const status = registration.status;
  tally.set(status, (tally.get(status) ?? 0) + 1);
}

console.log(`${context.tournament.name} · ${players.length} player(s) on the board`);
for (const [status, n] of tally) console.log(`  ${status.padEnd(12)} ${n}`);

const byClass = new Map<string, number>();
for (const registration of result.registrations) {
  const label = `${short(categoryName, registration.categoryId)} · ${short(flightName, registration.flightId)}`;
  byClass.set(label, (byClass.get(label) ?? 0) + 1);
}
console.log("classes:");
for (const [label, n] of [...byClass].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${label.padEnd(28)} ${n}`);
}

const missing = result.registrations.filter((registration) => registration.flightId === null);
if (missing.length > 0) {
  console.log(`${missing.length} player(s) without a class:`);
  for (const registration of missing.slice(0, 12)) {
    console.log(`  ${registration.playerName}: ${registration.reasons.join(" ") || "no reason recorded"}`);
  }
  if (missing.length > 12) console.log(`  ...and ${missing.length - 12} more`);
}

if (result.warnings.length > 0) {
  console.log(`${result.warnings.length} warning(s):`);
  for (const warning of result.warnings.slice(0, 8)) console.log(`  ${warning}`);
}

const alreadyClassed = new Set(
  registrationRows
    .filter((row) => row.category_id !== null && row.flight_id !== null)
    .map((row) => row.player_id),
);
const changed = result.registrations.filter(
  (registration: Registration) => !alreadyClassed.has(registration.playerId),
);

if (!apply) {
  console.log(`would save ${changed.length} class(es); re-run with --apply`);
  process.exit(0);
}

await saveRegistrationClassifications(db, club.data.id, context.tournament.id, result.registrations);
console.log(`saved ${result.registrations.length} class(es)`);
