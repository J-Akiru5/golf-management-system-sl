import { beforeEach, describe, expect, it, vi } from "vitest";
import { moveGroupToHole, reorderHoleQueue, swapGroupSlots } from "@/lib/draw/group-slots";
import type { DrawGroup } from "@/lib/draw/validate";
import { actionNotice } from "./action-notice";
import { type Action, type DeskState, initialState, reducer } from "./state";

// The slot helpers are still stubs on this branch. Each test controls what they return, so the
// reducer and the notices are tested on their own.
vi.mock("@/lib/draw/group-slots", () => ({
  swapGroupSlots: vi.fn(),
  moveGroupToHole: vi.fn(),
  reorderHoleQueue: vi.fn(),
}));

const swap = vi.mocked(swapGroupSlots);
const move = vi.mocked(moveGroupToHole);
const reorder = vi.mocked(reorderHoleQueue);

const run = (state: DeskState, action: Action) => reducer(state, action);
const notice = (state: DeskState, action: Action) =>
  actionNotice(action, state, run(state, action));

const generated = () => run(initialState(), { type: "generate", preserveLocks: false });

/** Three groups: 1 and 2 queue on hole 1, group 3 starts on hole 2. */
function controlledDraw(): DrawGroup[] {
  return [
    {
      number: 1,
      flightId: "f1",
      playerIds: ["p1"],
      startHole: 1,
      wave: null,
      time: "06:30",
      locked: false,
    },
    {
      number: 2,
      flightId: "f1",
      playerIds: ["p2"],
      startHole: 1,
      wave: null,
      time: "06:40",
      locked: false,
    },
    {
      number: 3,
      flightId: "f1",
      playerIds: ["p3"],
      startHole: 2,
      wave: null,
      time: "06:30",
      locked: false,
    },
  ];
}

function withDraw(state: DeskState, draw: DrawGroup[]): DeskState {
  const id = state.activeTournamentId;
  if (!id) throw new Error("Expected an active tournament");
  const board = state.boards[id];
  if (!board) throw new Error("Expected a board");
  return { ...state, boards: { ...state.boards, [id]: { ...board, draw, overrides: [] } } };
}

function boardOf(state: DeskState) {
  const id = state.activeTournamentId;
  if (!id) throw new Error("Expected an active tournament");
  const board = state.boards[id];
  if (!board) throw new Error("Expected a board");
  return board;
}

function drawOf(state: DeskState): DrawGroup[] {
  const draw = boardOf(state).draw;
  if (!draw) throw new Error("Expected a draw");
  return draw;
}

const stateWithDraw = () => withDraw(generated(), controlledDraw());

beforeEach(() => {
  vi.resetAllMocks();
});

describe("swapGroupSlots", () => {
  const action: Action = { type: "swapGroupSlots", a: 1, b: 2, reason: "Organizer request" };

  it("replaces the draw and records one move override", () => {
    const state = stateWithDraw();
    const draw = drawOf(state);
    const a = draw[0];
    const b = draw[1];
    if (!a || !b) throw new Error("Expected two groups");
    const next = draw.map((g) => {
      if (g.number === a.number) return { ...g, time: b.time, startHole: b.startHole };
      if (g.number === b.number) return { ...g, time: a.time, startHole: a.startHole };
      return g;
    });
    swap.mockReturnValueOnce({ ok: true, draw: next, note: "slots swapped" });

    const after = run(state, action);

    expect(swap).toHaveBeenCalledWith(draw, a.number, b.number);
    expect(boardOf(after).draw).toBe(next);
    expect(boardOf(after).overrides).toHaveLength(1);
    expect(boardOf(after).overrides[0]).toMatchObject({
      id: `ov-${state.seq + 1}`,
      tournamentId: state.activeTournamentId,
      playerId: "",
      kind: "move",
      reason: "Organizer request",
      from: `G${a.number} ${a.time} hole ${a.startHole}`,
      to: `G${a.number} ${b.time} hole ${b.startHole}`,
    });
    expect(boardOf(after).overrides[0]?.at).toEqual(expect.any(String));
  });

  it("leaves the state alone when the edit is refused", () => {
    const state = stateWithDraw();
    swap.mockReturnValueOnce({ ok: false, reason: "No such group" });
    expect(run(state, action)).toBe(state);
  });

  it("reports a refused and an accepted change", () => {
    const state = stateWithDraw();
    const draw = drawOf(state);
    const [a, b] = draw;
    if (!a || !b) throw new Error("Expected two groups");

    swap.mockReturnValueOnce({ ok: false, reason: "No such group" });
    expect(notice(state, action)).toEqual({
      tone: "bad",
      title: "Change refused",
      detail: "That change could not be made.",
    });

    swap.mockReturnValueOnce({ ok: true, draw, note: "slots swapped" });
    expect(notice(state, action)).toEqual({
      tone: "ok",
      title: "Groups swapped",
      detail: "Organizer request",
    });
  });
});

describe("moveGroupToHole", () => {
  const action: Action = {
    type: "moveGroupToHole",
    groupNumber: 3,
    hole: 4,
    reason: "Organizer request",
  };

  it("replaces the draw and records one move override", () => {
    const state = stateWithDraw();
    const draw = drawOf(state);
    const group = draw.find((g) => g.number === 3);
    if (!group) throw new Error("Expected group 3");
    const next = draw.map((g) => (g.number === 3 ? { ...g, startHole: 4 } : g));
    move.mockReturnValueOnce({ ok: true, draw: next, note: "group moved" });

    const after = run(state, action);

    expect(move).toHaveBeenCalledWith(draw, 3, 4, expect.any(Number));
    expect(boardOf(after).draw).toBe(next);
    expect(boardOf(after).overrides).toHaveLength(1);
    expect(boardOf(after).overrides[0]).toMatchObject({
      id: `ov-${state.seq + 1}`,
      tournamentId: state.activeTournamentId,
      playerId: "",
      kind: "move",
      reason: "Organizer request",
      from: `G3 ${group.time} hole ${group.startHole}`,
      to: `G3 ${group.time} hole 4`,
    });
  });

  it("leaves the state alone when the edit is refused", () => {
    const state = stateWithDraw();
    move.mockReturnValueOnce({ ok: false, reason: "No such hole" });
    expect(run(state, action)).toBe(state);
  });

  it("reports a refused and an accepted change", () => {
    const state = stateWithDraw();
    const draw = drawOf(state);

    move.mockReturnValueOnce({ ok: false, reason: "No such hole" });
    expect(notice(state, action)).toEqual({
      tone: "bad",
      title: "Change refused",
      detail: "That change could not be made.",
    });

    move.mockReturnValueOnce({ ok: true, draw, note: "group moved" });
    expect(notice(state, action)).toEqual({
      tone: "ok",
      title: "Group moved",
      detail: "Organizer request",
    });
  });
});

describe("reorderHoleQueue", () => {
  const action: Action = {
    type: "reorderHoleQueue",
    hole: 1,
    order: [2, 1],
    reason: "Organizer request",
  };

  it("replaces the draw and records one move override", () => {
    const state = stateWithDraw();
    const draw = drawOf(state);
    const one = draw.find((g) => g.number === 1);
    const two = draw.find((g) => g.number === 2);
    if (!one || !two) throw new Error("Expected groups 1 and 2");
    const next = draw.map((g) => {
      if (g.number === 1) return { ...g, time: two.time };
      if (g.number === 2) return { ...g, time: one.time };
      return g;
    });
    reorder.mockReturnValueOnce({ ok: true, draw: next, note: "queue reordered" });

    const after = run(state, action);

    expect(reorder).toHaveBeenCalledWith(draw, 1, [2, 1]);
    expect(boardOf(after).draw).toBe(next);
    expect(boardOf(after).overrides).toHaveLength(1);
    expect(boardOf(after).overrides[0]).toMatchObject({
      id: `ov-${state.seq + 1}`,
      tournamentId: state.activeTournamentId,
      playerId: "",
      kind: "move",
      reason: "Organizer request",
      from: "Hole 1: G1, G2",
      to: "Hole 1: G2, G1",
    });
  });

  it("leaves the state alone when the edit is refused", () => {
    const state = stateWithDraw();
    reorder.mockReturnValueOnce({ ok: false, reason: "The queue does not match the hole" });
    expect(run(state, action)).toBe(state);
  });

  it("reports a refused and an accepted change", () => {
    const state = stateWithDraw();
    const draw = drawOf(state);

    reorder.mockReturnValueOnce({ ok: false, reason: "The queue does not match the hole" });
    expect(notice(state, action)).toEqual({
      tone: "bad",
      title: "Change refused",
      detail: "That change could not be made.",
    });

    reorder.mockReturnValueOnce({ ok: true, draw, note: "queue reordered" });
    expect(notice(state, action)).toEqual({
      tone: "ok",
      title: "Queue reordered",
      detail: "Organizer request",
    });
  });
});

describe("slot edits without a draw", () => {
  it("leaves the state alone for every slot action", () => {
    const state: DeskState = { ...initialState(), boards: {} };
    const actions: Action[] = [
      { type: "swapGroupSlots", a: 1, b: 2, reason: "Organizer request" },
      { type: "moveGroupToHole", groupNumber: 1, hole: 2, reason: "Organizer request" },
      { type: "reorderHoleQueue", hole: 1, order: [2, 1], reason: "Organizer request" },
    ];
    for (const action of actions) expect(run(state, action)).toBe(state);
  });
});
