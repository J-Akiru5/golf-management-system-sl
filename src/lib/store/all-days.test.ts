import { describe, expect, it } from "vitest";
import { boardOf, initialState, playingDaysOfEvent, reducer } from "./state";

const state = initialState();
const tournamentId = state.activeTournamentId ?? "";
const dayNumbers = playingDaysOfEvent(state.days[tournamentId] ?? []).map((d) => d.dayNumber);

describe("drawing every playing day at once (demo)", () => {
  const drawn = reducer(state, { type: "generateAllDays", showDay: dayNumbers[1] ?? null });

  it("keeps a board for every playing day and shows the one asked for", () => {
    const board = boardOf(drawn);
    expect(Object.keys(board.dayBoards ?? {}).map(Number)).toEqual(dayNumbers);
    expect(dayNumbers.length).toBeGreaterThan(1);
    expect(board.draw).toBe(board.dayBoards?.[dayNumbers[1] ?? 0]?.draw);
  });

  it("shows the first day when no day is asked for", () => {
    const board = boardOf(reducer(state, { type: "generateAllDays", showDay: null }));
    expect(board.draw).toBe(board.dayBoards?.[dayNumbers[0] ?? 0]?.draw);
  });

  it("keeps the edits made to a day when the organizer leaves it and comes back", () => {
    const first = dayNumbers[0] ?? 1;
    const second = dayNumbers[1] ?? 2;
    const onFirst = reducer(state, { type: "generateAllDays", showDay: first });
    const group = boardOf(onFirst).draw?.[0];
    expect(group).toBeDefined();
    const locked = reducer(onFirst, {
      type: "setGroupLocked",
      group: group?.number ?? 1,
      locked: true,
      reason: "Sponsor group",
    });
    const away = reducer(locked, { type: "showDay", from: first, to: second });
    expect(boardOf(away).draw).toBe(boardOf(away).dayBoards?.[second]?.draw);
    const back = reducer(away, { type: "showDay", from: second, to: first });
    expect(boardOf(back).draw?.find((g) => g.number === group?.number)?.locked).toBe(true);
  });

  it("does nothing when asked to show a day that was never drawn, or before any draw", () => {
    expect(reducer(state, { type: "showDay", from: null, to: 1 })).toBe(state);
    expect(reducer(drawn, { type: "showDay", from: null, to: 999 })).toBe(drawn);
  });

  it("leaves the other days alone when one day is re-run with its locks", () => {
    const first = dayNumbers[0] ?? 1;
    const onFirst = reducer(state, { type: "generateAllDays", showDay: first });
    const before = boardOf(onFirst).dayBoards?.[dayNumbers[1] ?? 2];
    const rerun = reducer(onFirst, { type: "generate", preserveLocks: true, dayNumber: first });
    expect(boardOf(rerun).dayBoards?.[dayNumbers[1] ?? 2]).toBe(before);
  });
});
