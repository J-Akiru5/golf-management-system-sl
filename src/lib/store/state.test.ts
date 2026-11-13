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

  it("carries the stored card class and card handicap into the draw", () => {
    const state = splitDays();
    const target = state.entries.find((entry) => (entry.selectedDays ?? []).includes(1));
    expect(target).toBeDefined();
    if (!target) return;
    const patched: DeskState = {
      ...state,
      entries: state.entries.map((entry) =>
        entry.id === target.id
          ? { ...entry, overridden: true, flightId: "r-c", playingHandicap: 18 }
          : entry,
      ),
    };

    const player = routingInputFor(patched, 1)?.players.find((row) => row.id === target.playerId);
    expect(player?.classId).toBe("r-c");
    expect(player?.cardHandicap).toBe(18);
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

describe("hand edits of who is in a group", () => {
  /** A drawn board, with the groups a test needs. The demo field fills a group of four. */
  function drawn() {
    const state = run(initialState(), { type: "generate", preserveLocks: false });
    const id = state.activeTournamentId;
    const draw = (id ? state.boards[id]?.draw : null) ?? [];
    const [first, second] = draw;
    if (!first || !second || !id) throw new Error("Expected two groups on the board");
    return { state, tournamentId: id, first, second };
  }

  const drawOf = (state: DeskState) => {
    const id = state.activeTournamentId;
    if (!id) throw new Error("Expected an active tournament");
    const draw = state.boards[id]?.draw;
    if (!draw) throw new Error("Expected a draw");
    return draw;
  };
  const groupOf = (state: DeskState, number: number) => {
    const g = drawOf(state).find((x) => x.number === number);
    if (!g) throw new Error(`Expected group ${number}`);
    return g;
  };

  it("swaps two players, locks both groups, and records one override per player", () => {
    const { state, first, second } = drawn();
    const a = first.playerIds[0];
    const b = second.playerIds[0];
    if (!a || !b) throw new Error("Expected a player in each group");

    const next = run(state, { type: "swapPlayers", a, b, reason: "Organizer request" });
    expect(groupOf(next, first.number).playerIds).toContain(b);
    expect(groupOf(next, second.number).playerIds).toContain(a);
    expect(groupOf(next, first.number).locked).toBe(true);
    expect(groupOf(next, second.number).locked).toBe(true);

    const board = next.boards[next.activeTournamentId ?? ""];
    const rows = board?.overrides ?? [];
    expect(rows.map((row) => row.playerId).sort()).toEqual([a, b].sort());
    for (const row of rows) {
      expect(row.kind).toBe("move");
      expect(row.reason).toBe("Organizer request");
    }
    expect(rows.find((row) => row.playerId === a)).toMatchObject({
      from: String(first.number),
      to: String(second.number),
    });
    expect(rows.find((row) => row.playerId === b)).toMatchObject({
      from: String(second.number),
      to: String(first.number),
    });
  });

  it("leaves the board alone when a swap cannot be made", () => {
    const { state, first } = drawn();
    const a = first.playerIds[0];
    if (!a) throw new Error("Expected a player");
    expect(run(state, { type: "swapPlayers", a, b: a, reason: "Organizer request" })).toBe(state);
    expect(run(state, { type: "swapPlayers", a, b: "nobody", reason: "Organizer request" })).toBe(
      state,
    );
  });

  it("moves a set within the event's group size and refuses one over it", () => {
    const { state, first, second } = drawn();
    // A group with one open place is the honest case: one player fits, two do not.
    const target = drawOf(state).find((g) => g.playerIds.length === 3);
    if (!target) throw new Error("Expected a group with one open place");
    const source = [first, second].find((g) => g.number !== target.number);
    if (!source) throw new Error("Expected another group");
    const [one, two] = source.playerIds;
    if (!one || !two) throw new Error("Expected two players to move");

    const single = run(state, {
      type: "moveSet",
      playerIds: [one],
      toGroup: target.number,
      reason: "Friends together",
    });
    expect(groupOf(single, target.number).playerIds).toContain(one);
    expect(groupOf(single, target.number).playerIds).toHaveLength(4);
    expect(groupOf(single, target.number).locked).toBe(true);

    // The group is full now, so the same set cannot go in, and the board does not change.
    expect(
      run(single, {
        type: "moveSet",
        playerIds: [two],
        toGroup: target.number,
        reason: "Late change on the day",
      }),
    ).toBe(single);
  });

  it("swaps two equal sets and refuses unequal ones", () => {
    const { state, first, second } = drawn();
    const setA = first.playerIds.slice(0, 2);
    const setB = second.playerIds.slice(0, 2);
    const next = run(state, { type: "swapSets", setA, setB, reason: "Balance the group" });
    for (const id of setA) expect(groupOf(next, second.number).playerIds).toContain(id);
    for (const id of setB) expect(groupOf(next, first.number).playerIds).toContain(id);
    expect(groupOf(next, first.number).playerIds).toHaveLength(first.playerIds.length);

    expect(
      run(state, {
        type: "swapSets",
        setA,
        setB: setB.slice(0, 1),
        reason: "Balance the group",
      }),
    ).toBe(state);
  });
});
