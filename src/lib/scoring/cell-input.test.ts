import { describe, expect, it } from "vitest";
import { normalizeCellInput } from "./cell-input";

describe("normalizeCellInput", () => {
  it("keeps a whole score of one or two digits", () => {
    expect(normalizeCellInput("4")).toBe("4");
    expect(normalizeCellInput("12")).toBe("12");
  });

  it("turns a single x or X into an X, with surrounding spaces ignored", () => {
    expect(normalizeCellInput("x")).toBe("X");
    expect(normalizeCellInput(" X ")).toBe("X");
  });

  it("keeps the longest valid prefix and drops the rest", () => {
    expect(normalizeCellInput("XX")).toBe("X");
    expect(normalizeCellInput("4x")).toBe("4");
    expect(normalizeCellInput("x4")).toBe("X");
  });

  it("keeps an empty cell empty and clears text that is not a score", () => {
    expect(normalizeCellInput("")).toBe("");
    expect(normalizeCellInput("abc")).toBe("");
  });

  it("keeps a lone zero for the engine to reject", () => {
    expect(normalizeCellInput("0")).toBe("0");
  });
});
