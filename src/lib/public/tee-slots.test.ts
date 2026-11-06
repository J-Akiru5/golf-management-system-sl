import { describe, expect, it } from "vitest";
import type { PublicTeeTimeDay, PublicTeeTimePlayer } from "@/lib/data/types";
import { teeBoardFor } from "./tee-slots";

const player = (
  name: string,
  teeTime: string | null,
  startHole: number | null = null,
): PublicTeeTimePlayer => ({ name, teeTime, startHole, confirmed: teeTime !== null });

const day = (players: PublicTeeTimePlayer[]): PublicTeeTimeDay => ({
  dayNumber: 1,
  label: "Day 1",
  playDate: "2026-11-12",
  startTime: "06:30",
  players,
});

describe("teeBoardFor", () => {
  it("returns an empty board when the day is missing", () => {
    expect(teeBoardFor(undefined)).toEqual({ slots: [], awaiting: 0, total: 0 });
  });

  it("says so with counts instead of listing everyone when nothing is confirmed", () => {
    const board = teeBoardFor(day([player("ARENAS, BUNNY", null), player("CAJILI, RICO", null)]));
    expect(board.slots).toEqual([]);
    expect(board.awaiting).toBe(2);
    expect(board.total).toBe(2);
  });

  it("groups players who share a time and hole", () => {
    const board = teeBoardFor(
      day([
        player("ALCARAZ, VIC", "06:30", 9),
        player("VILLA, RENE", "06:30", 9),
        player("AÑALUCAS, RIZALDY", "06:30", 9),
      ]),
    );
    expect(board.slots).toHaveLength(1);
    expect(board.slots[0]?.names).toEqual(["ALCARAZ, VIC", "VILLA, RENE", "AÑALUCAS, RIZALDY"]);
    expect(board.slots[0]?.startHole).toBe(9);
    expect(board.awaiting).toBe(0);
  });

  it("keeps two holes apart even when the time is the same", () => {
    const board = teeBoardFor(
      day([player("A", "06:30", 9), player("B", "06:30", 6), player("C", "06:30", 16)]),
    );
    expect(board.slots.map((slot) => slot.startHole)).toEqual([6, 9, 16]);
  });

  it("orders slots by the clock, then by hole", () => {
    const board = teeBoardFor(
      day([
        player("LATE", "12:30", 1),
        player("EARLY-B", "06:39", 2),
        player("EARLY-A", "06:39", 1),
        player("FIRST", "06:30", 18),
      ]),
    );
    expect(board.slots.map((slot) => `${slot.teeTime}/${slot.startHole}`)).toEqual([
      "06:30/18",
      "06:39/1",
      "06:39/2",
      "12:30/1",
    ]);
  });

  it("counts the unconfirmed alongside confirmed slots without listing them", () => {
    const board = teeBoardFor(
      day([player("CONFIRMED", "06:30", 9), player("WAITING", null), player("ALSO WAITING", null)]),
    );
    expect(board.slots).toHaveLength(1);
    expect(board.awaiting).toBe(2);
    expect(board.total).toBe(3);
  });

  it("counts a day with no players at all as an empty board", () => {
    expect(teeBoardFor(day([]))).toEqual({ slots: [], awaiting: 0, total: 0 });
  });
});
