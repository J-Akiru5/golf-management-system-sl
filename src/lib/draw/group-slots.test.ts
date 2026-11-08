import { describe, expect, it } from "vitest";
import { moveGroupToHole, reorderHoleQueue, swapGroupSlots } from "./group-slots";
import type { DrawGroup } from "./validate";

const group = (over: Partial<DrawGroup> & Pick<DrawGroup, "number" | "startHole" | "time">) =>
  ({
    flightId: "a",
    playerIds: [`p${over.number}`],
    wave: null,
    locked: false,
    ...over,
  }) satisfies DrawGroup;

const okDraw = (result: ReturnType<typeof swapGroupSlots>) => {
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
  return result.draw;
};
const find = (draw: DrawGroup[], number: number) => draw.find((g) => g.number === number);

describe("swapGroupSlots", () => {
  const draw = [
    group({ number: 1, startHole: 1, time: "06:30" }),
    group({ number: 2, startHole: 7, time: "06:45", flightId: "b", wave: "D1-AM-B" }),
    group({ number: 3, startHole: 9, time: "06:30" }),
  ];

  it("swaps time, hole and wave, keeps players and flight, and locks both", () => {
    const result = swapGroupSlots(draw, 1, 2);
    const next = okDraw(result);
    expect(find(next, 1)).toMatchObject({
      startHole: 7,
      time: "06:45",
      wave: "D1-AM-B",
      flightId: "a",
      playerIds: ["p1"],
      locked: true,
    });
    expect(find(next, 2)).toMatchObject({
      startHole: 1,
      time: "06:30",
      wave: null,
      flightId: "b",
      playerIds: ["p2"],
      locked: true,
    });
    expect(find(next, 3)?.locked).toBe(false);
    expect(result.ok && result.note).toBe("Group 1 and group 2 swapped starts.");
  });

  it("refuses the same group twice and unknown groups", () => {
    expect(swapGroupSlots(draw, 2, 2)).toEqual({ ok: false, reason: "Pick two different groups." });
    expect(swapGroupSlots(draw, 1, 99)).toEqual({
      ok: false,
      reason: "Group 99 is not in the draw.",
    });
    expect(swapGroupSlots(draw, 98, 1)).toEqual({
      ok: false,
      reason: "Group 98 is not in the draw.",
    });
  });

  it("does not change the draw it was given", () => {
    const copy = JSON.parse(JSON.stringify(draw));
    swapGroupSlots(draw, 1, 2);
    expect(draw).toEqual(copy);
  });
});

describe("moveGroupToHole", () => {
  const draw = [
    group({ number: 1, startHole: 1, time: "06:30" }),
    group({ number: 2, startHole: 2, time: "06:30" }),
    group({ number: 3, startHole: 2, time: "06:45", flightId: "b" }),
  ];

  it("moves a group to a vacant hole and locks it", () => {
    const result = moveGroupToHole(draw, 1, 5, 18);
    const next = okDraw(result);
    expect(find(next, 1)).toMatchObject({ startHole: 5, time: "06:30", locked: true });
    expect(find(next, 2)?.locked).toBe(false);
    expect(result.ok && result.note).toBe("Group 1 moved to hole 5.");
  });

  it("swaps holes with the group already there at the same time", () => {
    const result = moveGroupToHole(draw, 1, 2, 18);
    const next = okDraw(result);
    expect(find(next, 1)?.startHole).toBe(2);
    expect(find(next, 2)?.startHole).toBe(1);
    expect(find(next, 1)?.locked && find(next, 2)?.locked).toBe(true);
    expect(result.ok && result.note).toBe("Group 1 moved to hole 2; group 2 took hole 1.");
  });

  it("does not treat a group in another wave as being in the way", () => {
    // Group 3 is on hole 2 at 06:45, a different wave, so group 1 can move to hole 2 at 06:30...
    // but group 2 holds hole 2 at 06:30. Use a hole only wave 2 holds:
    const result = moveGroupToHole(
      [
        group({ number: 1, startHole: 1, time: "06:30" }),
        group({ number: 3, startHole: 4, time: "06:45" }),
      ],
      1,
      4,
      18,
    );
    const next = okDraw(result);
    expect(find(next, 1)?.startHole).toBe(4);
    expect(find(next, 3)).toMatchObject({ startHole: 4, time: "06:45", locked: false });
  });

  it("allows a move to the hole the group is already on and locks it", () => {
    const result = moveGroupToHole(draw, 1, 1, 18);
    const next = okDraw(result);
    expect(find(next, 1)).toMatchObject({ startHole: 1, locked: true });
    expect(result.ok && result.note).toBe("Group 1 is already on hole 1 and is now locked.");
  });

  it("refuses an unknown group and holes outside 1 to the course size", () => {
    expect(moveGroupToHole(draw, 99, 3, 18)).toEqual({
      ok: false,
      reason: "Group 99 is not in the draw.",
    });
    for (const hole of [0, 19, 2.5, -1, Number.NaN]) {
      expect(moveGroupToHole(draw, 1, hole, 18)).toEqual({
        ok: false,
        reason: "Hole must be a whole number from 1 to 18.",
      });
    }
  });

  it("does not change the draw it was given", () => {
    const copy = JSON.parse(JSON.stringify(draw));
    moveGroupToHole(draw, 1, 2, 18);
    expect(draw).toEqual(copy);
  });
});

describe("reorderHoleQueue", () => {
  const draw = [
    group({ number: 1, startHole: 1, time: "06:30" }),
    group({ number: 2, startHole: 1, time: "06:45", flightId: "b", wave: "w2" }),
    group({ number: 3, startHole: 1, time: "07:00", flightId: "c", wave: "w3" }),
    group({ number: 4, startHole: 2, time: "06:30" }),
  ];

  it("hands the times out in the new order, with their wave labels, and locks the hole's groups", () => {
    const result = reorderHoleQueue(draw, 1, [3, 2, 1]);
    const next = okDraw(result);
    expect(find(next, 3)).toMatchObject({ time: "06:30", wave: null, locked: true });
    expect(find(next, 2)).toMatchObject({ time: "06:45", wave: "w2", locked: true });
    expect(find(next, 1)).toMatchObject({ time: "07:00", wave: "w3", locked: true });
    expect(find(next, 4)).toMatchObject({ time: "06:30", locked: false });
    expect(result.ok && result.note).toBe("Hole 1 queue reordered.");
  });

  it("keeps each group's hole, flight and players", () => {
    const next = okDraw(reorderHoleQueue(draw, 1, [2, 3, 1]));
    expect(find(next, 2)).toMatchObject({ startHole: 1, flightId: "b", playerIds: ["p2"] });
  });

  it("allows a hole with one group and just locks it", () => {
    const next = okDraw(reorderHoleQueue(draw, 2, [4]));
    expect(find(next, 4)).toMatchObject({ time: "06:30", locked: true });
  });

  it("refuses a list that is not exactly the groups on the hole", () => {
    const reason = "The list must name exactly the groups on hole 1.";
    expect(reorderHoleQueue(draw, 1, [1, 2])).toEqual({ ok: false, reason });
    expect(reorderHoleQueue(draw, 1, [1, 2, 3, 4])).toEqual({ ok: false, reason });
    expect(reorderHoleQueue(draw, 1, [1, 1, 2])).toEqual({ ok: false, reason });
    expect(reorderHoleQueue(draw, 1, [1, 2, 9])).toEqual({ ok: false, reason });
  });

  it("does not change the draw it was given", () => {
    const copy = JSON.parse(JSON.stringify(draw));
    reorderHoleQueue(draw, 1, [3, 2, 1]);
    expect(draw).toEqual(copy);
  });
});
