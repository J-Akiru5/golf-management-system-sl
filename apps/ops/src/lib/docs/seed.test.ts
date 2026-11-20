import { describe, expect, it } from "vitest";
import { decideSeed, parseSeedContent } from "./seed";

describe("decideSeed", () => {
  const base = { demo: false, hasSeed: true, stateExists: false, contentEmpty: true };

  it("seeds a live document that has no state row and no content yet", () => {
    expect(decideSeed(base)).toEqual({ seed: true });
  });

  it("does not seed when there is nothing to import", () => {
    expect(decideSeed({ ...base, hasSeed: false })).toEqual({ seed: false, reason: "no_seed" });
  });

  it("never overwrites a document that already has state", () => {
    expect(decideSeed({ ...base, stateExists: true })).toEqual({
      seed: false,
      reason: "state_exists",
    });
  });

  it("does not touch a document that already has content", () => {
    expect(decideSeed({ ...base, contentEmpty: false })).toEqual({
      seed: false,
      reason: "not_empty",
    });
  });

  it("ignores the state row in demo mode, where there is no database", () => {
    expect(decideSeed({ ...base, demo: true, stateExists: true })).toEqual({ seed: true });
  });
});

describe("parseSeedContent", () => {
  it("accepts a Tiptap document", () => {
    expect(parseSeedContent('{"type":"doc","content":[]}')).toEqual({
      type: "doc",
      content: [],
    });
  });

  it("rejects broken JSON and other shapes", () => {
    expect(parseSeedContent("{")).toBeNull();
    expect(parseSeedContent('"doc"')).toBeNull();
    expect(parseSeedContent('{"type":"paragraph"}')).toBeNull();
    expect(parseSeedContent('{"type":"doc"}')).toBeNull();
  });
});
