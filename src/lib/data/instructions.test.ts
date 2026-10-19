import { describe, expect, it } from "vitest";
import { instructionText } from "./instructions";

describe("instructionText", () => {
  it("returns null for nothing set", () => {
    expect(instructionText(null)).toBeNull();
    expect(instructionText(undefined)).toBeNull();
    expect(instructionText("")).toBeNull();
  });

  it("treats a field holding only spaces or blank lines as empty", () => {
    expect(instructionText("   ")).toBeNull();
    expect(instructionText("\n\n")).toBeNull();
    expect(instructionText(" \r\n \t ")).toBeNull();
  });

  it("keeps the organizer's own words, trimmed at the edges", () => {
    expect(instructionText("  Register at the pro shop.  ")).toBe("Register at the pro shop.");
  });

  it("keeps line breaks, because the organizer writes steps", () => {
    expect(instructionText("Pay at the desk\nCollect a scorecard")).toBe(
      "Pay at the desk\nCollect a scorecard",
    );
  });

  it("preserves a deliberate blank line between paragraphs", () => {
    expect(instructionText("First day\n\nSecond day")).toBe("First day\n\nSecond day");
  });

  it("normalises Windows line endings so one screen does not render differently", () => {
    expect(instructionText("Line one\r\nLine two")).toBe("Line one\nLine two");
    expect(instructionText("Line one\rLine two")).toBe("Line one\nLine two");
  });
});
