import { describe, expect, it } from "vitest";
import type { PublicTeamStanding } from "@/lib/data/public-team-leaderboard";
import {
  buildAwardingBoard,
  buildAwardingBoards,
  categoryIsClass,
  laneClassLetter,
  laneScoreBasis,
  laneTitle,
} from "./awarding";
import { parseAwardingBoard, parseLaneRevealMap } from "./results-reveal";

/** A pair as the public board gives it: a name, a class list and the two published totals. */
function team(
  name: string,
  categories: string[],
  netPoints: number | null,
  grossPoints: number | null,
): PublicTeamStanding {
  return {
    key: name,
    pairNumber: null,
    name,
    playerNames: [name],
    playerIds: [name],
    memberName: name,
    guestName: null,
    members: [],
    flightName: null,
    categories,
    holesCounted: 36,
    holesTotal: 36,
    grossStrokes: 150,
    netStrokes: 130,
    parTotal: 144,
    grossPoints,
    netPoints,
    toPar: "E",
    roundsCounted: 2,
    rank: 1,
    tied: false,
  };
}

const FIELD: PublicTeamStanding[] = [
  team("A1 / A1b", ["Class A"], 42, 34),
  team("A2 / A2b", ["Class A"], 40, 36),
  team("A3 / A3b", ["Class A"], 38, 33),
  team("A4 / A4b", ["Class A"], 36, 31),
  team("B1 / B1b", ["Class B"], 41, 35),
  team("B2 / B2b", ["Class B"], 37, 32),
  team("C1 / C1b", ["Class C"], 39, 30),
  team("D1 / D1b", ["Class D"], 35, 29),
];

describe("the awarding lanes", () => {
  it("names the lanes the desk and the public page print", () => {
    expect(laneTitle("classA")).toBe("Class A");
    expect(laneTitle("netOverall")).toBe("Net overall");
    // A class lane is awarded on net points; the gross overall board on gross points.
    expect(laneScoreBasis("classB")).toBe("net");
    expect(laneScoreBasis("netOverall")).toBe("net");
    expect(laneScoreBasis("grossOverall")).toBe("gross");
    expect(laneClassLetter("classC")).toBe("c");
    expect(laneClassLetter("netOverall")).toBeNull();
  });

  it("matches the class the club typed, whatever the case or separator", () => {
    expect(categoryIsClass("Class A", "a")).toBe(true);
    expect(categoryIsClass("class b", "b")).toBe(true);
    expect(categoryIsClass("CLASS_C", "c")).toBe(true);
    expect(categoryIsClass("A", "a")).toBe(true);
    expect(categoryIsClass("Class A", "b")).toBe(false);
    expect(categoryIsClass("Regular", "a")).toBe(false);
  });
});

describe("a proposed board", () => {
  it("is the top three of the lane, in lane order", () => {
    const board = buildAwardingBoard(FIELD, "classA");
    expect(board.map((row) => row.name)).toEqual(["A1 / A1b", "A2 / A2b", "A3 / A3b"]);
    expect(board.map((row) => row.position)).toEqual([1, 2, 3]);
    // The class lane prints net points.
    expect(board.map((row) => row.score)).toEqual([42, 40, 38]);
    expect(board.every((row) => row.tie === false)).toBe(true);
  });

  it("never mixes classes into a class board", () => {
    expect(buildAwardingBoard(FIELD, "classD").map((row) => row.name)).toEqual(["D1 / D1b"]);
    expect(buildAwardingBoard(FIELD, "classB").map((row) => row.score)).toEqual([41, 37]);
  });

  it("ranks the overall boards across every class, on that board's basis", () => {
    expect(buildAwardingBoard(FIELD, "netOverall").map((row) => row.name)).toEqual([
      "A1 / A1b",
      "B1 / B1b",
      "A2 / A2b",
    ]);
    // Gross is a different order: the board is awarded on the gross points it prints.
    const gross = buildAwardingBoard(FIELD, "grossOverall");
    expect(gross.map((row) => row.name)).toEqual(["A2 / A2b", "B1 / B1b", "A1 / A1b"]);
    expect(gross.map((row) => row.score)).toEqual([36, 35, 34]);
  });

  it("marks a tie and gives both rows the same position, and never ranks further", () => {
    const tied = [
      team("P1 / P1b", ["Class A"], 40, 30),
      team("P2 / P2b", ["Class A"], 38, 28),
      team("P3 / P3b", ["Class A"], 38, 27),
      team("P4 / P4b", ["Class A"], 36, 26),
    ];
    const board = buildAwardingBoard(tied, "classA");
    expect(board.map((row) => row.position)).toEqual([1, 2, 2]);
    expect(board.map((row) => row.tie)).toEqual([false, true, true]);
    // The board stops at three rows: a tie does not expand it.
    expect(board).toHaveLength(3);
  });

  it("marks the third row when a fourth team ties with it, for the desk to settle", () => {
    const tied = [
      team("P1 / P1b", ["Class A"], 40, 30),
      team("P2 / P2b", ["Class A"], 38, 28),
      team("P3 / P3b", ["Class A"], 36, 27),
      team("P4 / P4b", ["Class A"], 36, 26),
    ];
    const board = buildAwardingBoard(tied, "classA");
    expect(board.map((row) => row.position)).toEqual([1, 2, 3]);
    // The cut row is marked, so the desk sees the tie it is confirming.
    expect(board.map((row) => row.tie)).toEqual([false, false, true]);
  });

  it("leaves out a pair with no published score rather than defaulting it", () => {
    const board = buildAwardingBoard(
      [team("No score", ["Class A"], null, null), team("Has score", ["Class A"], 30, 20)],
      "classA",
    );
    expect(board.map((row) => row.name)).toEqual(["Has score"]);
  });

  it("builds all six boards for the desk's one page", () => {
    const boards = buildAwardingBoards(FIELD);
    expect(Object.keys(boards)).toEqual([
      "classA",
      "classB",
      "classC",
      "classD",
      "netOverall",
      "grossOverall",
    ]);
    expect(boards.classC).toHaveLength(1);
    expect(boards.netOverall).toHaveLength(3);
  });
});

describe("a stored board", () => {
  it("prints only rows the desk confirmed, and drops anything unusable", () => {
    const board = parseAwardingBoard([
      { position: 1, name: "A1 / A1b", score: 42, tie: false },
      { position: 2, name: "A2 / A2b", score: 40, tie: true },
      { position: "x", name: "broken" },
      { position: 3, name: "" },
    ]);
    expect(board).toEqual([
      { position: 1, name: "A1 / A1b", score: 42, tie: false },
      { position: 2, name: "A2 / A2b", score: 40, tie: true },
    ]);
    // Not a list of rows is an empty board, never a guessed row.
    expect(parseAwardingBoard(null)).toEqual([]);
    expect(parseAwardingBoard("A1 / A1b")).toEqual([]);
    // A score that is not a number prints nothing rather than a zero.
    expect(parseAwardingBoard([{ position: 1, name: "A", score: "42" }])).toEqual([
      { position: 1, name: "A", score: null, tie: false },
    ]);
  });

  it("rides with the lane, so a released lane carries its confirmed board", () => {
    const lanes = parseLaneRevealMap({
      classA: {
        state: "released",
        board: [{ position: 1, name: "A1 / A1b", score: 42, tie: false }],
      },
      classB: { state: "held" },
    });
    expect(lanes.classA.state).toBe("released");
    expect(lanes.classA.board).toHaveLength(1);
    expect(lanes.classB.board).toEqual([]);
  });
});
