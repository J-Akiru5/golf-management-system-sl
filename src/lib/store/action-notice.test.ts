import { describe, expect, it } from "vitest";
import { actionNotice, movedPlayers } from "./action-notice";
import { type Action, type DeskState, initialState, reducer } from "./state";

const run = (state: DeskState, action: Action) => reducer(state, action);
const notice = (state: DeskState, action: Action) =>
  actionNotice(action, state, run(state, action));
const generated = () => run(initialState(), { type: "generate", preserveLocks: false });

function board(state: DeskState) {
  const id = state.activeTournamentId;
  if (!id) throw new Error("Expected an active tournament");
  const b = state.boards[id];
  if (!b) throw new Error("Expected a board");
  return { id, board: b };
}

function drawOf(state: DeskState) {
  const draw = board(state).board.draw;
  if (!draw) throw new Error("Expected a draw");
  return draw;
}

/** The same state with one player hand-moved from one group to another. */
function withPlayerMoved(state: DeskState, from: number, to: number, playerId: string): DeskState {
  const { id, board: b } = board(state);
  const draw = drawOf(state).map((g) => {
    if (g.number === from) return { ...g, playerIds: g.playerIds.filter((p) => p !== playerId) };
    if (g.number === to) return { ...g, playerIds: [...g.playerIds, playerId] };
    return g;
  });
  return { ...state, boards: { ...state.boards, [id]: { ...b, draw } } };
}

describe("actionNotice", () => {
  it("says a draw was made, and how big it is", () => {
    const n = notice(initialState(), { type: "generate", preserveLocks: false });
    expect(n?.tone).toBe("ok");
    expect(n?.title).toBe("Draw made");
    expect(n?.detail).toContain("ready player");
  });

  it("says plainly that a re-run moved nobody, instead of looking broken", () => {
    const n = notice(generated(), { type: "generate", preserveLocks: true });
    expect(n?.tone).toBe("info");
    expect(n?.title).toBe("Re-ran the proposal: nothing moved");
    expect(n?.detail).toContain("same");
  });

  it("counts the players a re-run moved", () => {
    const start = generated();
    const draw = drawOf(start);
    const from = draw[0];
    const to = draw[1];
    if (!from || !to) throw new Error("Expected two groups");
    const playerId = from.playerIds[0];
    if (!playerId) throw new Error("Expected a player on the first group");
    const shuffled = withPlayerMoved(start, from.number, to.number, playerId);
    const n = actionNotice(
      { type: "generate", preserveLocks: true },
      shuffled,
      run(shuffled, { type: "generate", preserveLocks: true }),
    );
    expect(n?.title).toBe("Re-ran the proposal");
    expect(n?.detail).toContain("1 player changed group");
  });

  it("names the player and where they landed on a move", () => {
    const start = generated();
    const draw = drawOf(start);
    const from = draw[0];
    const to = draw[1];
    if (!from || !to) throw new Error("Expected two groups");
    const playerId = from.playerIds[0];
    if (!playerId) throw new Error("Expected a player on the first group");
    const name = start.players.find((p) => p.id === playerId)?.name ?? "";
    const after = withPlayerMoved(start, from.number, to.number, playerId);
    const n = actionNotice(
      { type: "move", playerId, toGroup: to.number, reason: "Organizer request" },
      start,
      after,
    );
    expect(n?.title).toBe(`${name} moved`);
    expect(n?.detail).toContain(`Group ${to.number}`);
  });

  it("says a move was refused when the board did not change", () => {
    const start = generated();
    const n = notice(start, {
      type: "move",
      playerId: "nobody",
      toGroup: 1,
      reason: "Organizer request",
    });
    expect(n?.tone).toBe("bad");
    expect(n?.title).toBe("Move refused");
  });

  it("names a swap and a set move, and says when either is refused", () => {
    const start = generated();
    const draw = drawOf(start);
    const first = draw[0];
    const second = draw[1];
    if (!first || !second) throw new Error("Expected two groups");
    const a = first.playerIds[0];
    const b = second.playerIds[0];
    if (!a || !b) throw new Error("Expected a player in each group");

    const swapped = notice(start, {
      type: "swapPlayers",
      a,
      b,
      reason: "Organizer request",
    });
    expect(swapped?.title).toBe("Players swapped");
    expect(swapped?.detail).toContain("2 players changed group");

    const setsSwapped = notice(start, {
      type: "swapSets",
      setA: first.playerIds.slice(0, 2),
      setB: second.playerIds.slice(0, 2),
      reason: "Organizer request",
    });
    expect(setsSwapped?.title).toBe("Sets swapped");

    expect(
      notice(start, {
        type: "swapPlayers",
        a,
        b: "nobody",
        reason: "Organizer request",
      })?.title,
    ).toBe("Swap refused");

    const moved = notice(start, {
      type: "moveSet",
      playerIds: [a, b],
      toGroup: 99,
      reason: "Organizer request",
    });
    expect(moved?.title).toBe("Move refused");
  });

  it("reports a lock and an unlock", () => {
    const start = generated();
    const group = drawOf(start)[0];
    if (!group) throw new Error("Expected a group");
    const locked = notice(start, {
      type: "setGroupLocked",
      group: group.number,
      locked: true,
      reason: "Sponsor group",
    });
    expect(locked?.title).toBe(`Group ${group.number} locked`);
    const after = run(start, {
      type: "setGroupLocked",
      group: group.number,
      locked: true,
      reason: "Sponsor group",
    });
    const unlocked = notice(after, {
      type: "setGroupLocked",
      group: group.number,
      locked: false,
      reason: "Sponsor group",
    });
    expect(unlocked?.title).toBe(`Group ${group.number} unlocked`);
  });

  it("stays quiet for actions that do not belong to the draw", () => {
    const start = generated();
    expect(notice(start, { type: "publish" })).toBeNull();
    expect(actionNotice({ type: "selectTournament", id: null }, start, start)).toBeNull();
  });
});

describe("movedPlayers", () => {
  it("counts a player who changed group and ignores the ones who stayed", () => {
    const a = [
      {
        number: 1,
        flightId: "f",
        startHole: 1,
        wave: "A",
        time: "06:30",
        locked: false,
        playerIds: ["p1", "p2"],
      },
      {
        number: 2,
        flightId: "f",
        startHole: 2,
        wave: "A",
        time: "06:30",
        locked: false,
        playerIds: ["p3"],
      },
    ];
    const b = [
      { ...a[0]!, playerIds: ["p2"] },
      { ...a[1]!, playerIds: ["p3", "p1"] },
    ];
    expect(movedPlayers(a, b)).toBe(1);
  });
});
