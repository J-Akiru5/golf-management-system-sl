import { describe, expect, it } from "vitest";
import { teeAssignmentProblem, waveStartTimes } from "./tee-time";

const base = { courseHoles: 18, confirmed: false };

describe("teeAssignmentProblem", () => {
  it("accepts a complete unconfirmed assignment", () => {
    expect(teeAssignmentProblem({ ...base, teeTime: "06:30", startHole: 1 })).toBeNull();
  });

  it("accepts clearing both fields", () => {
    expect(teeAssignmentProblem({ ...base, teeTime: null, startHole: null })).toBeNull();
  });

  it("accepts a wave time before the draw has assigned a hole", () => {
    // A shotgun wave starts everyone together; the hole comes from the draw later.
    expect(teeAssignmentProblem({ ...base, teeTime: "06:30", startHole: null })).toBeNull();
  });

  it("refuses a start hole with no tee time", () => {
    expect(teeAssignmentProblem({ ...base, teeTime: null, startHole: 1 })).toBe("both_or_neither");
  });

  it("refuses a hole outside the course", () => {
    expect(teeAssignmentProblem({ ...base, teeTime: "06:30", startHole: 19 })).toBe("hole_range");
    expect(teeAssignmentProblem({ ...base, teeTime: "06:30", startHole: 0 })).toBe("hole_range");
  });

  it("refuses a confirmed assignment with no fields", () => {
    expect(teeAssignmentProblem({ ...base, teeTime: null, startHole: null, confirmed: true })).toBe(
      "confirmed_needs_both",
    );
  });

  it("refuses a confirmed time with no hole", () => {
    expect(
      teeAssignmentProblem({ ...base, teeTime: "06:30", startHole: null, confirmed: true }),
    ).toBe("confirmed_needs_both");
  });
});

describe("waveStartTimes", () => {
  it("lists wave A at the first tee and each later wave one gap after", () => {
    expect(waveStartTimes("06:30", 360)).toEqual([
      { wave: "A", time: "06:30" },
      { wave: "B", time: "12:30" },
      { wave: "C", time: "18:30" },
    ]);
  });

  it("honours the requested count", () => {
    expect(waveStartTimes("07:00", 300, 1)).toEqual([{ wave: "A", time: "07:00" }]);
    expect(waveStartTimes("07:00", 300, 0)).toHaveLength(1);
  });

  it("wraps past midnight rather than producing an invalid time", () => {
    expect(waveStartTimes("20:00", 360, 2)).toEqual([
      { wave: "A", time: "20:00" },
      { wave: "B", time: "02:00" },
    ]);
  });

  it("treats a nonsense gap as no gap", () => {
    expect(waveStartTimes("06:30", Number.NaN, 2).map((wave) => wave.time)).toEqual([
      "06:30",
      "06:30",
    ]);
  });
});
