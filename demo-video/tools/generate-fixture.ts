/**
 * Generates the frozen board and published snapshot used by the AVP demo.
 *
 * This is a throwaway-branch tool: it runs the real engine over the demo seed once, then writes the
 * result as JSON. The app loads that JSON on this branch only, so every recording starts from the same
 * populated screens. It is not part of the product.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { DEMO_TEES } from "@/lib/demo/data";
import { route } from "@/lib/routing";
import {
  activeTournament,
  buildPublished,
  initialState,
  routingInputFor,
} from "@/lib/store/state";

const state = initialState();
const tournament = activeTournament(state);
if (!tournament) throw new Error("the demo seed has no active tournament");

const input = routingInputFor(state);
if (!input) throw new Error("the demo seed produced no routing input");

const result = route(input);
if (result.groups.length === 0) throw new Error("the engine produced no groups");

// Lock two groups so the draw screen shows the lock state without scripted clicks.
const locked = new Set([3, 7]);
const draw = result.groups.map((group) => ({ ...group, locked: locked.has(group.number) }));
const published = buildPublished(draw, state.players, tournament, "2026-11-01T09:00:00+08:00");

mkdirSync("demo-video/fixtures", { recursive: true });
writeFileSync("demo-video/fixtures/bamboo-tee-draw.json", `${JSON.stringify(draw, null, 2)}\n`);
writeFileSync(
  "demo-video/fixtures/bamboo-tee-published.json",
  `${JSON.stringify(published, null, 2)}\n`,
);

console.log(
  JSON.stringify(
    {
      tournament: tournament.name,
      groups: draw.length,
      players: draw.reduce((sum, group) => sum + group.playerIds.length, 0),
      warnings: result.warnings.length,
      teeCount: DEMO_TEES.length,
      publishedGroups: published.groups.length,
    },
    null,
    2,
  ),
);
