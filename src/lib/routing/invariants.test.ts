import { describe, expect, it } from "vitest";
import { buildFlightQueue } from "@/lib/draw/flight-queue";
import { moveGroupToHole, reorderHoleQueue, swapGroupSlots } from "@/lib/draw/group-slots";
import type { DrawGroup } from "@/lib/draw/validate";
import { type RoutingInput, route } from "./index";
import type { CategoryRule, FlightRule, Player, Tee } from "./types";

/**
 * Hardening for the flight draw (issue 195). Hundreds of random fields go through the draw and
 * random edit sequences go through the result, and the rules that must always hold are checked:
 * nobody twice, pairs together, no two groups on one slot, never a third flight in a session, and
 * edits that never lose or duplicate a group or a player. The random numbers are seeded, so a
 * failure names the scenario and can be replayed.
 */

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tee: Tee = { id: "tee-1", name: "White", courseRating: 71.4, slope: 124, par: 72 };
const category: CategoryRule = {
  id: "cat",
  name: "Regular",
  gender: "M",
  minAge: 0,
  maxAge: null,
  teeId: "tee-1",
};
const flights: FlightRule[] = [
  { id: "a", categoryId: "cat", name: "Class A", min: -10, max: 12 },
  { id: "b", categoryId: "cat", name: "Class B", min: 12.1, max: 18 },
  { id: "c", categoryId: "cat", name: "Class C", min: 18.1, max: 23 },
  { id: "d", categoryId: "cat", name: "Class D", min: 23.1, max: 30 },
];
const config = {
  date: "2026-11-14",
  maxIndex: 30,
  allowance: 1,
  flightBasis: "index" as const,
  startFormat: "shotgun" as const,
  holes: 18,
  groupSize: 4,
  minGroupSize: 3,
  firstTeeTime: "06:30",
  intervalMinutes: 12,
  waveGapMinutes: 12,
};
const MAX_GROUPS = config.holes * 2;

interface Scenario {
  seed: number;
  players: Player[];
  sessionOf: Map<string, "AM" | "PM" | null>;
  input: RoutingInput;
}

/** A random field: a mix of pairs and singles, indexes from -2 to 33 (some blank or over the cap). */
function scenario(seed: number, withSessions: boolean): Scenario {
  const random = mulberry32(seed);
  const size = Math.floor(random() * 420);
  const players: Player[] = [];
  const sessionOf = new Map<string, "AM" | "PM" | null>();
  let pair = 0;
  while (players.length < size) {
    const together = random() < 0.6 && players.length + 2 <= size;
    const teamKey = together ? `team-${++pair}` : null;
    for (let i = 0; i < (together ? 2 : 1); i++) {
      const id = `p${players.length + 1}`;
      const roll = random();
      players.push({
        id,
        name: `Player ${String(players.length + 1).padStart(3, "0")}`,
        birthdate: "1980-01-01",
        gender: "M",
        index: roll < 0.05 ? null : Math.round((random() * 35 - 2) * 10) / 10,
        teamKey,
      });
      const s = random();
      // Partners usually share a session; sometimes they do not, as on the real sheet.
      const partnerSession =
        teamKey && i === 1 ? sessionOf.get(`p${players.length - 1}`) : undefined;
      sessionOf.set(
        id,
        partnerSession !== undefined && random() < 0.85
          ? partnerSession
          : s < 0.55
            ? "AM"
            : s < 0.95
              ? "PM"
              : null,
      );
    }
  }
  const input: RoutingInput = {
    players,
    config,
    tees: [tee],
    categories: [category],
    flights,
    sessions: withSessions
      ? {
          byPlayer: new Map(players.map((p) => [p.id, sessionOf.get(p.id) ?? null])),
          starts: { AM: "06:30", PM: "12:30" },
          dayNumber: 3,
          batchGapMinutes: config.intervalMinutes,
        }
      : undefined,
  };
  return { seed, players, sessionOf, input };
}

const asDraw = (groups: ReturnType<typeof route>["groups"]): DrawGroup[] =>
  groups.map((g) => ({ ...g, locked: false }));

/** The rules every draw must satisfy, whatever the field. */
function checkDraw(s: Scenario, groups: DrawGroup[], label: string) {
  const where = `${label} (seed ${s.seed})`;
  const seen = new Set<string>();
  const numbers = new Set<number>();
  const slots = new Set<string>();
  for (const g of groups) {
    expect(numbers.has(g.number), `${where}: group number ${g.number} twice`).toBe(false);
    numbers.add(g.number);
    expect(g.playerIds.length, `${where}: empty group ${g.number}`).toBeGreaterThan(0);
    expect(g.playerIds.length, `${where}: group ${g.number} too big`).toBeLessThanOrEqual(
      config.groupSize,
    );
    expect(g.startHole >= 1 && g.startHole <= config.holes, `${where}: hole ${g.startHole}`).toBe(
      true,
    );
    const slot = `${g.time}:${g.startHole}`;
    expect(slots.has(slot), `${where}: slot ${slot} used twice`).toBe(false);
    slots.add(slot);
    for (const id of g.playerIds) {
      expect(seen.has(id), `${where}: ${id} in two groups`).toBe(false);
      seen.add(id);
    }
  }
}

describe("the draw never breaks its rules", () => {
  it("holds for 300 random fields drawn in AM and PM sessions", { timeout: 60000 }, () => {
    for (let seed = 1; seed <= 300; seed++) {
      const s = scenario(seed, true);
      const result = route(s.input, { seed, splitClassesAcrossWaves: true });
      const groups = asDraw(result.groups);
      checkDraw(s, groups, "sessions");

      // Two flights at most in a session, and 36 groups at most.
      for (const session of ["AM", "PM"] as const) {
        const inSession = groups.filter((g) => g.time < "12:00" === (session === "AM"));
        const starts = new Set(inSession.map((g) => g.time));
        expect(
          starts.size,
          `seed ${seed}: ${session} has ${starts.size} flights`,
        ).toBeLessThanOrEqual(2);
        expect(inSession.length, `seed ${seed}: ${session} groups`).toBeLessThanOrEqual(MAX_GROUPS);
      }

      // The queue model agrees with the draw: only Flight A and B, every group once, unique slots.
      const model = buildFlightQueue(
        groups,
        flights.map((f) => ({ id: f.id, name: f.name })),
        config.holes,
        (time) => (time < "12:00" ? "AM" : "PM"),
      );
      expect(
        model.flights.every((f) => f.letter === "A" || f.letter === "B"),
        `seed ${seed}: a flight past B`,
      ).toBe(true);
      expect(
        model.flights.reduce((n, f) => n + f.groups, 0),
        `seed ${seed}: flight totals`,
      ).toBe(groups.length);
      const slotLabels = model.byHole.flatMap((h) =>
        h.entries.map((e) => `${e.session}-${e.slot}`),
      );
      expect(new Set(slotLabels).size, `seed ${seed}: a slot label repeats`).toBe(groups.length);

      // Pairs stay together when both partners are drawn in the same session.
      const groupOf = new Map<string, number>();
      for (const g of groups) for (const id of g.playerIds) groupOf.set(id, g.number);
      for (const p of s.players) {
        if (!p.teamKey) continue;
        const partner = s.players.find((q) => q.teamKey === p.teamKey && q.id !== p.id);
        const a = groupOf.get(p.id);
        const b = partner ? groupOf.get(partner.id) : undefined;
        if (
          a !== undefined &&
          b !== undefined &&
          s.sessionOf.get(p.id) === s.sessionOf.get(partner?.id ?? "")
        ) {
          expect(a, `seed ${seed}: pair ${p.teamKey} split`).toBe(b);
        }
      }

      // A player is only left out when the session really is full.
      const ready = result.registrations.filter((r) => r.status === "ok").map((r) => r.playerId);
      const missing = ready.filter((id) => !groupOf.has(id));
      if (missing.length > 0) {
        const full = ["AM", "PM"].some(
          (session) =>
            groups.filter((g) => g.time < "12:00" === (session === "AM")).length === MAX_GROUPS,
        );
        expect(
          full,
          `seed ${seed}: ${missing.length} players left out of a session with room`,
        ).toBe(true);
        expect(
          result.warnings.join(" "),
          `seed ${seed}: no warning for left-out players`,
        ).toContain("left out");
      }
    }
  });

  it("holds for 150 random fields drawn with no sessions: one session, two flights", {
    timeout: 60000,
  }, () => {
    for (let seed = 1000; seed < 1150; seed++) {
      const s = scenario(seed, false);
      const groups = asDraw(route(s.input, { seed, splitClassesAcrossWaves: true }).groups);
      checkDraw(s, groups, "no sessions");
      expect(groups.length, `seed ${seed}`).toBeLessThanOrEqual(MAX_GROUPS);
      expect(new Set(groups.map((g) => g.time)).size, `seed ${seed}`).toBeLessThanOrEqual(2);
    }
  });

  it("gives the same draw for the same field and seed, and a different order for another seed", () => {
    const s = scenario(77, true);
    const first = route(s.input, { seed: 5, splitClassesAcrossWaves: true });
    const again = route(s.input, { seed: 5, splitClassesAcrossWaves: true });
    expect(again.groups).toEqual(first.groups);
  });

  it("does not change the field it is given", () => {
    const s = scenario(31, true);
    const copy = JSON.parse(JSON.stringify(s.players));
    route(s.input, { seed: 1, splitClassesAcrossWaves: true });
    expect(JSON.parse(JSON.stringify(s.players))).toEqual(copy);
  });

  it("keeps locked groups where they are when it is run again", { timeout: 60000 }, () => {
    for (let seed = 2000; seed < 2060; seed++) {
      const s = scenario(seed, true);
      const first = route(s.input, { seed, splitClassesAcrossWaves: true });
      const locked = first.groups.filter((_, i) => i % 5 === 0).map((g) => ({ ...g }));
      const second = route(s.input, {
        seed: seed + 1,
        splitClassesAcrossWaves: true,
        lockedGroups: locked,
      });
      checkDraw(s, asDraw(second.groups), "re-run with locks");
      for (const lock of locked) {
        const kept = second.groups.find((g) => g.number === lock.number);
        const released = second.warnings.some((w) =>
          w.includes(`Locked group ${lock.number} was released`),
        );
        if (!released) {
          expect(kept, `seed ${seed}: locked group ${lock.number} vanished`).toBeDefined();
          expect(kept?.time).toBe(lock.time);
          expect(kept?.startHole).toBe(lock.startHole);
          expect(kept?.playerIds).toEqual(lock.playerIds);
        }
      }
    }
  });
});

describe("hand edits never lose or duplicate anything", () => {
  const key = (g: DrawGroup) => `${g.time}:${g.startHole}`;

  it("holds through 200 random sequences of 40 swaps, moves and reorders", {
    timeout: 60000,
  }, () => {
    for (let seed = 1; seed <= 200; seed++) {
      const random = mulberry32(seed * 7919);
      const s = scenario(seed, true);
      let draw = asDraw(route(s.input, { seed, splitClassesAcrossWaves: true }).groups);
      if (draw.length < 2) continue;
      const playersBefore = draw.flatMap((g) => g.playerIds).sort();
      const numbersBefore = draw.map((g) => g.number).sort((a, b) => a - b);
      const pick = () => draw[Math.floor(random() * draw.length)] as DrawGroup;

      for (let step = 0; step < 40; step++) {
        const frozen = JSON.stringify(draw);
        const roll = random();
        const result =
          roll < 0.34
            ? swapGroupSlots(draw, pick().number, pick().number)
            : roll < 0.67
              ? moveGroupToHole(
                  draw,
                  pick().number,
                  1 + Math.floor(random() * 20) - 1,
                  config.holes,
                )
              : (() => {
                  const hole = pick().startHole;
                  const onHole = draw.filter((g) => g.startHole === hole).map((g) => g.number);
                  const shuffled = [...onHole].sort(() => random() - 0.5);
                  return reorderHoleQueue(draw, hole, random() < 0.1 ? onHole.slice(1) : shuffled);
                })();
        // An edit never changes what it was given, and a refusal changes nothing at all.
        expect(JSON.stringify(draw), `seed ${seed} step ${step}: input changed`).toBe(frozen);
        if (!result.ok) {
          expect(result.reason.length).toBeGreaterThan(0);
          continue;
        }
        draw = result.draw;

        expect(
          draw.map((g) => g.number).sort((a, b) => a - b),
          `seed ${seed} step ${step}`,
        ).toEqual(numbersBefore);
        expect(draw.flatMap((g) => g.playerIds).sort(), `seed ${seed} step ${step}`).toEqual(
          playersBefore,
        );
        const slots = draw.map(key);
        expect(new Set(slots).size, `seed ${seed} step ${step}: a slot is used twice`).toBe(
          slots.length,
        );
        expect(draw.every((g) => g.startHole >= 1 && g.startHole <= config.holes)).toBe(true);
      }
    }
  });
});
