import { describe, expect, it } from "vitest";
import { concernSummary, normaliseConcern } from "./concerns";

describe("normaliseConcern", () => {
  it("accepts several ticked concerns and drops duplicates", () => {
    const result = normaliseConcern({
      concerns: ["inquiry", "handicap", "inquiry"],
      source: "form",
    });
    expect(result).toEqual({
      ok: true,
      details: { concerns: ["inquiry", "handicap"], source: "form" },
    });
  });

  it("refuses a note with nothing ticked or an unknown kind", () => {
    expect(normaliseConcern({ concerns: [], source: "form" })).toEqual({
      ok: false,
      problem: "no_concern",
    });
    expect(normaliseConcern({ concerns: ["refund"], source: "form" })).toEqual({
      ok: false,
      problem: "unknown_concern",
    });
  });

  it("needs a hole between 1 and 18 when Score is ticked", () => {
    expect(normaliseConcern({ concerns: ["score"], source: "form" })).toMatchObject({
      problem: "hole_required",
    });
    expect(normaliseConcern({ concerns: ["score"], holeNo: 19, source: "form" })).toMatchObject({
      problem: "hole_out_of_range",
    });
    expect(normaliseConcern({ concerns: ["score"], holeNo: "7", source: "form" })).toEqual({
      ok: true,
      details: { concerns: ["score"], holeNo: 7, source: "form" },
    });
  });

  it("needs a known tee colour when Tee off is ticked", () => {
    expect(normaliseConcern({ concerns: ["tee_off"], source: "form" })).toMatchObject({
      problem: "tee_required",
    });
    expect(
      normaliseConcern({ concerns: ["tee_off"], teeColour: "gold", source: "form" }),
    ).toMatchObject({ problem: "tee_unknown" });
  });

  it("needs a line when Others is ticked, and drops follow-ups for unticked kinds", () => {
    expect(normaliseConcern({ concerns: ["other"], source: "form" })).toMatchObject({
      problem: "other_required",
    });
    const result = normaliseConcern({
      concerns: ["other"],
      otherText: "  cart   booking ",
      holeNo: 4,
      teeColour: "red",
      source: "form",
    });
    expect(result).toEqual({
      ok: true,
      details: { concerns: ["other"], otherText: "cart booking", source: "form" },
    });
  });

  it("keeps the player's own words for name, handicap and schedule", () => {
    const result = normaliseConcern({
      concerns: ["name_typo"],
      playerName: " Juan  Dela Cruz ",
      handicap: "+1.2",
      schedule: "Day 2, 7:12 AM",
      source: "chat",
    });
    expect(result).toMatchObject({
      ok: true,
      details: { playerName: "Juan Dela Cruz", handicap: "+1.2", schedule: "Day 2, 7:12 AM" },
    });
  });

  it("accepts a transcript only from the chat", () => {
    const transcript = [{ role: "user", content: "Mali ang ngalan ko" }];
    expect(normaliseConcern({ concerns: ["name_typo"], source: "form", transcript })).toMatchObject(
      { problem: "bad_transcript" },
    );
    expect(normaliseConcern({ concerns: ["name_typo"], source: "chat", transcript })).toMatchObject(
      { ok: true, details: { transcript } },
    );
  });
});

describe("concernSummary", () => {
  it("reads as one line with the follow-ups", () => {
    expect(
      concernSummary({
        concerns: ["score", "tee_off", "other"],
        holeNo: 7,
        teeColour: "white",
        otherText: "cart",
      }),
    ).toBe("Score (hole 7), Tee off (White), Others: cart");
  });
});
