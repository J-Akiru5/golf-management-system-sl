import { describe, expect, it } from "vitest";
import { type LockedGroup, type RoutingInput, route } from "./index";
import type { Player, Tee, TournamentConfig } from "./types";

// Demo-config numbers only: placeholder tee ratings and a sample cut-off.

const tees: Tee[] = [
  { id: "white", name: "White", courseRating: 71.5, slope: 128, par: 72 },
  { id: "senior", name: "Senior", courseRating: 70.1, slope: 125, par: 72 },
  { id: "silver", name: "Silver", courseRating: 68.9, slope: 122, par: 72 },
  { id: "red", name: "Red", courseRating: 70.0, slope: 120, par: 72 },
];

const categories = [
  { id: "regular", name: "Regular", gender: "M" as const, minAge: 0, maxAge: 59, teeId: "white" },
  { id: "senior", name: "Senior", gender: "M" as const, minAge: 60, maxAge: 69, teeId: "senior" },
];

// Classes run over the whole field; the carrier category is storage only.
const flights = [
  { id: "a", categoryId: "regular", name: "Class A", min: 0, max: 12 },
  { id: "b", categoryId: "regular", name: "Class B", min: 12.1, max: 30 },
];

const config: TournamentConfig = {
  date: "2026-11-12",
  maxIndex: 30,
  allowance: 1,
  flightBasis: "index",
  startFormat: "shotgun",
  holes: 18,
  groupSize: 4,
  minGroupSize: 3,
  firstTeeTime: "06:30",
  intervalMinutes: 12,
  waveGapMinutes: 300,
};

const input = (players: Player[], over: Partial<TournamentConfig> = {}): RoutingInput => ({
  players,
  config: { ...config, ...over },
  tees,
  categories,
  flights,
});

let seq = 100;
const player = (over: Partial<Player> = {}): Player => {
  seq += 1;
  return {
    id: `lp${seq}`,
    name: `Locker ${seq}`,
    birthdate: "1990-01-01",
    gender: "M",
    index: 8,
    ...over,
  };
};

const asLocked = (g: {
  number: number;
  flightId: string;
  playerIds: string[];
  startHole: number;
  wave: string | null;
  time: string;
}): LockedGroup => ({ ...g });

describe("lock-aware re-run", () => {
  it("keeps a locked group's players and slot, and routes the rest around it", () => {
    const players = Array.from({ length: 8 }, () => player());
    const first = route(input(players));
    const locked = first.groups[0];
    expect(locked).toBeDefined();
    const lockedGroup = asLocked(locked as NonNullable<typeof locked>);

    // A new player joins, and the draw is re-run with the lock preserved.
    const joined = [...players, player({ index: 6 })];
    const second = route(input(joined), { lockedGroups: [lockedGroup] });

    const kept = second.groups.find((g) => g.number === lockedGroup.number);
    expect(kept?.playerIds).toEqual(lockedGroup.playerIds);
    expect(kept?.startHole).toBe(lockedGroup.startHole);
    expect(kept?.wave).toBe(lockedGroup.wave);
    expect(kept?.time).toBe(lockedGroup.time);

    // Every eligible player is placed exactly once, none on the locked slot.
    const placed = second.groups.flatMap((g) => g.playerIds);
    expect(new Set(placed).size).toBe(placed.length);
    expect(placed).toHaveLength(9);
    const collisions = second.groups.filter(
      (g) => g.wave === lockedGroup.wave && g.startHole === lockedGroup.startHole,
    );
    expect(collisions).toHaveLength(1);
  });

  it("releases a lock and explains it when a player is no longer eligible", () => {
    const players = Array.from({ length: 4 }, () => player());
    const first = route(input(players));
    const locked = asLocked(first.groups[0] as NonNullable<(typeof first.groups)[number]>);
    const withOverLimit = players.map((p) =>
      p.id === locked.playerIds[0] ? { ...p, index: 31.4 } : p,
    );
    const second = route(input(withOverLimit), { lockedGroups: [locked] });
    expect(second.warnings.join(" ")).toContain(`Locked group ${locked.number} was released`);
    // The remaining three players are routed as a fresh group; the ineligible one is left out.
    expect(second.groups).toHaveLength(1);
    expect(second.groups[0]?.playerIds).toHaveLength(3);
    expect(second.groups[0]?.playerIds).not.toContain(locked.playerIds[0]);
  });

  it("releases a lock when a player has left the field", () => {
    const players = Array.from({ length: 4 }, () => player());
    const first = route(input(players));
    const locked = asLocked(first.groups[0] as NonNullable<(typeof first.groups)[number]>);
    const remaining = players.filter((p) => p.id !== locked.playerIds[0]);
    const second = route(input(remaining), { lockedGroups: [locked] });
    expect(second.warnings.join(" ")).toContain("no longer in the field");
  });

  it("flags a flight that a locked slot pushes across two waves", () => {
    // 19 groups in one flight: exactly one wave plus one group. Locking a slot inside wave A
    // pushes the last of it into wave B.
    const players = Array.from({ length: 76 }, () => player({ index: 5 }));
    const first = route(input(players));
    const locked = asLocked(first.groups[0] as NonNullable<(typeof first.groups)[number]>);
    const second = route(input(players), { lockedGroups: [locked] });
    const waves = new Set(second.groups.filter((g) => g.flightId === "a").map((g) => g.wave));
    expect(waves.size).toBe(2);
    expect(second.warnings.some((w) => w.includes("split across waves"))).toBe(true);
  });

  it("alternates two-tee slots around a locked pair", () => {
    const players = Array.from({ length: 16 }, () => player({ index: 8 }));
    const first = route(input(players, { startFormat: "two_tee" }));
    const locked = asLocked(first.groups[0] as NonNullable<(typeof first.groups)[number]>);
    expect(locked.startHole).toBe(1);
    expect(locked.time).toBe("06:30");

    const second = route(input(players, { startFormat: "two_tee" }), { lockedGroups: [locked] });
    const kept = second.groups.find((g) => g.number === locked.number);
    expect(kept?.time).toBe("06:30");
    expect(kept?.startHole).toBe(1);
    // The next pair goes off the other tee at the same time, then one interval later.
    const others = second.groups.filter((g) => g.number !== locked.number);
    const sameTime = others.filter((g) => g.time === "06:30");
    expect(sameTime.map((g) => g.startHole)).toEqual([10]);
    expect(others[1]?.time).toBe("06:42");
    expect(new Set(others.map((g) => `${g.startHole}:${g.time}`)).size).toBe(others.length);
  });
});
