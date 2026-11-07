import { describe, expect, it } from "vitest";
import { placementsFromDraw } from "./tee-times";
import type { DrawGroup } from "./validate";

const group = (over: Partial<DrawGroup> & { number: number; playerIds: string[] }): DrawGroup => ({
  startHole: 1,
  wave: null,
  time: "06:30",
  flightId: "class-a",
  locked: false,
  ...over,
});

describe("placementsFromDraw", () => {
  it("gives a player the start time and hole of their own group", () => {
    const placed = placementsFromDraw([
      group({ number: 1, startHole: 1, time: "06:30", playerIds: ["p1", "p2"] }),
      group({ number: 2, startHole: 2, time: "12:00", playerIds: ["p3"] }),
    ]);

    expect(placed.get("p1")).toEqual({ time: "06:30", startHole: 1, groupNumber: 1 });
    expect(placed.get("p3")).toEqual({ time: "12:00", startHole: 2, groupNumber: 2 });
  });

  it("keeps a two-tee group's own time and hole", () => {
    const placed = placementsFromDraw([
      group({ number: 4, startHole: 10, time: "07:12", playerIds: ["p9"] }),
    ]);

    expect(placed.get("p9")).toMatchObject({ time: "07:12", startHole: 10 });
  });

  it("keeps the first group when the draw lists a player twice", () => {
    const placed = placementsFromDraw([
      group({ number: 1, time: "06:30", playerIds: ["p1"] }),
      group({ number: 2, time: "12:00", playerIds: ["p1"] }),
    ]);

    expect(placed.get("p1")?.time).toBe("06:30");
    expect(placed.size).toBe(1);
  });

  it("has nothing to give when there is no draw", () => {
    expect(placementsFromDraw([]).size).toBe(0);
  });
});
