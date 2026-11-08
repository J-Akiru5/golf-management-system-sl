import { describe, expect, it } from "vitest";
import { planShotgunFrom } from "./schedule";

const holesOf = (slots: { startHole: number; time: string }[], time: string) =>
  slots.filter((slot) => slot.time === time).map((slot) => slot.startHole);

describe("one flight per wave", () => {
  const plan = (counts: { flightName: string; groups: number }[], seed?: number) =>
    planShotgunFrom(counts, 18, "06:30", 15, new Set(), seed, false, true);

  it("fills 18 holes with Flight A, then queues Flight B at the next start", () => {
    const out = plan([
      { flightName: "A", groups: 18 },
      { flightName: "B", groups: 6 },
    ]);
    expect(holesOf(out.slots, "06:30")).toHaveLength(18);
    expect(holesOf(out.slots, "06:45")).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("keeps Flight B out of the vacant holes when Flight A does not fill all 18", () => {
    const out = plan([
      { flightName: "A", groups: 10 },
      { flightName: "B", groups: 6 },
    ]);
    expect(holesOf(out.slots, "06:30")).toHaveLength(10);
    expect(holesOf(out.slots, "06:45")).toHaveLength(6);
  });

  it("scatters the vacant holes through the wave when a seed is given", () => {
    const out = plan([{ flightName: "A", groups: 10 }], 42);
    const used = holesOf(out.slots, "06:30");
    expect(new Set(used).size).toBe(10);
    // Ten groups drawn at random from 18 holes do not all sit on holes 1 to 10.
    expect(used.some((hole) => hole > 10)).toBe(true);
  });

  it("starts the next flight in a fresh wave after one that overflowed", () => {
    const out = plan([
      { flightName: "A", groups: 20 },
      { flightName: "B", groups: 3 },
    ]);
    expect(holesOf(out.slots, "06:30")).toHaveLength(18);
    expect(holesOf(out.slots, "06:45")).toHaveLength(2);
    expect(holesOf(out.slots, "07:00")).toHaveLength(3);
    expect(out.warnings.join(" ")).toContain("Flight A has 20 groups");
  });

  it("changes nothing for the old rule when the option is off", () => {
    const old = planShotgunFrom(
      [
        { flightName: "A", groups: 10 },
        { flightName: "B", groups: 6 },
      ],
      18,
      "06:30",
      15,
    );
    // Without the option B shares the first start with A.
    expect(holesOf(old.slots, "06:30")).toHaveLength(16);
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
