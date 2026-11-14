import { describe, expect, it } from "vitest";
import { DEMO_CONFIG } from "@/lib/demo/data";
import type { Registration } from "@/lib/routing";
import { acceptsDrop, type DropIntent, type DropTarget, dropIntent } from "./drop-intent";
import type { DrawGroup } from "./validate";

// The board's own group size (4) and a flight name for the "different flight" note.
const config = DEMO_CONFIG;

const reg = (id: string, over: Partial<Registration> = {}): Registration => ({
  playerId: id,
  playerName: `Player ${id}`,
  status: "ok",
  reasons: [],
  index: 10,
  age: 40,
  categoryId: "regular",
  teeId: "white",
  playingHandicap: 10,
  flightId: "r-a",
  ...over,
});

const grp = (number: number, ids: string[], over: Partial<DrawGroup> = {}): DrawGroup => ({
  number,
  flightId: "r-a",
  playerIds: ids,
  startHole: number,
  wave: "A",
  time: "07:00",
  locked: false,
  ...over,
});

const names = { flight: (id: string | null) => id ?? "—" };
const nameOf = (id: string) => `Player ${id}`;

/** Two full groups, a group with two places, and an empty group with one place. */
const board: DrawGroup[] = [
  grp(1, ["p1", "p2", "p3", "p4"]),
  grp(2, ["p5", "p6", "p7", "p8"]),
  grp(3, ["p9", "p10"]),
  grp(4, ["p11", "p12", "p13"]),
];
const regs = new Map(
  ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11", "p12", "p13", "pool"].map(
    (id) => [id, reg(id)],
  ),
);

function intent(
  playerId: string,
  target: DropTarget,
  over: {
    draw?: DrawGroup[];
    pairOf?: (id: string) => readonly string[];
    members?: Map<string, Registration>;
  } = {},
): DropIntent {
  return dropIntent({
    draw: over.draw ?? board,
    config,
    regs: over.members ?? regs,
    names,
    playerId,
    target,
    pairOf: over.pairOf ?? (() => []),
    nameOf,
  });
}

describe("dropIntent: dropping one player on another", () => {
  it("means a swap, even between two full groups", () => {
    const result = intent("p1", { kind: "player", playerId: "p5" });
    expect(result).toEqual({
      kind: "swap",
      a: "p1",
      b: "p5",
      label: "Swap Player p1 with Player p5.",
    });
    expect(acceptsDrop(result)).toBe(true);
  });

  it("refuses a swap with a player in the same group, using the swap action's own words", () => {
    expect(intent("p1", { kind: "player", playerId: "p3" })).toEqual({
      kind: "refused",
      reason: "Both players are in group 1, so there is nothing to swap.",
    });
  });

  it("refuses the same player twice", () => {
    expect(intent("p1", { kind: "player", playerId: "p1" })).toEqual({
      kind: "refused",
      reason: "That is the same player.",
    });
  });

  it("refuses a swap for a player from the pool, who has no group to give", () => {
    const result = intent("pool", { kind: "player", playerId: "p5" });
    expect(result.kind).toBe("refused");
    expect(result.kind === "refused" && result.reason).toContain("is not in a group yet");
  });

  it("refuses a swap with a player who is not on the board", () => {
    expect(intent("p1", { kind: "player", playerId: "ghost" })).toEqual({
      kind: "refused",
      reason: "One of those players is not on the board.",
    });
  });
});

describe("dropIntent: dropping one player on a group", () => {
  it("means a move when the group has room", () => {
    expect(intent("p1", { kind: "group", group: 3 })).toEqual({
      kind: "move",
      playerId: "p1",
      toGroup: 3,
      label: "Move Player p1 to group 3.",
      note: null,
    });
    expect(acceptsDrop(intent("p1", { kind: "group", group: 3 }))).toBe(true);
  });

  it("still moves with one place left, and says when the flight differs", () => {
    const members = new Map(regs);
    members.set("p9", reg("p9", { flightId: "r-b" }));
    // Group 4 holds three, so one place is left, and p9 is drawn in another flight.
    const result = intent("p9", { kind: "group", group: 4 }, { members });
    expect(result.kind).toBe("move");
    expect(result.kind === "move" && result.note).toBe("Different flight from this group (r-a).");
  });

  it("offers a swap when the group is full, rather than refusing", () => {
    const result = intent("p9", { kind: "group", group: 1 });
    expect(result).toEqual({
      kind: "pickSwap",
      playerId: "p9",
      group: 1,
      label: "Group 1 is full. Choose a player in it to swap with Player p9.",
    });
    expect(acceptsDrop(result)).toBe(true);
  });

  it("refuses a full group for a player who is already in it", () => {
    expect(intent("p1", { kind: "group", group: 1 })).toEqual({
      kind: "refused",
      reason: "Already in group 1.",
    });
  });

  it("refuses a locked group with room, in the move action's own words", () => {
    const locked = board.map((g) => (g.number === 3 ? { ...g, locked: true } : g));
    expect(intent("p1", { kind: "group", group: 3 }, { draw: locked })).toEqual({
      kind: "refused",
      reason: "Group 3 is locked. Unlock it to add players.",
    });
  });

  it("refuses to take a player out of a locked group", () => {
    const locked = board.map((g) => (g.number === 1 ? { ...g, locked: true } : g));
    expect(intent("p1", { kind: "group", group: 3 }, { draw: locked })).toEqual({
      kind: "refused",
      reason: "Group 1 is locked. Unlock it to move this player.",
    });
  });

  it("refuses a group that is not on this board", () => {
    expect(intent("p1", { kind: "group", group: 99 })).toEqual({
      kind: "refused",
      reason: "Group 99 is not on this board.",
    });
  });

  it("lets a player from the pool join a group with room", () => {
    expect(intent("pool", { kind: "group", group: 3 }).kind).toBe("move");
  });
});

describe("dropIntent: the registered pair", () => {
  const pairs = (id: string) =>
    (({ p1: ["p2"], p2: ["p1"], p5: ["pool"] })[id] as string[] | undefined) ?? [];

  it("offers the pair when the partner is in the same group and two places are free", () => {
    const result = intent("p1", { kind: "group", group: 3 }, { pairOf: pairs });
    expect(result).toEqual({
      kind: "moveOrPair",
      playerId: "p1",
      partnerId: "p2",
      toGroup: 3,
      label: "Move Player p1 to group 3, or take the pair with Player p2.",
    });
  });

  it("only offers the single player when the target has one place left", () => {
    const result = intent("p1", { kind: "group", group: 4 }, { pairOf: pairs });
    expect(result.kind).toBe("move");
  });

  it("only offers the single player when the partner has already been split off", () => {
    const split = board.map((g) => (g.number === 1 ? { ...g, playerIds: ["p1", "p3", "p4"] } : g));
    const result = intent("p1", { kind: "group", group: 3 }, { draw: split, pairOf: pairs });
    // p2 is no longer beside p1, so the pair is not on this group to take along.
    expect(result.kind).toBe("move");
  });
});
