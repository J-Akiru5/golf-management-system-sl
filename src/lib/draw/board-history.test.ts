import { describe, expect, it } from "vitest";
import type { ManualOverride } from "@/lib/data/types";
import {
  BOARD_HISTORY_CAP,
  type BoardHistory,
  type BoardOwner,
  type BoardSnapshot,
  pushSnapshot,
  sameBoard,
  takeSnapshot,
  undoAvailable,
} from "./board-history";
import type { DrawGroup } from "./validate";

const group = (number: number, playerIds: string[]): DrawGroup => ({
  number,
  flightId: "f-a",
  playerIds,
  startHole: 1,
  wave: null,
  time: "06:30",
  locked: false,
});

const override = (id: string): ManualOverride => ({
  id,
  tournamentId: "t-1",
  playerId: "p-1",
  kind: "move",
  from: "1",
  to: "2",
  reason: "Organizer request",
  at: "2026-11-13T06:00:00.000Z",
});

const snapshot = (
  n: number,
  owner: BoardOwner = { tournamentId: "t-1", dayNumber: 1 },
): BoardSnapshot => ({
  ...owner,
  draw: [group(1, [`p-${n}`])],
  overrides: [override(`ov-${n}`)],
});

const owner: BoardOwner = { tournamentId: "t-1", dayNumber: 1 };

describe("the board undo stack", () => {
  it("starts empty and has nothing to take back", () => {
    const history: BoardHistory = [];
    expect(undoAvailable(history, owner)).toBe(false);
    expect(takeSnapshot(history, owner)).toEqual({ snapshot: null, history: [] });
  });

  it("keeps the newest snapshot last and takes it back first", () => {
    const history = pushSnapshot(pushSnapshot([], snapshot(1)), snapshot(2));
    expect(history.map((entry) => entry.overrides[0]?.id)).toEqual(["ov-1", "ov-2"]);

    const taken = takeSnapshot(history, owner);
    expect(taken.snapshot?.overrides[0]?.id).toBe("ov-2");
    expect(taken.history.map((entry) => entry.overrides[0]?.id)).toEqual(["ov-1"]);
    expect(undoAvailable(taken.history, owner)).toBe(true);
  });

  it("empties as each change is taken back, oldest last", () => {
    let history = pushSnapshot(pushSnapshot([], snapshot(1)), snapshot(2));
    const first = takeSnapshot(history, owner);
    history = first.history;
    const second = takeSnapshot(history, owner);
    expect(second.snapshot?.overrides[0]?.id).toBe("ov-1");
    expect(takeSnapshot(second.history, owner).snapshot).toBeNull();
  });

  it("keeps at most twenty snapshots, dropping the oldest", () => {
    let history: BoardHistory = [];
    for (let n = 1; n <= BOARD_HISTORY_CAP + 5; n += 1)
      history = pushSnapshot(history, snapshot(n));
    expect(history).toHaveLength(BOARD_HISTORY_CAP);
    expect(history[0]?.overrides[0]?.id).toBe("ov-6");
    expect(history[history.length - 1]?.overrides[0]?.id).toBe(`ov-${BOARD_HISTORY_CAP + 5}`);
    expect(BOARD_HISTORY_CAP).toBe(20);
  });

  it("does not take back another playing day's board", () => {
    const dayThree = pushSnapshot([], snapshot(7, { tournamentId: "t-1", dayNumber: 3 }));
    expect(undoAvailable(dayThree, owner)).toBe(false);
    expect(takeSnapshot(dayThree, owner)).toEqual({ snapshot: null, history: [...dayThree] });
    // The other day keeps its own snapshot, so going back to it still has its undo.
    expect(
      takeSnapshot(dayThree, { tournamentId: "t-1", dayNumber: 3 }).snapshot?.overrides[0]?.id,
    ).toBe("ov-7");
  });

  it("does not take back another event's board", () => {
    const other = pushSnapshot([], snapshot(9, { tournamentId: "t-2", dayNumber: 1 }));
    expect(undoAvailable(other, owner)).toBe(false);
  });

  it("reads a board with no playing day as its own board", () => {
    const noDay = pushSnapshot([], snapshot(4, { tournamentId: "t-1", dayNumber: null }));
    expect(undoAvailable(noDay, { tournamentId: "t-1", dayNumber: null })).toBe(true);
    expect(undoAvailable(noDay, owner)).toBe(false);
    expect(sameBoard({ tournamentId: "t-1", dayNumber: null }, owner)).toBe(false);
  });

  it("leaves the stack it was given alone", () => {
    const history: BoardHistory = [];
    pushSnapshot(history, snapshot(1));
    expect(history).toHaveLength(0);
    const taken = takeSnapshot([...history, snapshot(2)], owner);
    expect(taken.history).toHaveLength(0);
  });
});
