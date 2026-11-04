import { describe, expect, it } from "vitest";
import { percent, READER_ACCURACY, readerAccuracyLine } from "./accuracy";

describe("percent", () => {
  it("shows one decimal place", () => {
    expect(percent(0.8657)).toBe("86.6%");
    expect(percent(0.8372)).toBe("83.7%");
    expect(percent(1)).toBe("100.0%");
    expect(percent(0)).toBe("0.0%");
  });
});

describe("READER_ACCURACY", () => {
  it("holds its figures as fractions of one", () => {
    expect(READER_ACCURACY.model).not.toBe("");
    expect(READER_ACCURACY.cells).toBeGreaterThan(0);
    for (const value of [READER_ACCURACY.validation, READER_ACCURACY.test]) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe("readerAccuracyLine", () => {
  it("states both figures and nothing else", () => {
    const line = readerAccuracyLine();
    expect(line).toContain(percent(READER_ACCURACY.validation));
    expect(line).toContain(percent(READER_ACCURACY.test));
    expect(line.startsWith("Reader accuracy ")).toBe(true);
    expect(line.endsWith("of test cells.")).toBe(true);
  });
});
