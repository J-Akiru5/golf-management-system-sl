import { describe, expect, it } from "vitest";
import { planShotgunFrom } from "./schedule";

const holesOf = (slots: { startHole: number; time: string }[], time: string) =>
  slots.filter((slot) => slot.time === time).map((slot) => slot.startHole);

describe("flights are waves of groups, classes only set the order", () => {
  // `true` is the rule the club plays by: fill the holes in class order, then the next wave.
  const plan = (counts: { flightName: string; groups: number }[], seed?: number) =>
    planShotgunFrom(counts, 18, "06:30", 15, new Set(), seed, true);

  it("puts the first 18 groups in Flight A and the rest in Flight B, whatever their class", () => {
    const out = plan([
      { flightName: "Class A", groups: 10 },
      { flightName: "Class B", groups: 12 },
    ]);
    expect(holesOf(out.slots, "06:30")).toHaveLength(18);
    expect(holesOf(out.slots, "06:45")).toHaveLength(4);
    // Class B straddles the two flights and the draw says so.
    expect(out.warnings.join(" ")).toContain("Class Class B plays across");
  });

  it("has only Flight A when there are fewer than 18 groups, even with several classes", () => {
    const out = plan([
      { flightName: "Class A", groups: 10 },
      { flightName: "Class B", groups: 6 },
    ]);
    expect(out.slots.every((slot) => slot.time === "06:30")).toBe(true);
    expect(out.slots).toHaveLength(16);
  });

  it("scatters the vacant holes through Flight A when a seed is given", () => {
    const out = plan([{ flightName: "Class A", groups: 10 }], 42);
    const used = holesOf(out.slots, "06:30");
    expect(new Set(used).size).toBe(10);
    expect(used.some((hole) => hole > 10)).toBe(true);
  });

  it("starts Flight B on hole 1 when Flight A used all 18 holes", () => {
    const out = plan([{ flightName: "Class A", groups: 24 }]);
    expect(holesOf(out.slots, "06:30")).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(holesOf(out.slots, "06:45")).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("opens a third flight only after two full ones", () => {
    const out = plan([{ flightName: "Class A", groups: 37 }]);
    expect(holesOf(out.slots, "06:30")).toHaveLength(18);
    expect(holesOf(out.slots, "06:45")).toHaveLength(18);
    expect(holesOf(out.slots, "07:00")).toHaveLength(1);
  });
});

describe("seeded hole assignment", () => {
  it("gives one group per hole, all 18 holes, at one start", () => {
    const plan = planShotgunFrom(
      [{ flightName: "Class A", groups: 18 }],
      18,
      "06:30",
      15,
      new Set(),
      42,
    );

    expect(plan.slots).toHaveLength(18);
    expect(new Set(holesOf(plan.slots, "06:30")).size).toBe(18);
    expect(plan.slots.every((slot) => slot.time === "06:30")).toBe(true);
  });

  it("spreads a class around the course instead of running down holes 1..18", () => {
    const plan = planShotgunFrom(
      [{ flightName: "Class A", groups: 18 }],
      18,
      "06:30",
      15,
      new Set(),
      42,
    );

    expect(holesOf(plan.slots, "06:30")).not.toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });

  it("gives each start its own order and puts the overflow one gap later", () => {
    const plan = planShotgunFrom(
      [
        { flightName: "Class A", groups: 18 },
        { flightName: "Class B", groups: 18 },
      ],
      18,
      "06:30",
      15,
      new Set(),
      42,
    );

    expect(plan.slots).toHaveLength(36);
    expect(holesOf(plan.slots, "06:30")).not.toEqual(holesOf(plan.slots, "06:45"));
    expect(new Set(holesOf(plan.slots, "06:45")).size).toBe(18);
  });

  it("reproduces the same board from the same seed", () => {
    const once = planShotgunFrom(
      [{ flightName: "Class A", groups: 18 }],
      18,
      "06:30",
      15,
      new Set(),
      7,
    );
    const twice = planShotgunFrom(
      [{ flightName: "Class A", groups: 18 }],
      18,
      "06:30",
      15,
      new Set(),
      7,
    );

    expect(holesOf(once.slots, "06:30")).toEqual(holesOf(twice.slots, "06:30"));
  });

  it("keeps the holes in order when no seed is given", () => {
    const plan = planShotgunFrom([{ flightName: "Class A", groups: 4 }], 18, "06:30", 15);

    expect(holesOf(plan.slots, "06:30")).toEqual([1, 2, 3, 4]);
  });

  it("never lands on a hole a locked group holds", () => {
    const plan = planShotgunFrom(
      [{ flightName: "Class A", groups: 17 }],
      18,
      "06:30",
      15,
      new Set(["06:30:5"]),
      3,
    );

    expect(holesOf(plan.slots, "06:30")).not.toContain(5);
    expect(new Set(holesOf(plan.slots, "06:30")).size).toBe(17);
  });
});

describe("guards against an impossible start", () => {
  it("refuses a shotgun start with no holes", () => {
    expect(() => planShotgunFrom([{ flightName: "Class A", groups: 1 }], 0, "06:30", 15)).toThrow(
      "A shotgun start needs at least one hole.",
    );
    expect(() => planShotgunFrom([{ flightName: "Class A", groups: 1 }], -1, "06:30", 15)).toThrow(
      "A shotgun start needs at least one hole.",
    );
    expect(() => planShotgunFrom([{ flightName: "Class A", groups: 1 }], 2.5, "06:30", 15)).toThrow(
      "A shotgun start needs at least one hole.",
    );
  });

  it("throws instead of searching forever when no slot can ever be free", () => {
    // A zero gap means every start is the same time, and both holes are held there, so no start
    // after the first can offer a slot. The search must give up instead of looping.
    expect(() =>
      planShotgunFrom(
        [{ flightName: "A", groups: 1 }],
        2,
        "06:30",
        0,
        new Set(["06:30:1", "06:30:2"]),
      ),
    ).toThrow("No shotgun slot is free");
  });
});
