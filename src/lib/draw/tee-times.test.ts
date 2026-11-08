import { describe, expect, it } from "vitest";
import { daySessions } from "@/lib/data/sessions";
import {
  batchLetters,
  placementsFromDraw,
  parseBatchLabel,
  sessionForRow,
} from "./tee-times";
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

  it("takes only the selected day's groups when the board names days", () => {
    const board = [
      group({ number: 1, startHole: 1, time: "06:30", wave: "D1-AM-A", playerIds: ["p1"] }),
      group({ number: 9, startHole: 10, time: "12:30", wave: "D3-PM-B", playerIds: ["p2"] }),
    ];
    const third = placementsFromDraw(board, 3);
    expect(third.has("p1")).toBe(false);
    expect(third.get("p2")).toMatchObject({ time: "12:30", startHole: 10, groupNumber: 9 });
  });

  it("uses a group's stored day number when it has no label", () => {
    const board = [
      group({ number: 1, startHole: 1, time: "06:30", playerIds: ["p1"] }),
      { ...group({ number: 2, startHole: 2, time: "07:00", playerIds: ["p2"] }), dayNumber: 2 },
    ];
    const first = placementsFromDraw(board, 1);
    expect(first.has("p1")).toBe(true);
    expect(first.has("p2")).toBe(false);
  });

  it("keeps only the batch letter, never the whole label", () => {
    const placed = placementsFromDraw(
      [group({ number: 5, startHole: 5, time: "06:39", wave: "D2-AM-C", playerIds: ["p4"] })],
      2,
    );
    expect(placed.get("p4")).toMatchObject({ batch: "C", session: "AM" });
    expect(placed.get("p4")?.batch).toBe("C");
  });
});

describe("parseBatchLabel", () => {
  it("reads the day, session and batch from a stored label", () => {
    expect(parseBatchLabel("D3-PM-B")).toEqual({ dayNumber: 3, session: "PM", batch: "B" });
  });

  it("reads a session and batch with no day", () => {
    expect(parseBatchLabel("AM-A")).toEqual({ dayNumber: null, session: "AM", batch: "A" });
  });

  it("treats a single letter as a batch, not a session", () => {
    expect(parseBatchLabel("b")).toEqual({ dayNumber: null, session: null, batch: "B" });
  });

  it("returns nothing for an empty or unreadable label", () => {
    expect(parseBatchLabel(null)).toEqual({ dayNumber: null, session: null, batch: null });
    expect(parseBatchLabel("morning group")).toEqual({
      dayNumber: null,
      session: null,
      batch: null,
    });
  });
});

describe("sessionForRow", () => {
  const sessions = daySessions(0, 2);

  it("prefers the session the desk recorded", () => {
    expect(
      sessionForRow({ chosen: "PM", placement: "AM", time: "06:30", sessions }),
    ).toBe("PM");
  });

  it("takes the draw label when the day has no recorded session", () => {
    expect(sessionForRow({ chosen: null, placement: "PM", time: "06:30", sessions })).toBe("PM");
  });

  it("falls back to the time against the day's own sessions", () => {
    expect(sessionForRow({ chosen: null, placement: null, time: "12:30", sessions })).toBe("PM");
    expect(sessionForRow({ chosen: null, placement: null, time: null, sessions })).toBeNull();
  });
});

describe("batchLetters", () => {
  it("offers a letter for every start the field needs", () => {
    expect(batchLetters(1)).toEqual(["A"]);
    expect(batchLetters(3)).toEqual(["A", "B", "C"]);
  });

  it("offers nothing for a nonsense count instead of inventing a letter", () => {
    expect(batchLetters(0)).toEqual([]);
    expect(batchLetters(Number.NaN)).toEqual([]);
  });
});
