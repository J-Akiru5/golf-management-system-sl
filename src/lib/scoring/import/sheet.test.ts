import { describe, expect, it } from "vitest";
import { makeCard, parEntries, TEST_COURSE } from "../__tests__/fixtures";
import { BAMBOO_TEE_2026_RULES } from "../event-rules";
import type { Scorecard } from "../types";
import {
  parseSheetExport,
  type ResolveSheetImportInput,
  resolveSheetImport,
  type SheetCard,
  type SheetExport,
  sheetCaptureKey,
  sheetNameKey,
} from "./sheet";

const PAR_CELLS = TEST_COURSE.holes.map((hole) => String(hole.par));

function sheetCard(overrides: Partial<SheetCard> = {}): SheetCard {
  return {
    id: "c1",
    name: "ALPHA, ANN",
    group: "1",
    tee: "W",
    hdcp: "16.7",
    written: "72",
    verified: true,
    cls: "B",
    note: "",
    holes: [...PAR_CELLS],
    ...overrides,
  };
}

function sheetFile(cards: SheetCard[], overrides: Partial<SheetExport> = {}): SheetExport {
  return {
    slug: "day3-am",
    label: "Day 3 AM",
    exportedAt: "2026-11-14T08:00:00.000Z",
    mode: "written",
    cards,
    ...overrides,
  };
}

const ROSTER = [
  { playerId: "p3", playerName: "CHARLIE, CHUCK", frozenIndex: 11.2, tee: TEST_COURSE.tee },
  { playerId: "p1", playerName: "ALPHA, ANN", frozenIndex: 16.4, tee: TEST_COURSE.tee },
  { playerId: "p2", playerName: "BRAVO, BOB", frozenIndex: 22.9, tee: TEST_COURSE.tee },
];

const LADIES_TEE = {
  id: "ladies",
  name: "Ladies Red",
  courseRating: 74,
  slope: 124,
  par: 72,
};

function resolve(
  cards: SheetCard[],
  overrides: Partial<ResolveSheetImportInput> = {},
  file: Partial<SheetExport> = {},
) {
  return resolveSheetImport({
    file: sheetFile(cards, file),
    roundId: "round-1",
    rules: BAMBOO_TEE_2026_RULES,
    strokeLimits: { min: 1, max: 20 },
    holes: TEST_COURSE.holes,
    players: ROSTER,
    cards: [],
    tee: TEST_COURSE.tee,
    ...overrides,
  });
}

describe("reading the sheet export", () => {
  it("reads the export the sheet's own route writes", () => {
    const result = parseSheetExport({
      format: "bamboo-scores-edit",
      version: 1,
      slug: "day3-am",
      label: "Day 3 AM",
      exportedAt: "2026-11-14T08:00:00.000Z",
      mode: "written",
      reviewBatches: [],
      activeReviewBatchId: "all",
      cards: [
        {
          id: "c1",
          name: " ALPHA, ANN ",
          group: 4,
          tee: "W",
          hdcp: "16.7",
          written: "",
          verified: true,
          cls: "B",
          note: "initialled",
          holes: [...PAR_CELLS.slice(0, 17), "X"],
        },
      ],
    });
    expect(result.problems).toEqual([]);
    expect(result.file?.cards[0]).toMatchObject({
      id: "c1",
      name: "ALPHA, ANN",
      group: "4",
      hdcp: "16.7",
      verified: true,
    });
    expect(result.file?.cards[0]?.holes[17]).toBe("X");
  });

  it("reads every spelling of a blank hole as a blank", () => {
    const holes = [...PAR_CELLS];
    holes[0] = "";
    holes[1] = "0";
    holes[2] = "-";
    holes[3] = null as unknown as string;
    holes[4] = { v: "" } as unknown as string;
    const result = parseSheetExport({
      format: "bamboo-scores-edit",
      version: 1,
      cards: [{ id: "c1", name: "A", holes }],
    });
    expect(result.file?.cards[0]?.holes.slice(0, 5)).toEqual(["", "", "", "", ""]);
  });

  it("refuses a file that is not a sheet export", () => {
    for (const value of [null, [], "x", { cards: [] }, { format: "teeline-scorecard-import" }]) {
      const result = parseSheetExport(value);
      expect(result.file).toBeNull();
      expect(result.problems.length).toBeGreaterThan(0);
    }
    expect(
      parseSheetExport({ format: "bamboo-scores-edit", version: 2, cards: [{}] }).file,
    ).toBeNull();
    expect(
      parseSheetExport({ format: "bamboo-scores-edit", version: 1, cards: [] }).file,
    ).toBeNull();
  });

  it("leaves a bad card out by name and keeps the rest", () => {
    const good = { id: "c1", name: "A", holes: PAR_CELLS };
    const result = parseSheetExport({
      format: "bamboo-scores-edit",
      version: 1,
      cards: [
        good,
        { id: "c2", name: "SHORT", holes: PAR_CELLS.slice(0, 17) },
        { id: "c3", name: "WILD", holes: [...PAR_CELLS.slice(0, 17), "99"] },
        { name: "NO ID", holes: PAR_CELLS },
        { ...good, name: "REPEAT" },
        7,
      ],
    });
    expect(result.cardCount).toBe(6);
    expect(result.file?.cards.map((card) => card.id)).toEqual(["c1"]);
    expect(result.problems).toHaveLength(5);
    expect(result.problems.join(" ")).toContain("SHORT");
    expect(result.problems.join(" ")).toContain("hole 18");
  });

  it("treats a missing mode as the written setting, as the export route does", () => {
    const result = parseSheetExport({
      format: "bamboo-scores-edit",
      version: 1,
      cards: [{ id: "c1", name: "A", holes: PAR_CELLS }],
    });
    expect(result.file?.mode).toBe("written");
  });
});

describe("name keys", () => {
  it("ignore case, accents, punctuation and word order", () => {
    expect(sheetNameKey("ADORIO, RONNEL")).toBe(sheetNameKey("Ronnel Adorio"));
    expect(sheetNameKey("AÑALUCAS, RIZALDY")).toBe(sheetNameKey("analucas rizaldy"));
    expect(sheetNameKey("KIM IN SIL")).toBe(sheetNameKey("KIM, IN SIL"));
    expect(sheetNameKey("ALPHA, ANN")).not.toBe(sheetNameKey("ALPHA, ANNE"));
  });
});

describe("planning the import", () => {
  it("makes a verified card ready to save and approve, with the WHS handicap applied", () => {
    const plan = resolve([sheetCard()]);
    expect(plan.fileProblems).toEqual([]);
    expect(plan.ready).toHaveLength(1);
    const card = plan.ready[0];
    expect(card).toMatchObject({
      sheetCardId: "c1",
      playerId: "p1",
      playerName: "ALPHA, ANN",
      cardHandicap: "16.7",
      // Index 16.4 on the test tee plays off 18, not the 16 the box would drop to.
      playingHandicap: 18,
      cardNote: "card says 16.7, plays off 18 (index 16.4, White)",
      approve: true,
      pickups: 0,
      gross: 72,
      writtenTotal: 72,
      captureKey: sheetCaptureKey("round-1", "day3-am", "c1"),
    });
    expect(card?.marker.playerId).toBe("p2");
    expect(card?.entries).toHaveLength(18);
  });

  it("keeps an unverified card for the desk to approve", () => {
    const plan = resolve([sheetCard({ verified: false })]);
    expect(plan.ready[0]?.approve).toBe(false);
  });

  it("stores an X as a pick-up with no stroke count and skips the written total check", () => {
    const holes = [...PAR_CELLS];
    holes[6] = "X";
    const plan = resolve([sheetCard({ holes, written: "69" })]);
    expect(plan.blocked).toEqual([]);
    const card = plan.ready[0];
    expect(card?.pickups).toBe(1);
    expect(card?.gross).toBe(69);
    expect(card?.entries[6]).toEqual({
      hole: 7,
      strokes: null,
      pickedUp: true,
      confidence: null,
      manuallyConfirmed: true,
    });
    expect(card?.entries[0]?.strokes).toBe(4);
  });

  it("takes the playing handicap from each player's index and tee, not from the HDCP box", () => {
    const plan = resolve([
      sheetCard({ id: "c1", hdcp: "" }),
      sheetCard({ id: "c2", name: "BRAVO, BOB", hdcp: "22.9" }),
    ]);
    // Index 16.4 plays off 18 and index 22.9 off 25 on the test tee; neither box decides it.
    expect(plan.ready.map((card) => card.playingHandicap)).toEqual([18, 25]);
    expect(plan.ready.map((card) => card.cardHandicap)).toEqual(["", "22.9"]);
  });

  it("keeps a box it cannot read as a note and still plans the card", () => {
    const plan = resolve([sheetCard({ hdcp: "+1.2" })]);
    expect(plan.blocked).toEqual([]);
    expect(plan.ready[0]?.playingHandicap).toBe(18);
    expect(plan.ready[0]?.cardNote).toBe("card says +1.2, plays off 18 (index 16.4, White)");
  });

  it("keeps the number unchanged when the card names the registration tee", () => {
    const plan = resolve([sheetCard({ tee: "W" })]);
    expect(plan.blocked).toEqual([]);
    expect(plan.ready[0]?.playingHandicap).toBe(18);
  });

  it("reads the registration tee when the card has no tee letter", () => {
    const plan = resolve([sheetCard({ tee: "" })]);
    expect(plan.blocked).toEqual([]);
    expect(plan.ready[0]?.playingHandicap).toBe(18);
  });

  it("reads a Ladies registration named Ladies Red as the card's L", () => {
    const plan = resolve([sheetCard({ tee: "L" })], {
      players: ROSTER.map((player) =>
        player.playerId === "p1" ? { ...player, tee: LADIES_TEE } : player,
      ),
    });
    expect(plan.blocked).toEqual([]);
    // Index 16.4 on the Ladies Red tee plays off 20.
    expect(plan.ready[0]?.playingHandicap).toBe(20);
    expect(plan.ready[0]?.cardNote).toBe("card says 16.7, plays off 20 (index 16.4, Ladies Red)");
  });

  it("blocks a card whose tee differs from the registration, naming the fix", () => {
    const plan = resolve([sheetCard({ tee: "L" })]);
    expect(plan.ready).toEqual([]);
    const reasons = plan.blocked[0]?.reasons.join(" ") ?? "";
    expect(reasons).toContain("The card says Ladies (L), but the registration tee is White");
    expect(reasons).toContain("Set the registration tee to Ladies in the field list");
  });

  it("blocks a card tee that is not one of the card letters", () => {
    const plan = resolve([sheetCard({ tee: "Championship" })]);
    expect(plan.ready).toEqual([]);
    expect(plan.blocked[0]?.reasons.join(" ")).toContain("not one of B, W, L or S");
  });

  it("blocks a card with a tee when the registration has no tee", () => {
    const plan = resolve([sheetCard({ tee: "L" })], {
      players: ROSTER.map((player) => ({ ...player, tee: null })),
    });
    expect(plan.ready).toEqual([]);
    expect(plan.blocked[0]?.reasons.join(" ")).toContain("the registration has no tee");
  });

  it("blocks a card whose player has no tee, naming the fix", () => {
    const plan = resolve([sheetCard()], {
      players: ROSTER.map((player) => ({ ...player, tee: null })),
    });
    expect(plan.ready).toEqual([]);
    expect(plan.blocked[0]?.playerName).toBe("ALPHA, ANN");
    expect(plan.blocked[0]?.reasons.join(" ")).toContain("no tee");
  });

  it("lists a name with no match as unmatched and never picks a near one", () => {
    const plan = resolve([
      sheetCard({ id: "c1", name: "ALPHA, ANNE" }),
      sheetCard({ id: "c2", name: "" }),
      sheetCard({ id: "c3", name: "UNKNOWN PLAYER" }),
    ]);
    expect(plan.ready).toEqual([]);
    expect(plan.unmatched.map((entry) => entry.card.id)).toEqual(["c1", "c2", "c3"]);
    expect(plan.unmatched[0]?.reason).toContain("No player");
  });

  it("lists a name two players share as unmatched", () => {
    const plan = resolve([sheetCard()], {
      players: [...ROSTER, { playerId: "p9", playerName: "Ann Alpha" }],
    });
    expect(plan.ready).toEqual([]);
    expect(plan.unmatched[0]?.reason).toContain("More than one");
  });

  it("matches a name written in another order or style", () => {
    const plan = resolve([sheetCard({ name: "Ann Alpha" })]);
    expect(plan.ready[0]?.playerId).toBe("p1");
  });

  it("blocks a blank hole and names it", () => {
    const holes = [...PAR_CELLS];
    holes[13] = "";
    const plan = resolve([sheetCard({ holes })]);
    expect(plan.ready).toEqual([]);
    expect(plan.blocked[0]?.reasons).toEqual(["Hole 14 is blank."]);
  });

  it("blocks a score outside the round's range", () => {
    const holes = [...PAR_CELLS];
    holes[0] = "15";
    const plan = resolve([sheetCard({ holes, written: "" })], {
      strokeLimits: { min: 1, max: 12 },
    });
    expect(plan.blocked[0]?.reasons[0]).toContain("outside this round's range of 1 to 12");
  });

  it("blocks a written total that does not add up when there is no pick-up", () => {
    const plan = resolve([sheetCard({ written: "73" })]);
    expect(plan.blocked[0]?.reasons).toEqual([
      "The written total is 73, but the holes add up to 72.",
    ]);
    expect(resolve([sheetCard({ written: "seventy" })]).blocked[0]?.reasons[0]).toContain(
      "not a whole number",
    );
  });

  it("takes a card with no written total", () => {
    const plan = resolve([sheetCard({ written: "" })]);
    expect(plan.ready[0]?.writtenTotal).toBeNull();
  });

  it("blocks a second card for the same player in the file", () => {
    const plan = resolve([sheetCard({ id: "c1" }), sheetCard({ id: "c2" })]);
    expect(plan.ready.map((card) => card.sheetCardId)).toEqual(["c1"]);
    expect(plan.blocked[0]?.reasons[0]).toContain("already has a card for ALPHA, ANN");
  });

  it("reads a file worked out with either handicap setting, since the import works the handicap out", () => {
    const plan = resolve([sheetCard()], {}, { mode: "whs" });
    expect(plan.fileProblems).toEqual([]);
    expect(plan.ready[0]?.playingHandicap).toBe(18);
  });

  it("refuses the whole file for a round that is not 18 holes", () => {
    const plan = resolve([sheetCard()], { holes: TEST_COURSE.holes.slice(0, 9) });
    expect(plan.fileProblems[0]).toContain("18 holes");
  });

  describe("against cards already in", () => {
    function existing(overrides: Partial<Scorecard>): Scorecard {
      return makeCard({
        roundId: "round-1",
        playerId: "p1",
        scorerId: "p3",
        entries: parEntries(),
        ...overrides,
      });
    }

    it("leaves an identical approved card alone", () => {
      const plan = resolve([sheetCard()], { cards: [existing({ status: "approved" })] });
      expect(plan.ready).toEqual([]);
      expect(plan.alreadyIn).toHaveLength(1);
      // The marker is the one the card already has, not a new one.
      expect(plan.alreadyIn[0]?.marker.playerId).toBe("p3");
    });

    it("still approves an identical card that is waiting, when the sheet verified it", () => {
      const plan = resolve([sheetCard()], { cards: [existing({ status: "submitted" })] });
      expect(plan.ready).toHaveLength(1);
      expect(plan.alreadyIn).toEqual([]);
    });

    it("leaves an identical waiting card alone when the sheet has not verified it", () => {
      const plan = resolve([sheetCard({ verified: false })], {
        cards: [existing({ status: "submitted" })],
      });
      expect(plan.alreadyIn).toHaveLength(1);
    });

    it("blocks different scores for a player who already has a card and points to Edit", () => {
      const holes = [...PAR_CELLS];
      holes[0] = "6";
      const plan = resolve([sheetCard({ holes, written: "" })], {
        cards: [existing({ status: "approved" })],
      });
      expect(plan.ready).toEqual([]);
      expect(plan.blocked[0]?.reasons[0]).toContain("Use Edit on that card");
    });

    it("ignores a rejected card", () => {
      const plan = resolve([sheetCard()], { cards: [existing({ status: "rejected" })] });
      expect(plan.ready).toHaveLength(1);
    });
  });

  it("does not depend on the order the round lists its players", () => {
    const forward = resolve([sheetCard()]).ready[0]?.marker.playerId;
    const backward = resolve([sheetCard()], { players: [...ROSTER].reverse() }).ready[0]?.marker
      .playerId;
    expect(forward).toBe(backward);
  });
});
