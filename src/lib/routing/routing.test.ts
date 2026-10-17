import { describe, expect, it } from "vitest";
import { groupSizes } from "./groups";
import { ageOn, playingHandicap, rawCourseHandicap } from "./handicap";
import { classifyPlayer, type RoutingInput, route } from "./index";
import { addMinutes, planShotgun, planTwoTee } from "./schedule";
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

const flights = [
  { id: "r-a", categoryId: "regular", name: "Regular A", min: 0, max: 12 },
  { id: "r-b", categoryId: "regular", name: "Regular B", min: 12.1, max: 20 },
  { id: "r-c", categoryId: "regular", name: "Regular C", min: 20.1, max: 30 },
  { id: "s-a", categoryId: "senior", name: "Senior A", min: 0, max: 18 },
  { id: "s-b", categoryId: "senior", name: "Senior B", min: 18.1, max: 30 },
  { id: "ss-a", categoryId: "super", name: "Super Senior A", min: 0, max: 30 },
  { id: "l-a", categoryId: "ladies", name: "Ladies A", min: 0, max: 30 },
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
    expect(r.flightId).toBe("s-a");
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

  it("sends a player without an index to review", () => {
    expect(classifyPlayer(player({ index: null }), input([])).status).toBe("needs_review");
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
    expect(byIndex.flightId).toBe("r-a");
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
});

describe("schedule", () => {
  it("adds minutes and wraps", () => {
    expect(addMinutes("07:00", 300)).toBe("12:00");
    expect(addMinutes("23:30", 60)).toBe("00:30");
  });

  it("alternates tees and advances one interval per pair", () => {
    const s = planTwoTee(5, "07:00", 12);
    expect(s.map((x) => x.startHole)).toEqual([1, 10, 1, 10, 1]);
    expect(s.map((x) => x.time)).toEqual(["07:00", "07:00", "07:12", "07:12", "07:24"]);
  });

  it("keeps a flight whole by moving it to the next wave", () => {
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
    expect(b.every((s) => s.wave === "B")).toBe(true);
    expect(b.map((s) => s.startHole)).toEqual([1, 2, 3, 4, 5]);
    expect(b[0]?.time).toBe("12:00");
    expect(plan.slots.slice(0, 15).every((s) => s.wave === "A")).toBe(true);
  });

  it("splits and flags a flight that cannot fit in one wave", () => {
    const plan = planShotgun([{ flightName: "Big", groups: 20 }], 18, "07:00", 300);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.slots.filter((s) => s.wave === "B")).toHaveLength(2);
  });
});

describe("route", () => {
  it("never places a group on a hole twice in one wave and honors max group size", () => {
    const players = Array.from({ length: 100 }, (_, i) =>
      player({ index: 1 + (i % 28), birthdate: i % 3 === 0 ? "1960-01-01" : "1985-01-01" }),
    );
    const out = route(input(players));
    const seen = new Set<string>();
    for (const g of out.groups) {
      const key = `${g.wave}-${g.startHole}`;
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

  it("leaves ineligible and review players out of the groups", () => {
    const out = route(
      input([player({ index: 31 }), player({ index: null }), player({ index: 8 })]),
    );
    expect(out.groups.flatMap((g) => g.playerIds)).toHaveLength(1);
  });

  it("flags groups smaller than the minimum", () => {
    const out = route(input([player({ index: 5 }), player({ index: 6 })]));
    expect(out.warnings.some((w) => w.includes("only 2"))).toBe(true);
  });

  it("uses the two-tee plan when chosen", () => {
    const players = Array.from({ length: 16 }, () => player({ index: 8 }));
    const out = route(input(players, { startFormat: "two_tee" }));
    expect(out.groups.map((g) => g.startHole)).toEqual([1, 10, 1, 10]);
    expect(out.groups.every((g) => g.wave === null)).toBe(true);
  });
});

describe("locked groups", () => {
  it("leaves slots held by locked groups free when planning a shotgun", () => {
    const plan = planShotgun(
      [{ flightName: "A", groups: 3 }],
      18,
      "07:00",
      300,
      new Set(["A:1", "A:2"]),
    );
    expect(plan.slots.map((s) => s.startHole)).toEqual([3, 4, 5]);
    expect(plan.slots.every((s) => s.wave === "A")).toBe(true);
  });

  it("skips slots held by locked groups in a two-tee start", () => {
    const slots = planTwoTee(3, "07:00", 12, new Set(["1:07:00"]));
    expect(slots.map((s) => `${s.startHole}@${s.time}`)).toEqual([
      "10@07:00",
      "1@07:12",
      "10@07:12",
    ]);
  });

  it("never moves a locked group when the draw is re-run", () => {
    const players = Array.from({ length: 12 }, (_, i) => player({ index: 2 + i }));
    const first = route(input(players));
    const locked = first.groups.slice(0, 2);
    expect(locked).toHaveLength(2);

    const grown = [...players, player({ index: 6.4 }), player({ index: 7.1 })];
    const second = route({ ...input(grown), lockedGroups: locked });

    for (const before of locked) {
      const after = second.groups.find((g) => g.number === before.number);
      expect(after).toEqual(before);
    }
  });

  it("keeps locked players out of the groups it routes again", () => {
    const players = Array.from({ length: 16 }, (_, i) => player({ index: 2 + i }));
    const first = route(input(players));
    const locked = first.groups.slice(0, 2);
    const lockedIds = new Set(locked.flatMap((g) => g.playerIds));

    const second = route({ ...input(players), lockedGroups: locked });
    const rerouted = second.groups
      .filter((g) => !locked.some((l) => l.number === g.number))
      .flatMap((g) => g.playerIds);

    for (const id of lockedIds) expect(rerouted).not.toContain(id);
  });

  it("never puts two groups on the same hole in the same wave", () => {
    const players = Array.from({ length: 40 }, (_, i) => player({ index: 2 + (i % 28) }));
    const first = route(input(players));
    const locked = first.groups.slice(0, 5);
    const second = route({ ...input(players), lockedGroups: locked });

    const seen = new Set<string>();
    for (const g of second.groups) {
      const key = `${g.wave}-${g.startHole}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(new Set(second.groups.map((g) => g.number)).size).toBe(second.groups.length);
  });

  it("accounts for every eligible player exactly once when some groups are locked", () => {
    const players = Array.from({ length: 30 }, (_, i) => player({ index: 2 + (i % 28) }));
    const first = route(input(players));
    const locked = first.groups.slice(0, 3);
    const second = route({ ...input(players), lockedGroups: locked });

    const routed = second.groups.flatMap((g) => g.playerIds);
    expect(new Set(routed).size).toBe(routed.length);
    expect(routed.length).toBe(second.registrations.filter((r) => r.status === "ok").length);
  });

  it("re-runs a two-tee draw without moving a locked group", () => {
    const players = Array.from({ length: 12 }, (_, i) => player({ index: 2 + i }));
    const first = route(input(players, { startFormat: "two_tee" }));
    const locked = first.groups.slice(0, 1);
    const second = route({
      ...input([...players, player({ index: 5 }), player({ index: 5.5 })], {
        startFormat: "two_tee",
      }),
      lockedGroups: locked,
    });

    const after = second.groups.find((g) => g.number === (locked[0] as { number: number }).number);
    expect(after).toEqual(locked[0]);
    const slots = second.groups.map((g) => `${g.startHole}@${g.time}`);
    expect(new Set(slots).size).toBe(slots.length);
  });
});
