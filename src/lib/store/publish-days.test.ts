import { describe, expect, it } from "vitest";
import { toPublished } from "@/lib/data/supabase/load-desk-state";
import type { DrawGroup } from "@/lib/draw/validate";
import { buildPublished, type DeskState, initialState, type Published } from "@/lib/store/state";
import type { Json } from "@/lib/supabase/types";

// Publishing one day from a fresh session used to rebuild the snapshot without the day fields the
// loader had stripped, so every other published day disappeared from the public board and the
// version history. Day 3 and day 4 were lost from the live event this way on 12 Nov.
const BAMBOO = "bamboo-tee-2026";
const DAY_ONE = "2026-11-12";
const DAY_FOUR = "2026-11-15";

function demoDesk(): { state: DeskState; tournament: DeskState["tournaments"][number] } {
  const state = initialState();
  const tournament = state.tournaments.find((t) => t.id === BAMBOO);
  if (!tournament) throw new Error("the demo event is missing");
  return { state, tournament };
}

/** A demo player by position, so a test never hard-codes an id. */
function demoPlayer(state: DeskState, index: number) {
  const player = state.players[index];
  if (!player) throw new Error("a demo player is missing");
  return player;
}

function drawGroup(playerIds: string[]): DrawGroup {
  return {
    number: 1,
    flightId: "",
    startHole: 1,
    wave: "AM",
    time: "07:00",
    locked: false,
    playerIds,
  };
}

/** One group as the database stores it in `published_snapshot.groups`. */
function storedGroup(playerId: string, name: string, dayNumber: number, playDate: string) {
  return {
    number: 1,
    startHole: 1,
    wave: "AM",
    time: "07:00",
    flight: "A",
    players: [name],
    playerIds: [playerId],
    dayNumber,
    dayLabel: `Day ${dayNumber}`,
    playDate,
  };
}

function storedSnapshot(groups: Record<string, unknown>[]): Json {
  return {
    at: "2026-11-12T08:00:00.000Z",
    signature: "1:1:player-1|4:1:player-2",
    version: 3,
    groups,
  } as unknown as Json;
}

/** The snapshot the loader hands the desk after a page load. */
function loadedSnapshot(state: DeskState): Published {
  const first = demoPlayer(state, 0);
  const second = demoPlayer(state, 1);
  const loaded = toPublished(
    storedSnapshot([
      storedGroup(first.id, first.name, 1, DAY_ONE),
      storedGroup(second.id, second.name, 4, DAY_FOUR),
    ]),
    BAMBOO,
  );
  if (!loaded) throw new Error("the stored snapshot did not load");
  return loaded;
}

describe("a published snapshot with more than one day", () => {
  it("keeps both days when one of them is published again", () => {
    const { state, tournament } = demoDesk();
    const second = demoPlayer(state, 1);
    const loaded = loadedSnapshot(state);
    expect(loaded.groups.map((group) => group.dayNumber)).toEqual([1, 4]);

    const republished = buildPublished(
      [drawGroup([second.id])],
      state.players,
      tournament,
      "2026-11-15T09:00:00.000Z",
      new Set(),
      { dayNumber: 4, dayLabel: "Day 4", playDate: DAY_FOUR },
      loaded,
    );

    expect(republished.groups.map((group) => group.dayNumber).sort()).toEqual([1, 4]);
    expect(
      republished.groups.filter((group) => group.dayNumber === 1).map((group) => group.playerIds),
    ).toEqual([[demoPlayer(state, 0).id]]);
  });

  it("keeps the player ids through the round trip", () => {
    const { state } = demoDesk();
    const first = demoPlayer(state, 0);
    const second = demoPlayer(state, 1);

    const loaded = loadedSnapshot(state);
    expect(loaded.groups.map((group) => group.playerIds)).toEqual([[first.id], [second.id]]);
  });
});

describe("a day-less publish on a multi-day event", () => {
  it("does not erase the day another group on the snapshot belongs to", () => {
    const { state, tournament } = demoDesk();
    const first = demoPlayer(state, 0);
    const second = demoPlayer(state, 1);
    // The snapshot already carries a group that lost its day. A publish that names no day must not
    // take day 4 off the page with it.
    const previous: Published = {
      tournamentId: BAMBOO,
      at: "2026-11-12T08:00:00.000Z",
      signature: "1:1:player-1|4:1:player-2",
      groups: [
        {
          number: 1,
          startHole: 1,
          wave: "AM",
          time: "07:00",
          flight: "A",
          players: [first.name],
          playerIds: [first.id],
        },
        storedGroup(second.id, second.name, 4, DAY_FOUR),
      ],
    };

    const published = buildPublished(
      [drawGroup([first.id])],
      state.players,
      tournament,
      "2026-11-15T09:00:00.000Z",
      new Set(),
      null,
      previous,
    );

    expect(
      published.groups.filter((group) => group.dayNumber === 4).map((group) => group.playerIds),
    ).toEqual([[second.id]]);
  });
});
