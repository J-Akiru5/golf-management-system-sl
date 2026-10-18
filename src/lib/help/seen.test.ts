import { describe, expect, it } from "vitest";
import { HELP_SEEN_STORAGE_KEY, mergeSeen, parseSeen, welcomeId } from "./seen";

describe("parseSeen", () => {
  it("reads a stored list", () => {
    expect(parseSeen('["welcome.desk"]')).toEqual(["welcome.desk"]);
    expect(parseSeen("[]")).toEqual([]);
  });

  it("treats anything else as nothing seen, rather than throwing", () => {
    for (const bad of [null, undefined, "", "not json", '{"a":1}', "[1,2]", '["",null]']) {
      expect(parseSeen(bad), String(bad)).toEqual([]);
    }
  });
});

describe("mergeSeen", () => {
  it("merges the browser's record and the database's without duplicates", () => {
    expect(mergeSeen(["welcome.desk"], ["welcome.player", "welcome.desk"])).toEqual([
      "welcome.desk",
      "welcome.player",
    ]);
  });

  it("is empty when nothing has been seen", () => {
    expect(mergeSeen([], [])).toEqual([]);
  });
});

describe("the storage key", () => {
  it("is namespaced, so it cannot collide with another site on the same origin", () => {
    expect(HELP_SEEN_STORAGE_KEY).toBe("teeline-help-seen");
  });

  it("names one welcome per audience", () => {
    expect(welcomeId("desk")).toBe("welcome.desk");
    expect(welcomeId("player")).toBe("welcome.player");
  });
});
