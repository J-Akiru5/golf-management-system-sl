import { describe, expect, it } from "vitest";
import type { DrawGroup } from "@/lib/draw/validate";
import { placeWalkUp } from "./place";

const group = (
  number: number,
  flightId: string,
  time: string,
  playerIds: string[],
  locked = false,
): DrawGroup => ({
  number,
  flightId,
  startHole: number,
  wave: null,
  time,
  playerIds,
  locked,
});

const draw = (): DrawGroup[] => [
  group(1, "a", "06:30", ["p1", "p2", "p3"]),
  group(2, "a", "06:30", ["p4", "p5", "p6", "p7"]),
  group(3, "b", "06:30", ["p8"]),
  group(4, "a", "12:30", ["p9"]),
  group(5, "a", "06:30", ["p10"], true),
];

const registration = (over: Partial<Parameters<typeof placeWalkUp>[0]["registration"]> = {}) => ({
  playerId: "p-new",
  status: "ok" as const,
  flightId: "a",
  reasons: [] as string[],
  ...over,
});

const run = (
  over: Partial<Parameters<typeof placeWalkUp>[0]> = {},
): ReturnType<typeof placeWalkUp> =>
  placeWalkUp({
    draw: draw(),
    registration: registration(),
    session: "AM",
    dayIndex: 0,
    dayCount: 4,
    groupSize: 4,
    ...over,
  });

describe("placing a walk-up", () => {
  it("fills the fullest open group in the same class and session", () => {
    const out = run();
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.groupNumber).toBe(1);
    expect(out.draw.find((entry) => entry.number === 1)?.playerIds).toEqual([
      "p1",
      "p2",
      "p3",
      "p-new",
    ]);
    expect(out.draw).toHaveLength(5);
  });

  it("places in the afternoon group when the walk-up chose PM", () => {
    const out = run({ session: "PM" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.groupNumber).toBe(4);
    expect(out.draw.find((entry) => entry.number === 4)?.playerIds).toEqual(["p9", "p-new"]);
  });

  it("never uses a full group, another class, a locked group or the other session", () => {
    const out = run({
      draw: [
        group(2, "a", "06:30", ["p4", "p5", "p6", "p7"]),
        group(3, "b", "06:30", ["p8"]),
        group(5, "a", "06:30", ["p10"], true),
        group(4, "a", "12:30", ["p9"]),
      ],
    });
    expect(out).toEqual({
      ok: false,
      reason: "No group in this player's class has an open place in the AM session.",
    });
  });

  it("refuses a player the routing rules left for review", () => {
    expect(
      run({
        registration: registration({
          status: "needs_review",
          flightId: null,
          reasons: ["No category fits a 40-year-old (F)."],
        }),
      }),
    ).toEqual({ ok: false, reason: "No category fits a 40-year-old (F)." });
  });

  it("refuses when the day has no draw", () => {
    expect(run({ draw: null })).toEqual({
      ok: false,
      reason: "No draw has been made for this day yet.",
    });
  });

  it("does not mutate the board and does not invent a group", () => {
    const before = draw();
    const out = run({ draw: before, registration: registration({ playerId: "p9" }) });
    expect(out.ok).toBe(false);
    expect(before.map((entry) => entry.playerIds)).toEqual([
      ["p1", "p2", "p3"],
      ["p4", "p5", "p6", "p7"],
      ["p8"],
      ["p9"],
      ["p10"],
    ]);
  });
});
