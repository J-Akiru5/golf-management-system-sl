import { describe, expect, it } from "vitest";
import { t } from "@/lib/i18n/t";
import { mapPortalState, mapScorecard, paymentLabel, startLabel, statusLabel } from "./portal";

/** The jsonb the database function returns for a linked player with one entry. */
const raw = {
  linked: true,
  player: { id: "p1", name: "Ana Reyes", ngapId: "10023" },
  entries: [
    {
      tournamentId: "t1",
      eventName: "Bamboo Tee",
      eventDate: "2026-11-12",
      dates: ["2026-11-12", "2026-11-13"],
      startFormat: "shotgun",
      firstTeeTime: "06:30",
      state: "open",
      status: "ok",
      reasons: [],
      frozenIndex: 11.4,
      playingHandicap: 12,
      category: "Ladies",
      tee: "Red",
      flight: "Ladies A",
      paymentStatus: "unpaid",
      published: true,
      start: { hole: 10, wave: "A", time: "06:30" },
    },
  ],
};

describe("mapPortalState", () => {
  it("maps a linked player and their entry", () => {
    const state = mapPortalState(raw);
    expect(state.linked).toBe(true);
    expect(state.player).toEqual({ id: "p1", name: "ANA REYES", ngapId: "10023" });
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({
      eventName: "Bamboo Tee",
      dates: ["2026-11-12", "2026-11-13"],
      status: "ok",
      frozenIndex: 11.4,
      playingHandicap: 12,
      flight: "Ladies A",
      published: true,
      start: { dayNumber: 1, hole: 10, wave: "A", time: "06:30" },
    });
  });

  it("maps one start per playing day and keeps the first as start", () => {
    const state = mapPortalState({
      linked: true,
      player: { id: "p1", name: "Ana" },
      entries: [
        {
          tournamentId: "t1",
          startFormat: "shotgun",
          published: true,
          starts: [
            { dayNumber: 1, hole: 1, wave: "A", time: "06:30", dayLabel: "Round 1" },
            { dayNumber: 2, hole: 10, wave: "B", time: "07:40", dayLabel: "Round 2" },
          ],
        },
      ],
    });

    const entry = state.entries[0];
    expect(entry?.starts).toEqual([
      { dayNumber: 1, hole: 1, wave: "A", time: "06:30" },
      { dayNumber: 2, hole: 10, wave: "B", time: "07:40" },
    ]);
    expect(entry?.start).toEqual(entry?.starts[0]);
  });

  it("treats a null payload as an unlinked account rather than throwing", () => {
    expect(mapPortalState(null)).toEqual({ linked: false, player: null, entries: [] });
    expect(mapPortalState({ linked: true })).toEqual({
      linked: false,
      player: null,
      entries: [],
    });
  });

  it("keeps unknown statuses and payments on the safe default", () => {
    const state = mapPortalState({
      linked: true,
      player: { id: "p1", name: "Ana" },
      entries: [{ tournamentId: "t1", status: "something_new", paymentStatus: "part_paid" }],
    });
    expect(state.entries[0]?.status).toBe("ok");
    expect(state.entries[0]?.paymentStatus).toBe("unpaid");
    expect(state.entries[0]?.frozenIndex).toBeNull();
    expect(state.entries[0]?.start).toBeNull();
  });

  it("reads numbers that arrive as strings, and drops junk from lists", () => {
    const state = mapPortalState({
      linked: true,
      player: { id: "p1", name: "Ana" },
      entries: [
        {
          tournamentId: "t1",
          frozenIndex: "9.8",
          playingHandicap: "10",
          reasons: ["Index above the maximum", 7, null],
          dates: ["2026-11-12", 5],
        },
      ],
    });
    expect(state.entries[0]?.frozenIndex).toBe(9.8);
    expect(state.entries[0]?.playingHandicap).toBe(10);
    expect(state.entries[0]?.reasons).toEqual(["Index above the maximum"]);
    expect(state.entries[0]?.dates).toEqual(["2026-11-12"]);
  });

  it("maps the player's published scorecard hole by hole", () => {
    const state = mapPortalState({
      linked: true,
      player: { id: "p1", name: "Ana" },
      entries: [
        {
          tournamentId: "t1",
          scorecards: [
            {
              roundId: "r1",
              dayNumber: 2,
              playDate: "2026-11-13",
              state: "final",
              version: 4,
              publishedAt: "2026-11-13T10:00:00.000Z",
              playingHandicap: 14,
              courseHandicap: 14,
              grossStrokes: 9,
              netStrokes: 7,
              grossPoints: 2,
              netPoints: 4,
              holesCounted: 2,
              holesTotal: 18,
              holes: [
                {
                  hole: 1,
                  par: 4,
                  strokeIndex: 5,
                  grossStrokes: 5,
                  handicapStrokes: 1,
                  netStrokes: 4,
                  grossPoints: 1,
                  netPoints: 2,
                },
                {
                  hole: 2,
                  par: 4,
                  strokeIndex: 3,
                  grossStrokes: 4,
                  handicapStrokes: 1,
                  netStrokes: 3,
                  grossPoints: 2,
                  netPoints: 3,
                },
              ],
            },
          ],
        },
      ],
    });

    const scorecard = state.entries[0]?.scorecards[0];
    expect(scorecard).toMatchObject({
      roundId: "r1",
      dayNumber: 2,
      state: "final",
      playingHandicap: 14,
      holesCounted: 2,
      holesTotal: 18,
    });
    expect(scorecard?.holes.map((hole) => hole.hole)).toEqual([1, 2]);
    expect(scorecard?.holes[0]).toMatchObject({
      grossStrokes: 5,
      handicapStrokes: 1,
      netStrokes: 4,
      grossPoints: 1,
      netPoints: 2,
    });
  });

  it("keeps a pick-up hole as X and totals only the holes that were played", () => {
    const state = mapPortalState({
      linked: true,
      player: { id: "p1", name: "Ana" },
      entries: [
        {
          tournamentId: "t1",
          scorecards: [
            {
              playerId: "p1",
              roundId: "r1",
              holesTotal: 3,
              holesCounted: 3,
              grossStrokes: null,
              netStrokes: null,
              grossPoints: 3,
              netPoints: 5,
              holes: [
                {
                  hole: 1,
                  par: 4,
                  strokeIndex: 1,
                  grossStrokes: 5,
                  handicapStrokes: 1,
                  netStrokes: 4,
                  grossPoints: 1,
                  netPoints: 2,
                },
                {
                  hole: 2,
                  par: 3,
                  strokeIndex: 2,
                  grossStrokes: null,
                  handicapStrokes: 1,
                  netStrokes: null,
                  grossPoints: 0,
                  netPoints: 0,
                  pickedUp: true,
                },
                {
                  hole: 3,
                  par: 4,
                  strokeIndex: 3,
                  grossStrokes: 4,
                  handicapStrokes: 1,
                  netStrokes: 3,
                  grossPoints: 2,
                  netPoints: 3,
                },
              ],
            },
          ],
        },
      ],
    });

    const card = state.entries[0]?.scorecards[0];
    expect(card).not.toBeNull();
    expect(card?.holes.map((hole) => hole.hole)).toEqual([1, 2, 3]);
    expect(card?.holes[1]).toMatchObject({
      hole: 2,
      par: 3,
      strokeIndex: 2,
      grossStrokes: 0,
      netStrokes: null,
      grossPoints: 0,
      netPoints: 0,
      pickedUp: true,
    });
    expect(card?.grossStrokes).toBe(9);
    expect(card?.netStrokes).toBeNull();
    expect(card?.grossPoints).toBe(3);
    expect(card?.netPoints).toBe(5);
    expect(card?.holesCounted).toBe(3);
  });

  it("keeps an all-pick-up card instead of dropping it", () => {
    const state = mapPortalState({
      linked: true,
      player: { id: "p1", name: "Ana" },
      entries: [
        {
          tournamentId: "t1",
          scorecards: [
            {
              roundId: "r2",
              holesTotal: 2,
              holesCounted: 2,
              grossStrokes: null,
              netStrokes: null,
              grossPoints: 0,
              netPoints: 0,
              holes: [1, 2].map((hole) => ({
                hole,
                par: 4,
                strokeIndex: hole,
                grossStrokes: null,
                handicapStrokes: 0,
                netStrokes: null,
                grossPoints: 0,
                netPoints: 0,
                pickedUp: true,
              })),
            },
          ],
        },
      ],
    });

    const card = state.entries[0]?.scorecards[0];
    expect(card).not.toBeNull();
    expect(card?.holes).toHaveLength(2);
    expect(card?.holes.every((hole) => hole.pickedUp)).toBe(true);
    expect(card?.grossStrokes).toBe(0);
    expect(card?.grossPoints).toBe(0);
  });

  it("does not invent a partial card total when the snapshot has none", () => {
    const state = mapPortalState({
      linked: true,
      player: { id: "p1", name: "Ana" },
      entries: [
        {
          tournamentId: "t1",
          scorecards: [
            {
              roundId: "r3",
              holesTotal: 18,
              holesCounted: 2,
              grossStrokes: null,
              netStrokes: null,
              grossPoints: null,
              netPoints: null,
              holes: [1, 2].map((hole) => ({
                hole,
                par: 4,
                strokeIndex: hole,
                grossStrokes: 4,
                handicapStrokes: 0,
                netStrokes: 4,
                grossPoints: 2,
                netPoints: 2,
              })),
            },
          ],
        },
      ],
    });

    const card = state.entries[0]?.scorecards[0];
    expect(card).not.toBeNull();
    expect(card?.holes).toHaveLength(2);
    expect(card?.grossStrokes).toBeNull();
    expect(card?.grossPoints).toBeNull();
    expect(card?.netPoints).toBeNull();
  });

  it("drops a malformed card and keeps the rest of the entry", () => {
    const state = mapPortalState({
      linked: true,
      player: { id: "p1", name: "Ana" },
      entries: [
        {
          tournamentId: "t1",
          scorecards: [
            {},
            { roundId: "r2", holes: [] },
            { roundId: "r3", holes: [{ hole: 1, par: 4, strokeIndex: 1, grossStrokes: 4 }] },
          ],
        },
      ],
    });

    expect(state.entries[0]?.scorecards).toEqual([]);
  });
});

describe("portal wording", () => {
  it("says plainly whether an entry is confirmed", () => {
    expect(statusLabel(t, "ok")).toBe("Entered");
    expect(statusLabel(t, "needs_review")).toMatch(/being checked/);
    expect(statusLabel(t, "ineligible")).toMatch(/cannot be placed/i);
  });

  it("never claims a payment the club did not record", () => {
    expect(paymentLabel(t, "unpaid")).toBe("Not recorded yet");
    expect(paymentLabel(t, "paid")).toBe("Recorded as paid");
    expect(paymentLabel(t, "waived")).toBe("Waived");
  });

  it("shows the frozen start, and says why when there is none", () => {
    const entry = mapPortalState(raw).entries[0];
    if (!entry) throw new Error("fixture missing");
    expect(startLabel(entry, t, (time) => time)).toBe("Hole 10A · 06:30");
    expect(startLabel({ ...entry, start: null, published: false }, t, (time) => time)).toMatch(
      /not out yet/,
    );
    expect(startLabel({ ...entry, start: null, published: true }, t, (time) => time)).toMatch(
      /ask the club/i,
    );
  });

  it("labels a two-tee start as a tee, not a hole", () => {
    const entry = mapPortalState(raw).entries[0];
    if (!entry) throw new Error("fixture missing");
    const twoTee = {
      ...entry,
      startFormat: "two_tee" as const,
      start: { dayNumber: 1, hole: 1, wave: null, time: "12:00" },
    };
    expect(startLabel(twoTee, t, (time) => time)).toBe("Tee 1 · 12:00");
  });
});

describe("mapScorecard pickups", () => {
  const hole = (n: number, over: Record<string, unknown> = {}) => ({
    hole: n,
    par: 4,
    strokeIndex: n,
    grossStrokes: 5,
    handicapStrokes: 1,
    netStrokes: 4,
    grossPoints: 1,
    netPoints: 2,
    ...over,
  });

  it("keeps a hole the player picked up on, marked, with no stroke count", () => {
    const card = mapScorecard({
      roundId: "r1",
      holesTotal: 3,
      holesCounted: 3,
      grossStrokes: null,
      netStrokes: null,
      grossPoints: 2,
      netPoints: 4,
      holes: [
        hole(1),
        hole(2, {
          pickedUp: true,
          grossStrokes: null,
          netStrokes: null,
          grossPoints: 0,
          netPoints: 0,
        }),
        hole(3),
      ],
    });
    expect(card?.holes).toHaveLength(3);
    expect(card?.holes[1]).toMatchObject({
      hole: 2,
      pickedUp: true,
      grossStrokes: 0,
      netPoints: 0,
    });
    expect(card?.pickups).toBe(1);
    expect(card?.grossStrokes).toBe(10);
  });

  it("still drops a hole with no strokes that was not a pickup", () => {
    const card = mapScorecard({
      roundId: "r1",
      holes: [hole(1), hole(2, { grossStrokes: null })],
    });
    expect(card?.holes).toHaveLength(1);
    expect(card?.pickups).toBeUndefined();
  });
});
