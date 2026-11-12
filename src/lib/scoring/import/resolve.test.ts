import { describe, expect, it } from "vitest";
import {
  importCaptureKey,
  importCardEntries,
  normalizeImportName,
  resolveScorecardImport,
} from "./resolve";
import type { ScorecardImportCard, ScorecardImportFile } from "./types";

const ROUND_ID = "8f14e45f-ea4b-4c3a-9f0e-2b6d1c7a5e10";
const TOURNAMENT_ID = "2c9a7b60-3f4d-4e8a-9b1c-6d5e4f3a2b10";
const PLAYER_ID = "0b7f6e5d-4c3b-4a29-8176-5f4e3d2c1b0a";
const MARKER_ID = "1c8e7f6a-5b4d-4c3e-9f2a-6b7c8d9e0f1a";

function holes(strokes = 5): Record<string, number> {
  return Object.fromEntries(Array.from({ length: 18 }, (_, index) => [String(index + 1), strokes]));
}

function card(overrides: Partial<ScorecardImportCard> = {}): ScorecardImportCard {
  return {
    cardKey: "d1-g1-adorio-sulpico",
    groupNumber: 1,
    playerId: PLAYER_ID,
    playerName: "ADORIO, RONNEL",
    markerPlayerId: MARKER_ID,
    markerName: "SULPICO, RANDY",
    writtenTotal: 90,
    holes: holes(),
    notes: null,
    ...overrides,
  };
}

function file(overrides: Partial<ScorecardImportFile> = {}): ScorecardImportFile {
  return {
    format: "teeline-scorecard-import",
    version: 1,
    roundId: ROUND_ID,
    tournamentId: TOURNAMENT_ID,
    dayNumber: 1,
    extractedBy: "Karl",
    extractedAt: "2026-11-12T18:40:00+08:00",
    cards: [card()],
    skipped: [],
    ...overrides,
  };
}

const players = [
  { playerId: PLAYER_ID, playerName: "ADORIO, RONNEL" },
  { playerId: MARKER_ID, playerName: "SULPICO, RANDY" },
];
const groups = [{ number: 1, playerIds: [PLAYER_ID, MARKER_ID] }];

function resolve(
  overrides: Partial<ScorecardImportFile> = {},
  input: { cards?: Parameters<typeof resolveScorecardImport>[0]["cards"] } = {},
) {
  return resolveScorecardImport({
    file: file(overrides),
    roundId: ROUND_ID,
    tournamentId: TOURNAMENT_ID,
    dayNumber: 1,
    players,
    groups,
    cards: input.cards ?? [],
  });
}

describe("resolveScorecardImport", () => {
  it("resolves a card by id and group", () => {
    const plan = resolve();
    expect(plan.problems).toEqual([]);
    expect(plan.ready).toHaveLength(1);
    expect(plan.ready[0]?.playerName).toBe("ADORIO, RONNEL");
    expect(plan.ready[0]?.groupNumber).toBe(1);
  });

  it("matches a name without the comma", () => {
    const plan = resolve({
      cards: [card({ playerId: null, playerName: "ADORIO RONNEL" })],
    });
    expect(plan.ready).toHaveLength(1);
    expect(plan.ready[0]?.playerId).toBe(PLAYER_ID);
  });

  it("blocks a player in another group", () => {
    const plan = resolve({ cards: [card({ groupNumber: 2 })] });
    expect(plan.ready).toEqual([]);
    expect(plan.blocked[0]?.reasons[0]?.message).toContain("group 1, not group 2");
  });

  it("blocks a player who is not in the published draw", () => {
    const plan = resolveScorecardImport({
      file: file(),
      roundId: ROUND_ID,
      tournamentId: TOURNAMENT_ID,
      dayNumber: 1,
      players,
      groups: [{ number: 9, playerIds: [MARKER_ID] }],
      cards: [],
    });
    expect(plan.ready).toEqual([]);
    expect(plan.blocked[0]?.reasons[0]?.message).toContain("not in the published draw");
  });

  it("blocks a self-marked card", () => {
    const plan = resolve({
      cards: [card({ markerPlayerId: PLAYER_ID, markerName: "ADORIO, RONNEL" })],
    });
    expect(plan.ready).toEqual([]);
    expect(plan.blocked[0]?.reasons[0]?.message).toContain("cannot mark their own card");
  });

  it("blocks an unknown marker", () => {
    const plan = resolve({
      cards: [card({ markerPlayerId: null, markerName: "NOBODY, HERE" })],
    });
    expect(plan.ready).toEqual([]);
    expect(plan.blocked[0]?.reasons[0]?.message).toContain("No player in the open round matches");
  });

  it("blocks a different file round", () => {
    const plan = resolve({ roundId: "11111111-1111-4111-8111-111111111111" });
    expect(plan.ready).toEqual([]);
    expect(plan.problems[0]?.path).toBe("roundId");
  });

  it("blocks a file for another day", () => {
    const plan = resolve({ dayNumber: 2 });
    expect(plan.ready).toEqual([]);
    expect(plan.problems[0]?.path).toBe("dayNumber");
  });

  it("lets the id decide when the name is not in the roster", () => {
    const plan = resolve({ cards: [card({ playerName: "PAPER SPELLING" })] });
    expect(plan.ready).toHaveLength(1);
    expect(plan.ready[0]?.playerName).toBe("ADORIO, RONNEL");
  });

  it("blocks a rejected card instead of returning the old one", () => {
    const plan = resolve(
      {},
      {
        cards: [
          {
            playerId: PLAYER_ID,
            scorerId: MARKER_ID,
            status: "rejected",
            entries: Object.entries(holes()).map(([hole, strokes]) => ({
              hole: Number(hole),
              strokes,
            })),
            writtenTotal: 90,
          },
        ],
      },
    );
    expect(plan.ready).toEqual([]);
    expect(plan.blocked[0]?.reasons[0]?.message).toContain("rejected or revoked");
  });

  it("blocks an identical card with a different written total", () => {
    const plan = resolve(
      {},
      {
        cards: [
          {
            playerId: PLAYER_ID,
            scorerId: MARKER_ID,
            status: "submitted",
            entries: Object.entries(holes()).map(([hole, strokes]) => ({
              hole: Number(hole),
              strokes,
            })),
            writtenTotal: 89,
          },
        ],
      },
    );
    expect(plan.ready).toEqual([]);
    expect(plan.alreadyIn).toEqual([]);
    expect(plan.blocked[0]?.reasons[0]?.message).toContain("written total");
  });

  it("skips an identical card that is already in", () => {
    const plan = resolve(
      {},
      {
        cards: [
          {
            playerId: PLAYER_ID,
            scorerId: MARKER_ID,
            status: "submitted",
            entries: Object.entries(holes()).map(([hole, strokes]) => ({
              hole: Number(hole),
              strokes,
            })),
            writtenTotal: 90,
          },
        ],
      },
    );
    expect(plan.ready).toEqual([]);
    expect(plan.alreadyIn).toHaveLength(1);
  });

  it("blocks the same player and marker twice in one file", () => {
    const plan = resolve({
      cards: [card(), card({ cardKey: "d1-g1-adorio-sulpico-second" })],
    });
    expect(plan.ready).toHaveLength(1);
    expect(plan.blocked).toHaveLength(1);
    expect(plan.blocked[0]?.reasons[0]?.message).toContain("appear more than once");
  });

  it("blocks a different card from the same marker", () => {
    const plan = resolve(
      {},
      {
        cards: [
          {
            playerId: PLAYER_ID,
            scorerId: MARKER_ID,
            status: "submitted",
            entries: Object.entries(holes(6)).map(([hole, strokes]) => ({
              hole: Number(hole),
              strokes,
            })),
            writtenTotal: 108,
          },
        ],
      },
    );
    expect(plan.ready).toEqual([]);
    expect(plan.blocked[0]?.reasons[0]?.message).toContain("already in for this player");
  });

  it("allows a second card from another marker", () => {
    const plan = resolve(
      {},
      {
        cards: [
          {
            playerId: PLAYER_ID,
            scorerId: PLAYER_ID,
            status: "submitted",
            entries: Object.entries(holes(6)).map(([hole, strokes]) => ({
              hole: Number(hole),
              strokes,
            })),
            writtenTotal: 108,
          },
        ],
      },
    );
    expect(plan.ready).toHaveLength(1);
  });

  it("builds sorted, confirmed card entries", () => {
    const plan = resolve();
    const ready = plan.ready[0];
    if (!ready) throw new Error("expected a ready card");
    const entries = importCardEntries(ready);
    expect(entries.map((entry) => entry.hole)).toEqual(
      Array.from({ length: 18 }, (_, index) => index + 1),
    );
    expect(entries.every((entry) => entry.manuallyConfirmed)).toBe(true);
    expect(entries.every((entry) => entry.confidence === null)).toBe(true);
  });

  it("uses a stable capture key scoped to the round", () => {
    expect(importCaptureKey("round-1", "d1-g1-adorio-sulpico")).toBe(
      "import:round-1:d1-g1-adorio-sulpico",
    );
  });

  it("normalises names for matching", () => {
    expect(normalizeImportName("  adorio,   ronnel ")).toBe("ADORIO RONNEL");
    expect(normalizeImportName("ADORIO RONNEL")).toBe("ADORIO RONNEL");
  });
});
