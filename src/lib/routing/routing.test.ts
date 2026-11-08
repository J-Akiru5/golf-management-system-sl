import { describe, expect, it } from "vitest";
import { groupSizes, packUnits } from "./groups";
import { ageOn, playingHandicap, rawCourseHandicap } from "./handicap";
import { classifyPlayer, type RoutingInput, route } from "./index";
import { addMinutes, planShotgun, planTwoTee, planTwoTeeFrom } from "./schedule";
import type { Player, Tee, TournamentConfig } from "./types";

// Placeholder ratings. Replace with the real IGCC values before launch.
const tees: Tee[] = [
  { id: "white", name: "White", courseRating: 71.5, slope: 128, par: 72 },
  { id: "senior", name: "Senior", courseRating: 70.1, slope: 125, par: 72 },
  { id: "silver", name: "Silver", courseRating: 68.9, slope: 122, par: 72 },
  { id: "red", name: "Red", courseRating: 70.0, slope: 120, par: 72 },
];

const categories = [
  { id: "regular", name: "Regular", gender: "M" as const, minAge: 0, maxAge: 59, teeId: "white" },
  { id: "senior", name: "Senior", gender: "M" as const, minAge: 60, maxAge: 69, teeId: "senior" },
  {
    id: "super",
    name: "Super Senior",
    gender: "M" as const,
    minAge: 70,
    maxAge: null,
    teeId: "silver",
  },
  { id: "ladies", name: "Ladies", gender: "F" as const, minAge: 0, maxAge: null, teeId: "red" },
];

// Classes are field-wide: one set of ranges, whatever category or tee a player is in. The carrier
// categoryId is storage only.
const flights = [
  { id: "a", categoryId: "regular", name: "Class A", min: 0, max: 12 },
  { id: "b", categoryId: "regular", name: "Class B", min: 12.1, max: 20 },
  { id: "c", categoryId: "regular", name: "Class C", min: 20.1, max: 30 },
];

const config: TournamentConfig = {
  date: "2026-11-14",
  maxIndex: 30,
  allowance: 1,
  flightBasis: "index",
  startFormat: "shotgun",
  holes: 18,
  groupSize: 4,
  minGroupSize: 3,
  firstTeeTime: "07:00",
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

let seq = 0;
const player = (over: Partial<Player> = {}): Player => {
  seq += 1;
  return {
    id: `p${seq}`,
    name: `Player ${String(seq).padStart(3, "0")}`,
    birthdate: "1980-01-01",
    gender: "M",
    index: 10,
    ...over,
  };
};

describe("handicap", () => {
  it("matches the worked example in the spec", () => {
    const tee = tees[1] as Tee;
    expect(rawCourseHandicap(14.2, tee)).toBeCloseTo(13.81, 2);
    expect(playingHandicap(14.2, tee, 1)).toBe(14);
  });

  it("applies the allowance before rounding", () => {
    const tee = tees[0] as Tee;
    expect(playingHandicap(20, tee, 0.95)).toBe(Math.round(rawCourseHandicap(20, tee) * 0.95));
  });

  it("handles plus handicaps", () => {
    expect(playingHandicap(-2, tees[0] as Tee, 1)).toBeLessThan(0);
  });

  it("computes age on tournament day, not by year only", () => {
    expect(ageOn("1966-11-14", "2026-11-14")).toBe(60);
    expect(ageOn("1966-11-15", "2026-11-14")).toBe(59);
    expect(ageOn("1956-11-14", "2026-11-14")).toBe(70);
  });
});

describe("classification", () => {
  it("puts a 60-year-old man in Senior on the senior tee", () => {
    const r = classifyPlayer(player({ birthdate: "1966-01-01", index: 14.2 }), input([]));
    expect(r.categoryId).toBe("senior");
    expect(r.teeId).toBe("senior");
    expect(r.playingHandicap).toBe(14);
    // Class B, the same class a player on any other tee with this index would join.
    expect(r.flightId).toBe("b");
  });

  it("puts a 70-year-old man in Super Senior on Silver", () => {
    const r = classifyPlayer(player({ birthdate: "1950-01-01", index: 22 }), input([]));
    expect(r.categoryId).toBe("super");
    expect(r.teeId).toBe("silver");
  });

  it("blocks an index above 30", () => {
    const r = classifyPlayer(player({ index: 30.1 }), input([]));
    expect(r.status).toBe("ineligible");
    expect(r.flightId).toBeNull();
  });

  it("accepts an index of exactly 30", () => {
    expect(classifyPlayer(player({ index: 30 }), input([])).status).toBe("ok");
  });

  it("gives a player with no index on file a handicap of 0 so they can be paired", () => {
    const r = classifyPlayer(player({ index: null }), input([]));
    expect(r.status).toBe("ok");
    expect(r.playingHandicap).toBe(0);
    expect(r.flightId).toBe("a");
    expect(r.reasons.join(" ")).toContain("0 is used");
  });

  it("sends an unmatched player to review instead of guessing", () => {
    const woman = classifyPlayer(player({ gender: "F", index: 5 }), input([]));
    expect(woman.categoryId).toBe("ladies");
    const input2: RoutingInput = {
      ...input([]),
      categories: categories.filter((c) => c.id !== "ladies"),
    };
    expect(classifyPlayer(player({ gender: "F" }), input2).status).toBe("needs_review");
  });

  it("can flight by course handicap instead of index", () => {
    const p = player({ birthdate: "1990-01-01", index: 12 });
    const byIndex = classifyPlayer(p, input([], { flightBasis: "index" }));
    const byCh = classifyPlayer(p, input([], { flightBasis: "courseHandicap" }));
    expect(byIndex.flightId).toBe("a");
    expect(byCh.playingHandicap).toBe(Math.round(12 * (128 / 113) + (71.5 - 72)));
  });
});

describe("group sizes", () => {
  it("spreads evenly", () => {
    expect(groupSizes(14, 4)).toEqual([4, 4, 3, 3]);
    expect(groupSizes(8, 4)).toEqual([4, 4]);
    expect(groupSizes(9, 4)).toEqual([3, 3, 3]);
    expect(groupSizes(0, 4)).toEqual([]);
  });

  it("refuses a group size that is not a whole number of at least 1", () => {
    expect(() => groupSizes(8, 0)).toThrow("Invalid group size");
    expect(() => groupSizes(8, -1)).toThrow("Invalid group size");
    expect(() => groupSizes(8, 2.5)).toThrow("Invalid group size");
    expect(() => groupSizes(8, Number.NaN)).toThrow("Invalid group size");
  });

  it("packs teams without splitting one across two groups", () => {
    const packed = packUnits(
      [
        ["a", "b"],
        ["c", "d"],
        ["e", "f"],
      ],
      2,
    );
    expect(packed).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
    ]);
    const four = packUnits(
      [
        ["a", "b"],
        ["c", "d"],
        ["e", "f"],
      ],
      4,
    );
    expect(four).toEqual([
      ["a", "b", "c", "d"],
      ["e", "f"],
    ]);
  });
});

describe("schedule", () => {
  it("adds minutes and wraps", () => {
    expect(addMinutes("07:00", 300)).toBe("12:00");
    expect(addMinutes("23:30", 60)).toBe("00:30");
    expect(addMinutes("6:03", 0)).toBe("06:03");
  });

  it("refuses a time that is not a valid 24-hour clock time", () => {
    expect(() => addMinutes("24:00", 0)).toThrow("Invalid time: 24:00");
    expect(() => addMinutes("06:60", 0)).toThrow("Invalid time: 06:60");
    expect(() => addMinutes("6:3", 0)).toThrow("Invalid time: 6:3");
    expect(() => addMinutes("noon", 0)).toThrow("Invalid time: noon");
  });

  it("refuses a minute count that is not a whole number", () => {
    expect(() => addMinutes("07:00", Number.NaN)).toThrow("Invalid minute count");
    expect(() => addMinutes("07:00", Number.POSITIVE_INFINITY)).toThrow("Invalid minute count");
    expect(() => addMinutes("07:00", 1.5)).toThrow("Invalid minute count");
  });

  it("alternates tees and advances one interval per pair", () => {
    const s = planTwoTee(5, "07:00", 12);
    expect(s.map((x) => x.startHole)).toEqual([1, 10, 1, 10, 1]);
    expect(s.map((x) => x.time)).toEqual(["07:00", "07:00", "07:12", "07:12", "07:24"]);
  });

  it("returns no slots for an empty field and refuses a bad interval", () => {
    expect(planTwoTeeFrom(0, "07:00", 12)).toEqual([]);
    expect(() => planTwoTeeFrom(2, "07:00", 0)).toThrow("Invalid two-tee interval");
    expect(() => planTwoTeeFrom(2, "07:00", -5)).toThrow("Invalid two-tee interval");
    expect(() => planTwoTeeFrom(2, "07:00", Number.NaN)).toThrow("Invalid two-tee interval");
  });

  it("keeps a flight whole by moving it to the next start", () => {
    const plan = planShotgun(
      [
        { flightName: "A", groups: 15 },
        { flightName: "B", groups: 5 },
      ],
      18,
      "07:00",
      300,
    );
    const b = plan.slots.slice(15);
    expect(b.every((s) => s.time === "12:00")).toBe(true);
    expect(b.map((s) => s.startHole)).toEqual([1, 2, 3, 4, 5]);
    expect(plan.slots.slice(0, 15).every((s) => s.time === "07:00")).toBe(true);
  });

  it("splits and flags a flight that cannot fit in one start", () => {
    const plan = planShotgun([{ flightName: "Big", groups: 20 }], 18, "07:00", 300);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.slots.filter((s) => s.time === "12:00")).toHaveLength(2);
  });
});

describe("route", () => {
  it("never places a group on a hole twice at one start and honors max group size", () => {
    const players = Array.from({ length: 100 }, (_, i) =>
      player({ index: 1 + (i % 28), birthdate: i % 3 === 0 ? "1960-01-01" : "1985-01-01" }),
    );
    const out = route(input(players));
    const seen = new Set<string>();
    for (const g of out.groups) {
      const key = `${g.time}-${g.startHole}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(g.playerIds.length).toBeLessThanOrEqual(4);
    }
    const routed = out.groups.flatMap((g) => g.playerIds);
    expect(new Set(routed).size).toBe(routed.length);
    expect(routed.length).toBe(out.registrations.filter((r) => r.status === "ok").length);
  });

  it("keeps every group inside one flight", () => {
    const players = Array.from({ length: 40 }, (_, i) => player({ index: (i * 3) % 30 }));
    const out = route(input(players));
    const flightOf = new Map(out.registrations.map((r) => [r.playerId, r.flightId]));
    for (const g of out.groups) {
      for (const id of g.playerIds) expect(flightOf.get(id)).toBe(g.flightId);
    }
  });

  it("leaves an ineligible player out of the groups but keeps a player with no index", () => {
    const out = route(
      input([player({ index: 31 }), player({ index: null }), player({ index: 8 })]),
    );
    const grouped = out.groups.flatMap((g) => g.playerIds);
    expect(grouped).toHaveLength(2);
    expect(out.registrations.find((r) => r.index === 31)?.status).toBe("ineligible");
  });

  it("flags groups smaller than the minimum", () => {
    const out = route(input([player({ index: 5 }), player({ index: 6 })]));
    expect(out.warnings.some((w) => w.includes("only 2"))).toBe(true);
  });

  it("keeps each member-guest pair in one group of two", () => {
    const players = [
      player({ index: 5, teamKey: "pair-1" }),
      player({ index: 6, teamKey: "pair-1" }),
      player({ index: 9, teamKey: "pair-2" }),
      player({ index: 10, teamKey: "pair-2" }),
    ];
    const out = route(input(players, { groupSize: 2 }));

    expect(out.groups).toHaveLength(2);
    for (const group of out.groups) {
      const keys = group.playerIds.map(
        (id) => players.find((entry) => entry.id === id)?.teamKey ?? null,
      );
      expect(new Set(keys).size).toBe(1);
    }
  });

  it("puts two pairs in a four-ball without splitting either", () => {
    const players = [
      player({ index: 5, teamKey: "pair-1" }),
      player({ index: 6, teamKey: "pair-1" }),
      player({ index: 9, teamKey: "pair-2" }),
      player({ index: 10, teamKey: "pair-2" }),
    ];
    const out = route(input(players, { groupSize: 4 }));

    expect(out.groups).toHaveLength(1);
    const keys = (out.groups[0]?.playerIds ?? []).map(
      (id) => players.find((entry) => entry.id === id)?.teamKey ?? null,
    );
    expect(keys.sort()).toEqual(["pair-1", "pair-1", "pair-2", "pair-2"]);
  });

  it("uses the two-tee plan when chosen", () => {
    const players = Array.from({ length: 16 }, () => player({ index: 8 }));
    const out = route(input(players, { startFormat: "two_tee" }));
    expect(out.groups.map((g) => g.startHole)).toEqual([1, 10, 1, 10]);
    expect(out.groups.map((g) => g.time)).toEqual(["07:00", "07:00", "07:12", "07:12"]);
  });
});

describe("walk-up shapes from the staff add screen", () => {
  // The add screen can only send two shapes. A guest is a new record with a name and a phone, and the
  // directory can only offer a player who has no entry yet. Both reach the engine with no birthdate,
  // no gender and no handicap record, so both are classified the same way: the open division, a
  // handicap of 0 and the class that covers it. Nothing is left for the desk to review.

  it("places a walk-up with no birthdate, gender or index in the open division", () => {
    const walkUp = player({ birthdate: null, gender: null, index: null });
    const reg = classifyPlayer(walkUp, input([]));

    expect(reg.status).toBe("ok");
    expect(reg.categoryId).toBe("regular");
    expect(reg.teeId).toBe("white");
    expect(reg.flightId).toBe("a");
    expect(reg.reasons.join(" ")).toContain("0 is used");

    const out = route(input([walkUp]));
    expect(out.groups.flatMap((group) => group.playerIds)).toEqual([walkUp.id]);
  });

  it("leaves a registration the event cannot classify out of every group", () => {
    // A shape the add screen cannot send: an event with no category for the player. The engine still
    // refuses to invent a category, a tee or a flight, and gives the player no group at all.
    const woman = player({ gender: "F", index: 5 });
    const out = route({
      ...input([woman]),
      categories: categories.filter((category) => category.id !== "ladies"),
    });
    const reg = out.registrations.find((candidate) => candidate.playerId === woman.id);

    expect(reg?.status).toBe("needs_review");
    expect(reg?.categoryId).toBeNull();
    expect(reg?.teeId).toBeNull();
    expect(reg?.flightId).toBeNull();
    expect(out.groups.flatMap((group) => group.playerIds)).not.toContain(woman.id);
  });
});
