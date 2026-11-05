import { describe, expect, it } from "vitest";
import { placementsFromDraw } from "./tee-times";
import type { DrawGroup } from "./validate";

const group = (over: Partial<DrawGroup> & { number: number; playerIds: string[] }): DrawGroup => ({
  startHole: 1,
  wave: "A",
  time: "06:30",
  flightId: "class-a",
  locked: false,
  ...over,
});

describe("placementsFromDraw", () => {
  it("gives a player the wave and hole of their own group", () => {
    const placed = placementsFromDraw([
      group({ number: 1, startHole: 1, wave: "A", playerIds: ["p1", "p2"] }),
      group({ number: 2, startHole: 2, wave: "B", playerIds: ["p3"] }),
    ]);

    expect(placed.get("p1")).toEqual({ wave: "A", startHole: 1, groupNumber: 1 });
    expect(placed.get("p3")).toEqual({ wave: "B", startHole: 2, groupNumber: 2 });
  });

  it("keeps a two-tee group's hole with no wave letter", () => {
    const placed = placementsFromDraw([
      group({ number: 4, startHole: 10, wave: null, playerIds: ["p9"] }),
    ]);

    expect(placed.get("p9")).toMatchObject({ wave: null, startHole: 10 });
  });

  it("keeps the first group when the draw lists a player twice", () => {
    const placed = placementsFromDraw([
      group({ number: 1, wave: "A", playerIds: ["p1"] }),
      group({ number: 2, wave: "B", playerIds: ["p1"] }),
    ]);

    expect(placed.get("p1")?.wave).toBe("A");
    expect(placed.size).toBe(1);
  });

  it("has nothing to give when there is no draw", () => {
    expect(placementsFromDraw([]).size).toBe(0);
  });
});
