import { describe, expect, it } from "vitest";
import { teeTimesFromDraw } from "./tee-times";
import type { DrawGroup } from "./validate";

const group = (over: Partial<DrawGroup> & { number: number; playerIds: string[] }): DrawGroup => ({
  startHole: 1,
  wave: "A",
  time: "06:30",
  flightId: "class-a",
  locked: false,
  ...over,
});

describe("teeTimesFromDraw", () => {
  it("gives a player the wave time and hole of their own group", () => {
    const times = teeTimesFromDraw([
      group({ number: 1, startHole: 1, wave: "A", time: "06:30", playerIds: ["p1", "p2"] }),
      group({ number: 2, startHole: 2, wave: "B", time: "06:45", playerIds: ["p3"] }),
    ]);

    expect(times.get("p1")).toEqual({
      teeTime: "06:30",
      wave: "A",
      startHole: 1,
      groupNumber: 1,
    });
    expect(times.get("p3")).toEqual({
      teeTime: "06:45",
      wave: "B",
      startHole: 2,
      groupNumber: 2,
    });
  });

  it("keeps a two-tee group's time with no wave letter", () => {
    const times = teeTimesFromDraw([
      group({ number: 4, startHole: 10, wave: null, time: "07:12", playerIds: ["p9"] }),
    ]);

    expect(times.get("p9")).toMatchObject({ teeTime: "07:12", wave: null, startHole: 10 });
  });

  it("keeps the first group's time when the draw lists a player twice", () => {
    const times = teeTimesFromDraw([
      group({ number: 1, time: "06:30", playerIds: ["p1"] }),
      group({ number: 2, time: "06:45", playerIds: ["p1"] }),
    ]);

    expect(times.get("p1")?.teeTime).toBe("06:30");
    expect(times.size).toBe(1);
  });

  it("has nothing to give when there is no draw", () => {
    expect(teeTimesFromDraw([]).size).toBe(0);
  });
});
