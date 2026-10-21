import { describe, expect, it } from "vitest";
import { validateScorecard } from "../cards";
import type { CardEntry, CardSource, Scorecard } from "../types";
import { makeCard, TEST_COURSE } from "./fixtures";

const input = { course: TEST_COURSE, minOcrConfidence: 0.85 };

function withEntry(card: Scorecard, hole: number, patch: Partial<CardEntry>): Scorecard {
  return {
    ...card,
    entries: card.entries.map((entry) => (entry.hole === hole ? { ...entry, ...patch } : entry)),
  };
}

function issueCodes(card: Scorecard): string[] {
  return validateScorecard(card, input).issues.map((issue) => issue.code);
}

describe("scorecard validation", () => {
  it("approves a complete, internally consistent card", () => {
    const validation = validateScorecard(makeCard(), input);
    expect(validation.approvable).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it("uses the same pipeline for webcam, upload and manual entry", () => {
    const entries = makeCard().entries;
    const results = (["manual", "upload", "webcam"] as CardSource[]).map((source) =>
      validateScorecard(makeCard({ source, entries }), input),
    );

    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it("rejects a player marking their own card", () => {
    const validation = validateScorecard(makeCard({ scorerId: "player-1" }), input);
    expect(validation.approvable).toBe(false);
    expect(validation.issues).toEqual([
      expect.objectContaining({ code: "self_scored", severity: "blocking" }),
    ]);
  });

  it("rejects a card from another daily round", () => {
    expect(issueCodes(makeCard({ roundId: "round-2" }))).toContain("wrong_round");
  });

  it("rejects duplicate and unknown holes", () => {
    const card = makeCard();
    const first = card.entries[0];
    if (!first) throw new Error("Fixture has no holes.");

    const duplicate = validateScorecard(
      { ...card, entries: [...card.entries, { ...first }] },
      input,
    );
    expect(duplicate.approvable).toBe(false);
    expect(duplicate.issues.some((issue) => issue.code === "duplicate_hole")).toBe(true);

    const unknown = validateScorecard(
      {
        ...card,
        entries: [
          ...card.entries,
          { hole: 19, strokes: 4, confidence: null, manuallyConfirmed: true },
        ],
      },
      input,
    );
    expect(unknown.issues.some((issue) => issue.code === "unknown_hole")).toBe(true);
  });

  it("rejects a card with a hole missing", () => {
    const card = makeCard();
    const validation = validateScorecard(
      { ...card, entries: card.entries.filter((entry) => entry.hole !== 3), writtenTotal: null },
      input,
    );
    expect(validation.approvable).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_hole", hole: 3, severity: "blocking" }),
      ]),
    );
  });

  it("rejects an impossible score", () => {
    for (const strokes of [0, 21, 4.5]) {
      const validation = validateScorecard(withEntry(makeCard(), 1, { strokes }), input);
      expect(validation.approvable).toBe(false);
      expect(validation.issues.some((issue) => issue.code === "invalid_strokes")).toBe(true);
    }
  });

  it("rejects a written total that disagrees with the holes", () => {
    const validation = validateScorecard(makeCard({ writtenTotal: 71 }), input);
    expect(validation.approvable).toBe(false);
    expect(validation.issues).toEqual([
      expect.objectContaining({ code: "written_total_mismatch", severity: "blocking" }),
    ]);
  });

  it("warns, but does not block, when there is no written total", () => {
    const validation = validateScorecard(makeCard({ writtenTotal: null }), input);
    expect(validation.approvable).toBe(true);
    expect(validation.issues).toEqual([
      expect.objectContaining({ code: "written_total_missing", severity: "warning" }),
    ]);
  });

  it("keeps a low-confidence OCR value as a review item, never a correction", () => {
    const card = withEntry(makeCard({ source: "upload", writtenTotal: 74 }), 4, {
      confidence: 0.42,
      manuallyConfirmed: false,
      strokes: 7,
    });
    const validation = validateScorecard(card, input);

    expect(validation.approvable).toBe(false);
    expect(validation.issues).toEqual([
      expect.objectContaining({ code: "low_confidence", hole: 4, severity: "review" }),
    ]);
    expect(card.entries.find((entry) => entry.hole === 4)?.strokes).toBe(7);
  });

  it("accepts a low-confidence value once a person confirms it", () => {
    const card = withEntry(makeCard({ source: "webcam", writtenTotal: 74 }), 4, {
      confidence: 0.42,
      manuallyConfirmed: true,
      strokes: 7,
    });
    const validation = validateScorecard(card, input);
    expect(validation.approvable).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it("treats an unconfirmed value with no confidence as a review item", () => {
    const validation = validateScorecard(
      withEntry(makeCard(), 2, { confidence: null, manuallyConfirmed: false }),
      input,
    );
    expect(validation.approvable).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "low_confidence", hole: 2, severity: "review" }),
      ]),
    );
  });

  it("rejects an impossible confidence value", () => {
    const validation = validateScorecard(withEntry(makeCard(), 5, { confidence: 1.5 }), input);
    expect(validation.approvable).toBe(false);
    expect(validation.issues.some((issue) => issue.code === "invalid_confidence")).toBe(true);
  });

  it("rejects an invalid revision", () => {
    const validation = validateScorecard(makeCard({ revision: 0 }), input);
    expect(validation.approvable).toBe(false);
    expect(validation.issues.some((issue) => issue.code === "invalid_revision")).toBe(true);
  });
});
