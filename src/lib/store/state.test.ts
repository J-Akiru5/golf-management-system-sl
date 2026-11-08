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

const BAMBOO = "bamboo-tee-2026";

/** The demo event's days with the given edits, so a test never depends on the demo's own times. */
function withDaysOfBamboo(
  base: DeskState,
  edit: (day: DeskState["days"][string][number]) => DeskState["days"][string][number],
): DeskState {
  const days = base.days[BAMBOO] ?? [];
  return { ...base, days: { ...base.days, [BAMBOO]: days.map(edit) } };
}

function withEventPmStart(base: DeskState, time: string | null): DeskState {
  return {
    ...base,
    tournaments: base.tournaments.map((tournament) =>
      tournament.id === BAMBOO
        ? { ...tournament, config: { ...tournament.config, pmFirstTeeTime: time } }
        : tournament,
    ),
  };
}

describe("the afternoon start of a playing day", () => {
  it("uses the day's own stored afternoon start", () => {
    const state = withDaysOfBamboo(initialState(), (day) =>
      day.dayNumber === 1 ? { ...day, startTime: "05:45", pmStartTime: "10:15" } : day,
    );
    // The event's afternoon start is different on purpose: the day's own time must win.
    const input = routingInputFor(withEventPmStart(state, "13:00"), 1);
    expect(input?.sessions?.starts).toEqual({ AM: "05:45", PM: "10:15" });
  });

  it("uses the event's afternoon start when the day has none", () => {
    const state = withDaysOfBamboo(initialState(), (day) =>
      day.dayNumber === 2 ? { ...day, startTime: "07:00", pmStartTime: null } : day,
    );
    const input = routingInputFor(withEventPmStart(state, "13:00"), 2);
    expect(input?.sessions?.starts).toEqual({ AM: "07:00", PM: "13:00" });
  });

  it("reads a sparse day list by the day's own values, not its position", () => {
    const base = withEventPmStart(initialState(), null);
    const sparse: DeskState["days"][string] = [
      {
        id: "d1",
        dayNumber: 1,
        playDate: "2026-11-12",
        label: "Day 1",
        startTime: null,
        isPlayingDay: true,
      },
      {
        id: "d2",
        dayNumber: 2,
        playDate: "2026-11-13",
        label: "Day 2",
        startTime: null,
        isPlayingDay: true,
      },
      {
        id: "d4",
        dayNumber: 4,
        playDate: "2026-11-15",
        label: "Day 4",
        startTime: "07:15",
        pmStartTime: "09:45",
        isPlayingDay: true,
      },
    ];
    const state: DeskState = { ...base, days: { ...base.days, [BAMBOO]: sparse } };

    // Day 4 is the last playing day, yet its own stored times are what the engine is given.
    expect(routingInputFor(state, 4)?.sessions?.starts).toEqual({ AM: "07:15", PM: "09:45" });
    // Day 2 stores nothing, so it keeps the ordinary afternoon default, not a neighbouring day's.
    expect(routingInputFor(state, 2)?.sessions?.starts).toEqual({ AM: "06:30", PM: "12:30" });
  });

  it("falls back to the last playing day's 11:30 only when nothing is stored", () => {
    const base = withEventPmStart(initialState(), null);
    const sparse: DeskState["days"][string] = [
      {
        id: "d1",
        dayNumber: 1,
        playDate: "2026-11-12",
        label: "Day 1",
        startTime: null,
        isPlayingDay: true,
      },
      {
        id: "d4",
        dayNumber: 4,
        playDate: "2026-11-15",
        label: "Day 4",
        startTime: null,
        isPlayingDay: true,
      },
    ];
    const state: DeskState = { ...base, days: { ...base.days, [BAMBOO]: sparse } };
    expect(routingInputFor(state, 4)?.sessions?.starts.PM).toBe("11:30");
    expect(routingInputFor(state, 1)?.sessions?.starts.PM).toBe("12:30");
  });

  it("moves only the named day's afternoon start", () => {
    const state = initialState();
    const before = state.days[BAMBOO] ?? [];
    const next = run(state, {
      type: "setDayPmStart",
      tournamentId: BAMBOO,
      dayNumber: 2,
      time: "13:15",
    });
    const after = next.days[BAMBOO] ?? [];
    expect(after.find((day) => day.dayNumber === 2)?.pmStartTime).toBe("13:15");
    for (const day of after) {
      if (day.dayNumber === 2) continue;
      expect(day).toEqual(before.find((old) => old.dayNumber === day.dayNumber));
    }
  });
});
