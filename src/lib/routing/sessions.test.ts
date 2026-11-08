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

const startsOf = (result: ReturnType<typeof route>) => {
  const starts = new Map<string, number>();
  for (const group of result.groups) {
    starts.set(group.time, (starts.get(group.time) ?? 0) + 1);
  }
  return Object.fromEntries([...starts].sort());
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
    expect(startsOf(result)).toEqual({ "06:30": 3, "12:30": 2 });
    expect(new Set(result.groups.map((g) => g.time))).toEqual(new Set(["06:30", "12:30"]));
  });

  it("only starts a second time in the session that has more groups than holes", () => {
    // 80 morning players are 20 groups, so the morning needs a second start; the afternoon fits one.
    const morning = players(80, 5);
    const afternoon = players(4, 5, 500);
    const result = draw([...morning, ...afternoon], (id) =>
      Number(id.slice(1)) >= 500 ? "PM" : "AM",
    );

    expect(startsOf(result)).toEqual({ "06:30": 18, "06:39": 2, "12:30": 1 });
    const second = result.groups.find((g) => g.time === "06:39");
    expect(second).toBeDefined();
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
    expect(startsOf(result)).toEqual({ "06:30": 1 });
  });

  it("starts a day without sessions at its first tee time", () => {
    const result = route({
      players: players(4, 5),
      config,
      tees: [tee],
      categories: [category],
      flights,
    });
    expect(result.groups.map((g) => g.time)).toEqual(["06:30"]);
  });

  it("leaves out a player who is not in the day's map", () => {
    // The map is the day's own registrations. A player missing from it chose another day, so they
    // are not drawn here and are not warned about a missing session either.
    const field = players(4, 5);
    const result = route(
      {
        players: field,
        config,
        tees: [tee],
        categories: [category],
        flights,
        sessions: {
          byPlayer: new Map(field.slice(0, 2).map((player) => [player.id, "AM" as const])),
          starts: { AM: "06:30", PM: "12:30" },
          dayNumber: 1,
        },
      },
      { seed: 7 },
    );
    expect(new Set(result.groups.flatMap((group) => group.playerIds))).toEqual(
      new Set(["p1", "p2"]),
    );
    expect(result.warnings.some((w) => w.includes("no morning or afternoon session"))).toBe(false);
  });

  it("places a confirmed provisional player in the session they chose", () => {
    const result = route(
      {
        players: [],
        provisional: [{ id: "prov", name: "Provisional Player", index: 20, missing: ["gender"] }],
        config,
        tees: [tee],
        categories: [category],
        flights,
        sessions: {
          byPlayer: new Map([["prov", "PM" as const]]),
          starts: { AM: "06:30", PM: "12:30" },
          dayNumber: 2,
        },
      },
      { seed: 7 },
    );
    const group = result.groups.find((g) => g.playerIds.includes("prov"));
    expect(group?.time).toBe("12:30");
  });

  it("spaces a second start in a session by the batch interval, not the session gap", () => {
    const field = players(80, 5);
    const result = route(
      {
        players: field,
        config: { ...config, waveGapMinutes: 300 },
        tees: [tee],
        categories: [category],
        flights,
        sessions: {
          byPlayer: new Map(field.map((player) => [player.id, "AM" as const])),
          starts: { AM: "06:30", PM: "12:30" },
          dayNumber: 2,
          batchGapMinutes: 9,
        },
      },
      { seed: 7 },
    );
    expect(startsOf(result)).toEqual({ "06:30": 18, "06:39": 2 });
  });

  it("keeps filling a start and lets a class continue into the next one", () => {
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

    // A class is moved whole by default, so Class B starts at the later time.
    expect(startsOf(route(input, { seed: 7 }))).toEqual({ "06:30": 13, "06:39": 10 });

    // Filling the start as it goes uses the first start to its last hole and starts the next with
    // what is left.
    const filled = route(input, { seed: 7, splitClassesAcrossWaves: true });
    expect(startsOf(filled)).toEqual({ "06:30": 18, "06:39": 5 });
    expect(filled.warnings.some((w) => w.includes("plays across the 06:30 and 06:39 starts"))).toBe(
      true,
    );
  });

  it("does not warn when a small class simply begins in the next empty batch", () => {
    // Class A fills all 18 holes of the first start exactly. Class B does not span two starts: it
    // only begins at the next one, so there is no split to flag.
    const field = [...players(72, 5), ...players(4, 20, 100)];
    const input = {
      players: field,
      config,
      tees: [tee],
      categories: [category],
      flights,
      sessions: {
        byPlayer: new Map(field.map((player) => [player.id, "AM" as const])),
        starts: { AM: "06:30", PM: "12:30" },
        dayNumber: 4,
      },
    };

    const filled = route(input, { seed: 7, splitClassesAcrossWaves: true });
    expect(startsOf(filled)).toEqual({ "06:30": 18, "06:39": 1 });
    expect(filled.warnings.some((w) => w.includes("plays across"))).toBe(false);
  });
});

describe("a session runs at most Flight A and Flight B", () => {
  /** 4-player groups all in the morning: 4 * n players make n groups. */
  const morning = (groups: number) => players(groups * 4, 5);
  const am = () => "AM" as const;

  it("fits 36 groups, two flights of 18 holes, and never starts a third flight", () => {
    const result = draw(morning(36), am);
    expect(result.groups).toHaveLength(36);
    expect(startsOf(result)).toEqual({ "06:30": 18, "06:39": 18 });
    expect(result.warnings.join(" ")).not.toContain("left out");
  });

  it("leaves out the groups that do not fit, whole groups, and says how many", () => {
    const result = draw(morning(40), am);
    expect(result.groups).toHaveLength(36);
    expect(Object.keys(startsOf(result))).toEqual(["06:30", "06:39"]);
    expect(result.warnings.join(" ")).toContain(
      "AM session: the course fits 36 groups (2 flights of 18 holes), so 4 groups with 16 players were left out.",
    );
    // Nobody is in a group twice, and the 16 left out are in no group at all.
    const placed = result.groups.flatMap((g) => g.playerIds);
    expect(new Set(placed).size).toBe(placed.length);
    expect(placed).toHaveLength(36 * 4);
  });

  it("caps the afternoon on its own, so a full morning does not use up the afternoon", () => {
    const field = [...players(36 * 4, 5), ...players(20 * 4, 5, 500)];
    const result = draw(field, (id) => (Number(id.slice(1)) >= 500 ? "PM" : "AM"));
    expect(startsOf(result)).toEqual({ "06:30": 18, "06:39": 18, "12:30": 18, "12:39": 2 });
  });

  it("reads the limit from the setting, so one flight per session is possible", () => {
    const result = route(
      {
        players: morning(20),
        config: { ...config, maxFlightsPerSession: 1 },
        tees: [tee],
        categories: [category],
        flights,
        sessions: {
          byPlayer: new Map(morning(20).map((player) => [player.id, "AM" as const])),
          starts: { AM: "06:30", PM: "12:30" },
          dayNumber: 2,
        },
      },
      { seed: 7 },
    );
    expect(result.groups).toHaveLength(18);
    expect(result.warnings.join(" ")).toContain(
      "(1 flight of 18 holes), so 2 groups with 8 players",
    );
  });

  it("holds for a draw with no sessions too: never a third flight", () => {
    const result = route(
      { players: morning(40), config, tees: [tee], categories: [category], flights },
      { seed: 7 },
    );
    expect(result.groups).toHaveLength(36);
    expect(Object.keys(startsOf(result))).toHaveLength(2);
    expect(result.warnings.join(" ")).toContain(
      "This draw: the course fits 36 groups (2 flights of 18 holes), so 4 groups with 16 players were left out.",
    );
  });
});
