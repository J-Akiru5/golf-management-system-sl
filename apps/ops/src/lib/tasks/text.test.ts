import { describe, expect, it } from "vitest";
import { cleanBody, cleanText, cleanTitle, COMMENT_MAX_LENGTH } from "./text";

describe("cleanText", () => {
  it("turns an empty or missing value into null", () => {
    expect(cleanText(null)).toBeNull();
    expect(cleanText(undefined)).toBeNull();
    expect(cleanText("   ")).toBeNull();
  });

  it("trims what is there", () => {
    expect(cleanText("  A note  ")).toBe("A note");
  });
});

describe("cleanTitle", () => {
  it("trims the title", () => {
    expect(cleanTitle("  Check the tee sheet ")).toBe("Check the tee sheet");
  });

  it("refuses an empty title", () => {
    expect(() => cleanTitle("   ")).toThrow(/needs a title/);
  });
});

describe("cleanBody", () => {
  it("trims the body and keeps the limit", () => {
    expect(cleanBody("  Hello  ")).toBe("Hello");
    expect(cleanBody("a".repeat(COMMENT_MAX_LENGTH))).toHaveLength(COMMENT_MAX_LENGTH);
    expect(() => cleanBody("a".repeat(COMMENT_MAX_LENGTH + 1))).toThrow(/at most 4000/);
  });

  it("refuses an empty comment", () => {
    expect(() => cleanBody("  ")).toThrow(/needs some words/);
  });
});
