import { describe, expect, it } from "vitest";
import { buildCardContext, type CardContextInput } from "./card-context";

const full: CardContextInput = {
  dayNumber: 2,
  markerName: "Ana Cruz",
  playingHandicap: 14,
  cardHandicap: 14,
  className: "Class A",
  partnerName: "Ben Reyes",
  teamHandicap: 16.5,
  teeName: "Blue",
  groupLabel: "Group 4",
};

function keys(input: CardContextInput): string[] {
  return buildCardContext(input).map((part) => part.key);
}

function part(input: CardContextInput, key: string) {
  return buildCardContext(input).find((entry) => entry.key === key);
}

describe("buildCardContext", () => {
  it("keeps the fixed order: day, marker, class, partner, team handicap, tee, group, then handicaps", () => {
    expect(keys(full)).toEqual([
      "day",
      "marker",
      "class",
      "partner",
      "teamHandicap",
      "tee",
      "group",
      "playingHandicap",
    ]);
  });

  it("leaves out an absent day, marker, team handicap, tee and group", () => {
    expect(keys({ playingHandicap: 12 })).toEqual(["playingHandicap"]);
    expect(keys({ ...full, dayNumber: null })).not.toContain("day");
    expect(keys({ ...full, markerName: null })).not.toContain("marker");
    expect(keys({ ...full, teamHandicap: null })).not.toContain("teamHandicap");
    expect(keys({ ...full, teeName: null })).not.toContain("tee");
    expect(keys({ ...full, groupLabel: undefined })).not.toContain("group");
  });

  it("leaves out a class, partner or playing handicap the caller does not have", () => {
    expect(keys({ dayNumber: 2 })).toEqual(["day"]);
    expect(part({ className: undefined }, "class")).toBeUndefined();
    expect(part({ partnerName: undefined }, "partner")).toBeUndefined();
    expect(part({ playingHandicap: undefined }, "playingHandicap")).toBeUndefined();
  });

  it("shows a missing class, partner and playing handicap in words", () => {
    expect(part({ className: null }, "class")).toEqual({
      key: "class",
      label: "Class",
      value: "Not set",
      tone: "missing",
    });
    expect(part({ partnerName: null }, "partner")).toEqual({
      key: "partner",
      label: "Partner",
      value: "None on file",
      tone: "missing",
    });
    expect(part({ playingHandicap: null }, "playingHandicap")).toEqual({
      key: "playingHandicap",
      label: "Playing handicap",
      value: "Not calculated",
      tone: "missing",
    });
  });

  it("drops a leading 'Class' word from the class value, because the part is already labelled", () => {
    expect(part({ className: "Class A" }, "class")).toEqual({
      key: "class",
      label: "Class",
      value: "A",
      tone: "normal",
    });
    expect(part({ className: "class b" }, "class")?.value).toBe("b");
    expect(part({ className: "CLASS C" }, "class")?.value).toBe("C");
    expect(part({ className: "  Class D  " }, "class")?.value).toBe("D");
  });

  it("keeps a class name that does not start with the word 'Class' as passed", () => {
    expect(part({ className: "Classic" }, "class")?.value).toBe("Classic");
    expect(part({ className: "Gold" }, "class")?.value).toBe("Gold");
    expect(part({ className: "A" }, "class")?.value).toBe("A");
  });

  it("says 'Not set' for a class only when the caller passed nothing there", () => {
    expect(part({ className: null }, "class")?.value).toBe("Not set");
    expect(part({ className: "" }, "class")?.value).toBe("Not set");
    expect(part({ className: "   " }, "class")?.value).toBe("Not set");
    expect(part({ className: "Class A" }, "class")?.value).not.toBe("Not set");
  });

  it("shows Card HDCP only when it differs from the playing handicap", () => {
    expect(keys({ playingHandicap: 14, cardHandicap: 14 })).not.toContain("cardHandicap");
    expect(part({ playingHandicap: 14, cardHandicap: 16 }, "cardHandicap")).toEqual({
      key: "cardHandicap",
      label: "Card HDCP",
      value: "16",
      tone: "normal",
    });
  });

  it("shows Card HDCP when there is no playing handicap to compare with", () => {
    expect(part({ cardHandicap: 16 }, "cardHandicap")?.value).toBe("16");
  });

  it("prints whole numbers as written and other numbers with one decimal", () => {
    expect(part({ teamHandicap: 12 }, "teamHandicap")?.value).toBe("12");
    expect(part({ teamHandicap: 12.5 }, "teamHandicap")?.value).toBe("12.5");
    expect(part({ playingHandicap: 12.25 }, "playingHandicap")?.value).toBe("12.3");
    expect(part({ playingHandicap: -2 }, "playingHandicap")?.value).toBe("+2");
  });

  it("returns nothing for an empty input, because nothing was passed", () => {
    expect(buildCardContext({})).toEqual([]);
  });

  it("treats blank strings as missing", () => {
    expect(
      keys({ className: "   ", partnerName: "", markerName: " ", teeName: "", groupLabel: "\t" }),
    ).toEqual(["class", "partner"]);
    expect(part({ className: "" }, "class")?.tone).toBe("missing");
    expect(part({ partnerName: "  " }, "partner")?.value).toBe("None on file");
  });

  it("does not change the input", () => {
    const input: CardContextInput = Object.freeze({ ...full });
    const copy = { ...input };
    buildCardContext(input);
    expect(input).toEqual(copy);
  });
});
