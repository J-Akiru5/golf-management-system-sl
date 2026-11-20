import { describe, expect, it } from "vitest";
import { normaliseConcern } from "@/lib/data/concerns";
import {
  declineConcernFields,
  emptyConcernDraft,
  isConcernDraftComplete,
  mergeConcernDraft,
  nextMissingField,
  summariseForPlayer,
  toConcernPayload,
} from "./draft";

const SCORE_ONLY = { concerns: ["score"], holeNo: 7 };

describe("merging what the model extracted", () => {
  it("keeps a known concern and drops an unknown one", () => {
    const draft = mergeConcernDraft(emptyConcernDraft(), {
      concerns: ["score", "made-up", "inquiry"],
    });
    expect(draft.concerns).toEqual(["score", "inquiry"]);
  });

  it("adds concerns without dropping earlier ones", () => {
    const first = mergeConcernDraft(emptyConcernDraft(), { concerns: ["score"] });
    const second = mergeConcernDraft(first, { concerns: ["tee_off"], teeColour: "white" });
    expect(second.concerns).toEqual(["score", "tee_off"]);
    expect(second.teeColour).toBe("white");
  });

  it("keeps a follow-up only when its concern is ticked", () => {
    const noConcerns = mergeConcernDraft(emptyConcernDraft(), { holeNo: 7, teeColour: "white" });
    expect(noConcerns.holeNo).toBeUndefined();
    expect(noConcerns.teeColour).toBeUndefined();

    const withScore = mergeConcernDraft(emptyConcernDraft(), {
      concerns: ["score"],
      holeNo: 7,
    });
    expect(withScore.holeNo).toBe(7);
  });

  it("refuses a hole outside 1 to 18 and a hole written as a sentence", () => {
    expect(
      mergeConcernDraft(emptyConcernDraft(), { concerns: ["score"], holeNo: 19 }).holeNo,
    ).toBeUndefined();
    expect(
      mergeConcernDraft(emptyConcernDraft(), { concerns: ["score"], holeNo: 0 }).holeNo,
    ).toBeUndefined();
    expect(
      mergeConcernDraft(emptyConcernDraft(), { concerns: ["score"], holeNo: "hole 7" }).holeNo,
    ).toBeUndefined();
    expect(
      mergeConcernDraft(emptyConcernDraft(), { concerns: ["score"], holeNo: "7" }).holeNo,
    ).toBe(7);
  });

  it("accepts a tee colour in any casing and refuses an unknown one", () => {
    expect(
      mergeConcernDraft(emptyConcernDraft(), { concerns: ["tee_off"], teeColour: " White " })
        .teeColour,
    ).toBe("white");
    expect(
      mergeConcernDraft(emptyConcernDraft(), { concerns: ["tee_off"], teeColour: "green" })
        .teeColour,
    ).toBeUndefined();
  });

  it("trims and collapses text, and caps it at the contract's limit", () => {
    const draft = mergeConcernDraft(emptyConcernDraft(), {
      concerns: ["other"],
      otherText: `  the   cart   path\nwas closed  `,
    });
    expect(draft.otherText).toBe("the cart path was closed");

    const long = mergeConcernDraft(emptyConcernDraft(), {
      concerns: ["other"],
      otherText: "x".repeat(400),
    });
    expect(long.otherText).toHaveLength(200);
  });

  it("never overwrites a stated value with an empty one", () => {
    const first = mergeConcernDraft(emptyConcernDraft(), { playerName: "Juan" });
    const second = mergeConcernDraft(first, { playerName: "   " });
    expect(second.playerName).toBe("Juan");
  });
});

describe("the next thing to ask", () => {
  it("starts with the concern itself", () => {
    expect(nextMissingField(emptyConcernDraft())).toBe("concerns");
  });

  it("asks for the hole, the tee and the free text a concern needs", () => {
    expect(nextMissingField(mergeConcernDraft(emptyConcernDraft(), { concerns: ["score"] }))).toBe(
      "holeNo",
    );
    expect(
      nextMissingField(mergeConcernDraft(emptyConcernDraft(), { concerns: ["tee_off"] })),
    ).toBe("teeColour");
    expect(nextMissingField(mergeConcernDraft(emptyConcernDraft(), { concerns: ["other"] }))).toBe(
      "otherText",
    );
  });

  it("asks for name, handicap and schedule in order, then finishes", () => {
    let draft = mergeConcernDraft(emptyConcernDraft(), SCORE_ONLY);
    expect(nextMissingField(draft)).toBe("playerName");
    draft = mergeConcernDraft(draft, { playerName: "Juan" });
    expect(nextMissingField(draft)).toBe("handicap");
    draft = mergeConcernDraft(draft, { handicap: "12.4" });
    expect(nextMissingField(draft)).toBe("schedule");
    draft = mergeConcernDraft(draft, { schedule: "Day 2, 7:12 AM" });
    expect(nextMissingField(draft)).toBeNull();
    expect(isConcernDraftComplete(draft)).toBe(true);
  });

  it("moves on when an optional field is declined", () => {
    let draft = mergeConcernDraft(emptyConcernDraft(), SCORE_ONLY);
    draft = declineConcernFields(draft, ["playerName", "handicap", "schedule"]);
    expect(draft.declined).toEqual(["playerName", "handicap", "schedule"]);
    expect(nextMissingField(draft)).toBeNull();
  });

  it("does not decline a field the player already answered", () => {
    const draft = mergeConcernDraft(emptyConcernDraft(), {
      concerns: ["score"],
      holeNo: 4,
      playerName: "Juan",
    });
    const after = declineConcernFields(draft, ["playerName"]);
    expect(after.declined).toEqual([]);
    expect(nextMissingField(after)).toBe("handicap");
  });

  it("keeps asking after a declined concern-level field is still missing", () => {
    const draft = declineConcernFields(
      mergeConcernDraft(emptyConcernDraft(), { concerns: ["score"] }),
      ["playerName"],
    );
    expect(nextMissingField(draft)).toBe("holeNo");
  });
});

describe("the payload the contract validates", () => {
  it("passes normaliseConcern once the required fields are there", () => {
    const draft = mergeConcernDraft(emptyConcernDraft(), {
      concerns: ["score", "tee_off"],
      holeNo: 7,
      teeColour: "white",
      playerName: "Juan",
      handicap: "12.4",
      schedule: "Day 2, 7:12 AM",
    });
    const checked = normaliseConcern(toConcernPayload(draft));
    expect(checked.ok).toBe(true);
    if (checked.ok) {
      expect(checked.details).toMatchObject({
        concerns: ["score", "tee_off"],
        holeNo: 7,
        teeColour: "white",
        playerName: "Juan",
        source: "chat",
      });
    }
  });

  it("does not export a follow-up value for a concern that is not ticked", () => {
    const draft = mergeConcernDraft(emptyConcernDraft(), { concerns: ["inquiry"], holeNo: 7 });
    expect(toConcernPayload(draft)).not.toHaveProperty("holeNo");
  });
});

describe("the summary card", () => {
  it("shows only what the player gave, in their language", () => {
    const draft = mergeConcernDraft(emptyConcernDraft(), {
      concerns: ["score", "tee_off"],
      holeNo: 7,
      teeColour: "white",
      playerName: "Juan",
    });
    const rows = summariseForPlayer(draft, "tl");
    expect(rows.map((row) => row.label)).toEqual(["Concern", "Hole", "Tee", "Pangalan"]);
    expect(rows[0]?.value).toBe("Iskor, Tee off");
    expect(rows[2]?.value).toBe("Puti");
  });

  it("leaves out an optional field that was declined", () => {
    const draft = declineConcernFields(
      mergeConcernDraft(emptyConcernDraft(), { concerns: ["inquiry"] }),
      ["handicap"],
    );
    const rows = summariseForPlayer(draft, "en");
    expect(rows.map((row) => row.field)).toEqual(["concerns"]);
  });
});
