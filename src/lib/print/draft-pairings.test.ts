import { describe, expect, it } from "vitest";
import { type DraftPairingGroup, draftPairings } from "./draft-pairings";

const group = (
  number: number,
  players: { id: string; name: string }[],
  overrides: Partial<DraftPairingGroup> = {},
): DraftPairingGroup => ({
  number,
  startHole: number,
  time: "06:30",
  flight: "Class A",
  players,
  ...overrides,
});

const base = {
  tournamentName: "24th Bamboo Tee",
  dateLabel: "Thursday, 12 Nov 2026",
  startFormat: "shotgun" as const,
  firstTeeTime: "06:30",
};

describe("draftPairings", () => {
  it("builds a day-aware sheet from the current board", () => {
    const result = draftPairings({
      ...base,
      days: [
        {
          dayNumber: 2,
          dayLabel: "Day 2",
          playDate: "2026-11-13",
          groups: [
            group(1, [
              { id: "p1", name: "ALBA, MARIAN" },
              { id: "p2", name: "ARCENAS, FEDERICO" },
            ]),
          ],
        },
      ],
    });

    expect(result).not.toBeNull();
    expect(result?.days).toHaveLength(1);
    expect(result?.days?.[0]).toMatchObject({
      dayNumber: 2,
      label: "Day 2",
      playDate: "2026-11-13",
    });
    expect(result?.groups).toHaveLength(1);
    expect(result?.groups[0]?.players.map((player) => player.id)).toEqual(["p1", "p2"]);
    expect(result?.groups[0]?.players.map((player) => player.name)).toEqual([
      "ALBA, MARIAN",
      "ARCENAS, FEDERICO",
    ]);
    expect(result?.groups[0]?.players[0]?.photoPath).toBeNull();
  });

  it("does not merge two days that both have group 1", () => {
    const result = draftPairings({
      ...base,
      days: [
        {
          dayNumber: 1,
          dayLabel: "Day 1",
          playDate: "2026-11-12",
          groups: [group(1, [{ id: "p1", name: "ONE, PLAYER" }])],
        },
        {
          dayNumber: 3,
          dayLabel: "Day 3",
          playDate: "2026-11-14",
          groups: [group(1, [{ id: "p2", name: "TWO, PLAYER" }])],
        },
      ],
    });

    expect(result?.days?.map((day) => day.dayNumber)).toEqual([1, 3]);
    expect(result?.days?.map((day) => day.groups.length)).toEqual([1, 1]);
  });

  it("leaves empty groups off the sheet", () => {
    const result = draftPairings({
      ...base,
      days: [
        {
          dayNumber: 1,
          dayLabel: "Day 1",
          playDate: "2026-11-12",
          groups: [group(1, []), group(2, [{ id: "p1", name: "ONE, PLAYER" }]), group(3, [])],
        },
      ],
    });

    expect(result?.groups.map((entry) => entry.number)).toEqual([2]);
  });

  it("returns null when no player is placed", () => {
    const result = draftPairings({
      ...base,
      days: [
        {
          dayNumber: 1,
          dayLabel: "Day 1",
          playDate: "2026-11-12",
          groups: [group(1, []), group(2, [])],
        },
      ],
    });

    expect(result).toBeNull();
  });

  it("carries only the allow-listed player fields", () => {
    const result = draftPairings({
      ...base,
      days: [
        {
          dayNumber: 1,
          dayLabel: "Day 1",
          playDate: "2026-11-12",
          groups: [
            group(1, [
              {
                id: "p1",
                name: "ONE, PLAYER",
                contact: "0917 000 0000",
                handicapIndex: 12.4,
              } as unknown as { id: string; name: string },
            ]),
          ],
        },
      ],
    });

    expect(Object.keys(result?.groups[0]?.players[0] ?? {}).sort()).toEqual([
      "id",
      "name",
      "photoPath",
    ]);
  });
});
