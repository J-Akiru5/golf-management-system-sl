import { describe, expect, it } from "vitest";
import { waveGapBetween } from "./tee-time";

describe("waveGapBetween", () => {
  it("measures the gap between the two wave times", () => {
    expect(waveGapBetween("06:30", "11:30")).toBe(300);
    expect(waveGapBetween("07:00", "12:00")).toBe(300);
    expect(waveGapBetween("06:30", "12:30")).toBe(360);
  });

  it("reads an unpadded hour as the same time", () => {
    expect(waveGapBetween("6:30", "11:30")).toBe(300);
  });

  it("reads a second wave earlier on the clock as the next morning", () => {
    expect(waveGapBetween("06:30", "00:30")).toBe(1080);
    expect(waveGapBetween("23:30", "06:30")).toBe(420);
  });

  it("refuses a second wave that starts with the first", () => {
    expect(waveGapBetween("06:30", "06:30")).toBeNull();
  });

  it("refuses a value that is not a time of day", () => {
    expect(waveGapBetween("", "11:30")).toBeNull();
    expect(waveGapBetween("06:30", "")).toBeNull();
    expect(waveGapBetween("06:30", "25:00")).toBeNull();
    expect(waveGapBetween("06:30", "11:75")).toBeNull();
    expect(waveGapBetween("06:30", "half past eleven")).toBeNull();
  });
});
