import { describe, expect, it } from "vitest";
import { flightName, flightOfLabel, sessionOfLabel, waveHeading } from "./labels";

describe("board wording", () => {
  it("reads the wave and flight out of a stored group label", () => {
    expect(sessionOfLabel("D3-AM-A")).toBe("AM");
    expect(flightOfLabel("D3-AM-A")).toBe("A");
    expect(sessionOfLabel("D1-PM-B")).toBe("PM");
    expect(flightOfLabel("D1-PM-B")).toBe("B");
  });

  it("calls the morning Wave A and the afternoon Wave B", () => {
    expect(waveHeading("D3-AM-A")).toBe("Wave A · Morning");
    expect(waveHeading("D3-PM-A")).toBe("Wave B · Afternoon");
  });

  it("calls the start batch a flight", () => {
    expect(flightName("D3-AM-C")).toBe("Flight C");
    expect(flightName(null)).toBe("Flight");
  });

  it("falls back to a bare wave when the label names no session", () => {
    expect(sessionOfLabel("A")).toBeNull();
    expect(waveHeading(null)).toBe("Wave");
  });
});
