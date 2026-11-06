import { describe, expect, it } from "vitest";
import { route } from "./index";
import type { CategoryRule, FlightRule, Player, Tee } from "./types";

const tee: Tee = { id: "tee-1", name: "White", courseRating: 71.4, slope: 124, par: 72 };
const category: CategoryRule = {
  id: "cat-regular",
  name: "Regular",
  gender: "M",
  minAge: 0,
  maxAge: null,
  teeId: "tee-1",
};
const flights: FlightRule[] = [
  { id: "class-a", categoryId: "cat-regular", name: "Class A", min: 0, max: 12 },
  { id: "class-b", categoryId: "cat-regular", name: "Class B", min: 12.1, max: 30 },
];
const config = {
  date: "2026-11-13",
  maxIndex: 30,
  allowance: 1,
  flightBasis: "index" as const,
  startFormat: "shotgun" as const,
  holes: 18,
  groupSize: 4,
  minGroupSize: 3,
  firstTeeTime: "06:30",
  intervalMinutes: 12,
  waveGapMinutes: 9,
};

/** `count` players with one index, named so the order is stable. */
function players(count: number, index: number, from = 1): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${from + i}`,
    name: `Player ${String(from + i).padStart(3, "0")}`,
    birthdate: "1980-01-01",
    gender: "M" as const,
    index,
  }));
}

function draw(input: Player[], session: (id: string) => "AM" | "PM" | null, dayNumber = 2) {
  return route(
    {
      players: input,
      config,
      tees: [tee],
      categories: [category],
      flights,
      sessions: {
        byPlayer: new Map(input.map((player) => [player.id, session(player.id)])),
        starts: { AM: "06:30", PM: "12:30" },
        dayNumber,
      },
    },
    { seed: 7 },
  );
}

const wavesOf = (result: ReturnType<typeof route>) => {
  const waves = new Map<string, number>();
  for (const group of result.groups) {
    const key = group.wave ?? "none";
    waves.set(key, (waves.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...waves].sort());
};

describe("a playing day drawn in a morning and an afternoon session", () => {
  it("cuts each session separately and gives each its own start time", () => {
    const field = [
      ...players(8, 5),
      ...players(4, 20, 20),
      ...players(4, 5, 40),
      ...players(4, 20, 60),
    ];
    const afternoon = new Set(["p20", "p21", "p22", "p23", "p60", "p61", "p62", "p63"]);
    const result = draw(field, (id) => (afternoon.has(id) ? "PM" : "AM"));

    // Morning: Class A 8 players = 2 groups, Class B 4 = 1 group. Afternoon: one group each.
    expect(wavesOf(result)).toEqual({ "D2-AM-A": 3, "D2-PM-A": 2 });

    const times = new Map(result.groups.map((g) => [g.wave, g.time]));
    expect(times.get("D2-AM-A")).toBe("06:30");
    expect(times.get("D2-PM-A")).toBe("12:30");
  });

  it("only starts a second wave in the session that has more groups than holes", () => {
    // 80 morning players are 20 groups, so the morning needs wave B; the afternoon fits one wave.
    const morning = players(80, 5);
    const afternoon = players(4, 5, 500);
    const result = draw([...morning, ...afternoon], (id) =>
      Number(id.slice(1)) >= 500 ? "PM" : "AM",
    );

    expect(wavesOf(result)).toEqual({ "D2-AM-A": 18, "D2-AM-B": 2, "D2-PM-A": 1 });
    const second = result.groups.find((g) => g.wave === "D2-AM-B");
    expect(second?.time).toBe("06:39");
    expect(result.warnings.some((w) => w.includes("Class A has 20 groups"))).toBe(true);
  });

  it("keeps a member-guest pair in one group inside its session", () => {
    const field: Player[] = [
      { ...(players(1, 5)[0] as Player), id: "member", teamKey: "team-9" },
      { ...(players(1, 9, 2)[0] as Player), id: "guest", teamKey: "team-9" },
      ...players(6, 5, 10),
    ];
    const result = draw(field, () => "AM");
    const group = result.groups.find((g) => g.playerIds.includes("member"));
    expect(group?.playerIds).toContain("guest");
  });

  it("draws a player with no session in the morning and says so", () => {
    const field = players(4, 5);
    const result = draw(field, (id) => (id === "p1" ? null : "AM"));
    expect(result.warnings.some((w) => w.includes("no morning or afternoon session"))).toBe(true);
    expect(wavesOf(result)).toEqual({ "D2-AM-A": 1 });
  });

  it("labels a day without a session name with the plain wave letter", () => {
    const result = route({
      players: players(4, 5),
      config,
      tees: [tee],
      categories: [category],
      flights,
    });
    expect(result.groups.map((g) => g.wave)).toEqual(["A"]);
  });

  it("keeps filling a wave and lets a class continue into the next one", () => {
    // 13 Class A groups fill 13 holes; Class B has 10 groups and does not fit the 5 holes left.
    const field = [...players(52, 5), ...players(40, 20, 100)];
    const input = {
      players: field,
      config,
      tees: [tee],
      categories: [category],
      flights,
      sessions: {
        byPlayer: new Map(field.map((player) => [player.id, "AM" as const])),
        starts: { AM: "06:30", PM: "12:30" },
        dayNumber: 3,
      },
    };

    // A class is moved whole by default, so Class B starts wave B.
    expect(wavesOf(route(input, { seed: 7 }))).toEqual({ "D3-AM-A": 13, "D3-AM-B": 10 });

    // Filling the wave as it goes uses wave A to its last hole and starts B with what is left.
    const filled = route(input, { seed: 7, splitClassesAcrossWaves: true });
    expect(wavesOf(filled)).toEqual({ "D3-AM-A": 18, "D3-AM-B": 5 });
    expect(filled.warnings.some((w) => w.includes("plays across waves"))).toBe(true);
  });
});
