import { describe, expect, it } from "vitest";
import { type BoardGroupRef, type BoardPlayer, nameKey, parseBoardCommand } from "./board-command";

const players: BoardPlayer[] = [
  { id: "p1", name: "CELINO, ALAN" },
  { id: "p2", name: "BRIONES, EDWIN" },
  { id: "p3", name: "CELINO, BEN" },
  { id: "p4", name: "SANTOS, MARIA" },
  { id: "p5", name: "REYES, CARL" },
];

const groups: BoardGroupRef[] = [
  { number: 1, startHole: 1 },
  { number: 3, startHole: 5 },
  { number: 7, startHole: 12 },
  { number: 8, startHole: 12 },
];

const read = (text: string, pins: Record<string, string> = {}) =>
  parseBoardCommand(text, players, groups, pins);

describe("the command box", () => {
  it("reads a swap of two players and shows the plan by their full names", () => {
    const result = read("swap alan with edwin");
    expect(result).toEqual({
      ok: true,
      plan: { kind: "swapPlayers", a: "p1", b: "p2" },
      summary: "Swap CELINO, ALAN with BRIONES, EDWIN",
    });
  });

  it("ignores case and extra spaces", () => {
    const result = read("  SWAP   Alan   WITH   Edwin ");
    expect(result.ok && result.plan).toEqual({ kind: "swapPlayers", a: "p1", b: "p2" });
  });

  it("reads a swap of two pairs into one plan of two sets", () => {
    const result = read("swap alan and santos with edwin and reyes");
    expect(result).toEqual({
      ok: true,
      plan: { kind: "swapSets", setA: ["p1", "p4"], setB: ["p2", "p5"] },
      summary: "Swap CELINO, ALAN and SANTOS, MARIA with BRIONES, EDWIN and REYES, CARL",
    });
  });

  it("takes commas as well as “and” between names", () => {
    const result = read("swap alan, santos with edwin, reyes");
    expect(result.ok && result.plan).toEqual({
      kind: "swapSets",
      setA: ["p1", "p4"],
      setB: ["p2", "p5"],
    });
  });

  it("moves several players to a named group", () => {
    const result = read("move alan, santos to group 7");
    expect(result).toEqual({
      ok: true,
      plan: { kind: "move", playerIds: ["p1", "p4"], toGroup: 7 },
      summary: "Move CELINO, ALAN and SANTOS, MARIA to group 7",
    });
  });

  it("resolves a hole to the one group that starts there", () => {
    const result = read("move alan to hole 5");
    expect(result.ok && result.plan).toEqual({ kind: "move", playerIds: ["p1"], toGroup: 3 });
  });

  it("never acts on a name that fits more than one player", () => {
    const result = read("swap celino with edwin");
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      ok: false,
      error: "“celino” matches 2 players. Pick the one you mean.",
      candidates: [
        { id: "p1", name: "CELINO, ALAN" },
        { id: "p3", name: "CELINO, BEN" },
      ],
    });
  });

  it("acts on the candidate the desk picked, without retyping the command", () => {
    const result = read("swap celino with edwin", { [nameKey("celino")]: "p3" });
    expect(result.ok && result.plan).toEqual({ kind: "swapPlayers", a: "p3", b: "p2" });
  });

  it("says plainly what it cannot read", () => {
    expect(read("")).toEqual({
      ok: false,
      error: "Type a command, for example “swap CELINO with BRIONES”.",
      candidates: [],
    });
    const help = read("put alan with edwin please");
    expect(help.ok).toBe(false);
    expect(help.ok === false && help.error).toContain("I can read");
  });

  it("names the unknown player, unknown group and unknown hole", () => {
    expect(read("move nobody to group 7")).toEqual({
      ok: false,
      error: "No player on the board is called “nobody”.",
      candidates: [],
    });
    expect(read("move alan to group 99")).toEqual({
      ok: false,
      error: "Group 99 is not on the board.",
      candidates: [],
    });
    expect(read("move alan to hole 18")).toEqual({
      ok: false,
      error: "No group starts on hole 18.",
      candidates: [],
    });
  });

  it("refuses a hole shared by two groups and names them", () => {
    expect(read("move alan to hole 12")).toEqual({
      ok: false,
      error: "Hole 12 has 2 groups (7 and 8). Say “to group 7” instead.",
      candidates: [],
    });
  });

  it("refuses two sides of different sizes, one player twice, and one player on both sides", () => {
    expect(read("swap alan and santos with edwin")).toEqual({
      ok: false,
      error: "Swap needs the same number of players on each side (2 and 1).",
      candidates: [],
    });
    expect(read("swap alan with alan")).toEqual({
      ok: false,
      error: "Pick two different players.",
      candidates: [],
    });
    expect(read("move alan and alan to group 7")).toEqual({
      ok: false,
      error: "A player is listed twice.",
      candidates: [],
    });
    expect(read("swap alan and santos with alan and reyes")).toEqual({
      ok: false,
      error: "A player cannot be on both sides.",
      candidates: [],
    });
  });

  it("matches a name without its accent", () => {
    const result = parseBoardCommand(
      "move pena to group 7",
      [{ id: "x", name: "PEÑA, JOSE" }],
      groups,
    );
    expect(result.ok && result.plan).toEqual({ kind: "move", playerIds: ["x"], toGroup: 7 });
  });
});
