import { describe, expect, it } from "vitest";
import { planShotgunFrom } from "./schedule";

const holesOf = (slots: { startHole: number; time: string }[], time: string) =>
  slots.filter((slot) => slot.time === time).map((slot) => slot.startHole);

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
