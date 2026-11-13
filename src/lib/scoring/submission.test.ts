import { describe, expect, it } from "vitest";
import { cardSignature, checkCardSubmission, createSubmitGate, readCardValues } from "./submission";
import type { Scorecard } from "./types";

const PAR = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];

function entries(mutate?: (hole: number, strokes: number) => number) {
  return PAR.map((strokes, index) => ({
    hole: index + 1,
    strokes: mutate ? mutate(index + 1, strokes) : strokes,
  }));
}

function card(overrides: Partial<Scorecard> = {}): Scorecard {
  return {
    id: "card-1",
    roundId: "round-1",
    playerId: "p1",
    scorerId: "p2",
    source: "manual",
    revision: 1,
    status: "submitted",
    entries: entries().map((entry) => ({
      ...entry,
      confidence: null,
      manuallyConfirmed: true,
    })),
    writtenTotal: 72,
    submittedAt: "2026-11-12T00:00:00.000Z",
    ...overrides,
  };
}

const base = {
  playerId: "p1",
  scorerId: "p2",
  entries: entries(),
  playerName: "Sample Player A",
};

describe("cardSignature", () => {
  it("does not depend on the order the holes arrived in", () => {
    const forward = cardSignature(entries());
    const backward = cardSignature([...entries()].reverse());

    expect(backward).toBe(forward);
  });

  it("keeps a blank cell distinct from a score", () => {
    expect(cardSignature([{ hole: 1, strokes: null }])).not.toBe(
      cardSignature([{ hole: 1, strokes: 4 }]),
    );
  });

  it("tells a pick-up from a blank cell and from any number", () => {
    const pickup = cardSignature([{ hole: 1, strokes: null, pickedUp: true }]);

    expect(pickup).not.toBe(cardSignature([{ hole: 1, strokes: null }]));
    expect(pickup).not.toBe(cardSignature([{ hole: 1, strokes: 0 }]));
    expect(pickup).not.toBe(cardSignature([{ hole: 1, strokes: 4 }]));
    // A number beside a pick-up flag is still a pick-up.
    expect(cardSignature([{ hole: 1, strokes: 4, pickedUp: true }])).toBe(pickup);
  });
});

describe("checkCardSubmission", () => {
  it("allows a card nobody has sent yet", () => {
    expect(checkCardSubmission({ cards: [], ...base })).toEqual({ kind: "new" });
  });

  it("recognises the identical card already in from the same marker", () => {
    const verdict = checkCardSubmission({ cards: [card()], ...base });

    expect(verdict.kind).toBe("repeat");
    expect(verdict.kind === "repeat" && verdict.message).toContain(
      "already in for Sample Player A",
    );
  });

  it("allows an agreeing card from a second marker", () => {
    const verdict = checkCardSubmission({
      cards: [card()],
      ...base,
      scorerId: "p3",
      playerName: "Sample Player A",
    });

    expect(verdict.kind).toBe("new");
  });

  it("sends a changed card from the same marker to the correction path", () => {
    const verdict = checkCardSubmission({
      cards: [card()],
      ...base,
      entries: entries((hole) => (hole === 4 ? 6 : (PAR[hole - 1] ?? 4))),
    });

    expect(verdict.kind).toBe("needs_correction");
    expect(verdict.kind === "needs_correction" && verdict.message).toContain("Use Edit");
  });

  it("treats the same photo for the same player as already in", () => {
    const verdict = checkCardSubmission({
      cards: [card({ imageSha256: "a".repeat(64) })],
      ...base,
      scorerId: "p3",
      entries: entries((hole) => (hole === 1 ? 6 : (PAR[hole - 1] ?? 4))),
      imageSha256: "a".repeat(64),
    });

    expect(verdict.kind).toBe("same_photo");
  });

  it("allows the same group photo for a second player", () => {
    const verdict = checkCardSubmission({
      cards: [card({ imageSha256: "a".repeat(64) })],
      ...base,
      playerId: "p2",
      scorerId: "p3",
      imageSha256: "a".repeat(64),
    });

    expect(verdict.kind).toBe("new");
  });

  it("ignores a rejected or revoked card as evidence of a duplicate", () => {
    for (const status of ["rejected", "revoked", "superseded"] as const) {
      const verdict = checkCardSubmission({ cards: [card({ status })], ...base });
      expect(verdict.kind).toBe("new");
    }
  });

  it("does not create a revision when a correction changed nothing", () => {
    const verdict = checkCardSubmission({ cards: [card()], ...base, correcting: true });

    expect(verdict.kind).toBe("repeat");
    expect(verdict.kind === "repeat" && verdict.message).toContain("Nothing changed");
  });

  it("allows a correction that does change a cell", () => {
    const verdict = checkCardSubmission({
      cards: [card()],
      ...base,
      correcting: true,
      entries: entries((hole) => (hole === 7 ? 4 : (PAR[hole - 1] ?? 4))),
    });

    expect(verdict.kind).toBe("new");
  });

  it("treats a card that differs only by a pick-up as a correction", () => {
    const withPickup = [{ hole: 1, strokes: null, pickedUp: true }, ...entries().slice(1)];
    const verdict = checkCardSubmission({ cards: [card()], ...base, entries: withPickup });

    expect(verdict.kind).toBe("needs_correction");
  });

  it("recognises the same pick-up card already in from the same marker", () => {
    const withPickup = [{ hole: 1, strokes: null, pickedUp: true }, ...entries().slice(1)];
    const stored = card({
      entries: withPickup.map((entry) => ({
        ...entry,
        confidence: null,
        manuallyConfirmed: true,
      })),
    });

    const verdict = checkCardSubmission({ cards: [stored], ...base, entries: withPickup });
    expect(verdict.kind).toBe("repeat");
  });
});

describe("createSubmitGate", () => {
  it("lets exactly one request in while it is running", () => {
    const gate = createSubmitGate();

    expect(gate.tryEnter()).toBe(true);
    expect(gate.tryEnter()).toBe(false);
    expect(gate.tryEnter()).toBe(false);
    expect(gate.busy).toBe(true);

    gate.leave();
    expect(gate.busy).toBe(false);
    expect(gate.tryEnter()).toBe(true);
  });
});

describe("readCardValues", () => {
  const holes = [{ number: 1 }, { number: 2 }, { number: 3 }];

  it("keeps an empty cell empty instead of reading it as a zero", () => {
    const { entries, problems } = readCardValues(holes, { 1: "4", 2: "", 3: "5" });

    expect(entries).toEqual([
      { hole: 1, strokes: 4 },
      { hole: 2, strokes: null },
      { hole: 3, strokes: 5 },
    ]);
    expect(problems).toEqual(["Hole 2 is empty. Type the score from the card."]);
  });

  it("refuses a value outside the stroke limits", () => {
    const { problems } = readCardValues(holes, { 1: "0", 2: "21", 3: "4.5" });

    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain("between 1 and 20");
  });

  it("reports nothing for a complete card", () => {
    expect(readCardValues(holes, { 1: "4", 2: "5", 3: "3" }).problems).toEqual([]);
  });

  it("reads X, x and a padded X as a pick-up with no problem", () => {
    const { entries, problems } = readCardValues(holes, { 1: "X", 2: "x", 3: " X " });

    expect(problems).toEqual([]);
    expect(entries).toEqual([
      { hole: 1, strokes: null, pickedUp: true },
      { hole: 2, strokes: null, pickedUp: true },
      { hole: 3, strokes: null, pickedUp: true },
    ]);
  });

  it("still refuses other text, zero and a dash", () => {
    const { entries, problems } = readCardValues(holes, { 1: "XX", 2: "0", 3: "-" });

    expect(problems).toHaveLength(3);
    expect(entries.every((entry) => entry.pickedUp !== true)).toBe(true);
  });
});
