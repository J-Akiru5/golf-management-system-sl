import { describe, expect, it } from "vitest";
import { indexCorrectionNote, roundsToCorrect, todayInManila } from "./round-handicap";

/** Which rounds an index correction reaches, and the note each republished round carries. */

const rounds = [
  { id: "round-1", status: "final" },
  { id: "round-2", status: "scoring" },
  { id: "round-3", status: "provisional" },
  { id: "round-4", status: "open" },
  { id: "round-5", status: "draft" },
];

const roundEntries = [
  { id: "re-1", roundId: "round-1", registrationId: "reg-1" },
  { id: "re-2", roundId: "round-2", registrationId: "reg-1" },
  { id: "re-3", roundId: "round-3", registrationId: "reg-1" },
  { id: "re-4", roundId: "round-4", registrationId: "reg-1" },
  { id: "re-5", roundId: "round-5", registrationId: "reg-1" },
  { id: "re-9", roundId: "round-2", registrationId: "reg-2" },
];

describe("roundsToCorrect", () => {
  it("takes the scored and provisional rounds the registration has an entry in", () => {
    expect(
      roundsToCorrect({
        rounds,
        roundEntries,
        registrationId: "reg-1",
        publicationCounts: { "round-2": 2, "round-3": 1 },
      }),
    ).toEqual([
      { roundId: "round-2", roundEntryId: "re-2", publish: true },
      { roundId: "round-3", roundEntryId: "re-3", publish: true },
    ]);
  });

  it("keeps the rounds in day order and asks for one correction per round", () => {
    const result = roundsToCorrect({
      rounds: [...rounds].reverse(),
      roundEntries,
      registrationId: "reg-1",
      publicationCounts: {},
    });

    // The caller reads the rounds in day order, and the answer follows that order.
    expect(result.map((row) => row.roundId)).toEqual(["round-3", "round-2"]);
  });

  it("corrects a round that has never been published without publishing it", () => {
    expect(
      roundsToCorrect({
        rounds,
        roundEntries,
        registrationId: "reg-1",
        publicationCounts: { "round-2": 0 },
      }),
    ).toEqual([
      { roundId: "round-2", roundEntryId: "re-2", publish: false },
      { roundId: "round-3", roundEntryId: "re-3", publish: false },
    ]);
  });

  it("leaves a final, open or draft round alone", () => {
    const touched = roundsToCorrect({
      rounds,
      roundEntries,
      registrationId: "reg-1",
      publicationCounts: {},
    }).map((row) => row.roundId);

    expect(touched).not.toContain("round-1");
    expect(touched).not.toContain("round-4");
    expect(touched).not.toContain("round-5");
  });

  it("ignores a round entry that belongs to another registration", () => {
    expect(
      roundsToCorrect({
        rounds: [{ id: "round-2", status: "scoring" }],
        roundEntries: [{ id: "re-9", roundId: "round-2", registrationId: "reg-2" }],
        registrationId: "reg-1",
        publicationCounts: {},
      }),
    ).toEqual([]);
  });

  it("answers nothing when the player has no round entry at all", () => {
    expect(
      roundsToCorrect({
        rounds,
        roundEntries: [],
        registrationId: "reg-1",
        publicationCounts: { "round-2": 3 },
      }),
    ).toEqual([]);
  });
});

describe("indexCorrectionNote", () => {
  it("names the player, the new index and the tee it was worked out on", () => {
    expect(indexCorrectionNote({ playerName: "Braga, Nonoy", index: 12.3, teeName: "White" })).toBe(
      "BRAGA, NONOY: index corrected to 12.3; playing handicap recalculated from the White tee.",
    );
  });

  it("writes a plus handicap the way a golfer reads it", () => {
    expect(
      indexCorrectionNote({ playerName: "Villa, Jose", index: -1.5, teeName: "Blue" }),
    ).toContain("index corrected to +1.5");
  });
});

describe("todayInManila", () => {
  it("reads the club's date, not the UTC one", () => {
    // 16:30 UTC on 14 November is already the evening of 15 November in Iloilo.
    expect(todayInManila(new Date("2026-11-14T16:30:00Z"))).toBe("2026-11-15");
    expect(todayInManila(new Date("2026-11-14T08:00:00Z"))).toBe("2026-11-14");
  });
});
