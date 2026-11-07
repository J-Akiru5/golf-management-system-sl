import { describe, expect, it } from "vitest";
import { planDrawJobs } from "./draw-persist";
import {
  type Action,
  type DeskState,
  drawSignatureForDay,
  initialState,
  publishedSignatureForDay,
  reducer,
  routingInputFor,
} from "./state";

const run = (state: DeskState, action: Action) => reducer(state, action);
const board = (state: DeskState) => state.boards[state.activeTournamentId ?? ""];

/** The demo field, split so half the players chose day 1 and half chose day 3. */
function splitDays(): DeskState {
  const state = initialState();
  return {
    ...state,
    entries: state.entries.map((entry, index) => ({
      ...entry,
      selectedDays: index % 2 === 0 ? [1] : [3],
    })),
  };
}

const idsChoosing = (state: DeskState, day: number) =>
  new Set(
    state.entries
      .filter((entry) => (entry.selectedDays ?? []).includes(day))
      .map((entry) => entry.playerId),
  );

describe("a playing day's routing input", () => {
  it("holds only the players who chose that day", () => {
    const state = splitDays();
    const dayOne = idsChoosing(state, 1);
    const dayThree = idsChoosing(state, 3);
    const input = routingInputFor(state, 1);
    expect(input).not.toBeNull();
    if (!input) return;

    expect(input.players.length).toBeGreaterThan(0);
    for (const player of input.players) expect(dayOne.has(player.id)).toBe(true);
    for (const player of input.provisional ?? []) expect(dayOne.has(player.id)).toBe(true);
    // Nobody who chose day 3 is drawn on day 1.
    for (const player of input.players) expect(dayThree.has(player.id)).toBe(false);
  });

  it("draws nobody on a day no one chose", () => {
    const input = routingInputFor(splitDays(), 2);
    expect(input?.players).toEqual([]);
    expect(input?.provisional ?? []).toEqual([]);
  });

  it("passes the day's session map and start times to the engine", () => {
    const state = splitDays();
    const input = routingInputFor(state, 3);
    expect(input?.sessions?.dayNumber).toBe(3);
    expect(input?.sessions?.starts.AM).toBeTruthy();
    expect(input?.sessions?.starts.PM).toMatch(/^\d{2}:\d{2}$/);
    // Every player in the day's field has an entry in the map, so none is mistaken for absent.
    const byPlayer = input?.sessions?.byPlayer;
    for (const player of input?.players ?? []) {
      expect(byPlayer instanceof Map && byPlayer.has(player.id)).toBe(true);
    }
  });

  it("keeps the whole field when no day is named", () => {
    const state = splitDays();
    expect(routingInputFor(state, null)?.players.length).toBeGreaterThanOrEqual(
      routingInputFor(state, 1)?.players.length ?? 0,
    );
  });
});

describe("the draw of one playing day", () => {
  it("puts only that day's players on the board", () => {
    const state = splitDays();
    const drawn = run(state, { type: "generate", preserveLocks: false, dayNumber: 1 });
    const ids = new Set(board(drawn)?.draw?.flatMap((group) => group.playerIds) ?? []);
    const dayOne = idsChoosing(state, 1);
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids) expect(dayOne.has(id)).toBe(true);
  });

  it("keeps another day's published list up when this day is redrawn", () => {
    let state = run(splitDays(), { type: "generate", preserveLocks: false, dayNumber: 1 });
    state = run(state, {
      type: "publish",
      dayNumber: 1,
      dayLabel: "Day 1",
      playDate: "2026-11-12",
    });
    expect(board(state)?.published?.groups.length).toBeGreaterThan(0);

    const after = run(state, { type: "generate", preserveLocks: false, dayNumber: 3 });
    expect(board(after)?.published).not.toBeNull();
    const jobs = planDrawJobs(
      { type: "generate", preserveLocks: false, dayNumber: 3 },
      state,
      after,
    );
    expect(jobs.map((job) => job.kind)).not.toContain("unpublish");
  });
});

describe("publishing every playing day", () => {
  it("holds both days after day 1 and day 3 are published", () => {
    let state = run(splitDays(), { type: "generate", preserveLocks: false, dayNumber: 1 });
    state = run(state, {
      type: "publish",
      dayNumber: 1,
      dayLabel: "Day 1",
      playDate: "2026-11-12",
    });
    state = run(state, { type: "generate", preserveLocks: false, dayNumber: 3 });
    state = run(state, {
      type: "publish",
      dayNumber: 3,
      dayLabel: "Day 3",
      playDate: "2026-11-14",
    });

    const published = board(state)?.published;
    expect(published).not.toBeNull();
    if (!published) return;
    const days = new Set(published.groups.map((group) => group.dayNumber));
    expect(days).toEqual(new Set([1, 3]));
    // Both days number their groups from 1; the day is what keeps them apart.
    expect(published.groups.filter((group) => group.number === 1).length).toBeGreaterThanOrEqual(2);
    expect(published.groups.every((group) => group.playDate && group.dayLabel)).toBe(true);
  });

  it("compares the board with that day's own published copy", () => {
    let state = run(splitDays(), { type: "generate", preserveLocks: false, dayNumber: 1 });
    state = run(state, {
      type: "publish",
      dayNumber: 1,
      dayLabel: "Day 1",
      playDate: "2026-11-12",
    });
    const published = board(state)?.published ?? null;
    const draw = board(state)?.draw ?? [];
    expect(publishedSignatureForDay(published, 1)).toBe(drawSignatureForDay(draw, 1));
    // Nothing is published for day 3 yet, so its published signature is empty.
    expect(publishedSignatureForDay(published, 3)).toBe("");
  });
});
