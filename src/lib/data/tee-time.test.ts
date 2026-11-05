import { describe, expect, it } from "vitest";
import {
  dayWaveStartTimes,
  teeAssignmentProblem,
  waveCountForField,
  wavePosition,
  waveProblem,
  waveStartTimes,
} from "./tee-time";

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

describe("wavePosition", () => {
  it("counts waves from A", () => {
    expect(wavePosition("A")).toBe(1);
    expect(wavePosition("b")).toBe(2);
    expect(wavePosition(" D ")).toBe(4);
  });

  it("returns null for something that is not a wave", () => {
    expect(wavePosition(null)).toBeNull();
    expect(wavePosition("")).toBeNull();
    expect(wavePosition("AA")).toBeNull();
    expect(wavePosition("1")).toBeNull();
  });
});

describe("waveProblem", () => {
  it("accepts one letter in either case", () => {
    expect(waveProblem(null)).toBeNull();
    expect(waveProblem("A")).toBeNull();
    expect(waveProblem("c")).toBeNull();
  });

  it("refuses anything longer than one letter", () => {
    expect(waveProblem("AB")).toBe("wave_format");
    expect(waveProblem("wave 2")).toBe("wave_format");
  });
});

describe("waveCountForField", () => {
  it("fills one hole with one group before a second wave is needed", () => {
    expect(waveCountForField(72, 18, 4)).toBe(1);
    expect(waveCountForField(73, 18, 4)).toBe(2);
  });

  it("follows the event's own group size and hole count", () => {
    expect(waveCountForField(40, 18, 2)).toBe(2);
    expect(waveCountForField(40, 9, 4)).toBe(2);
  });

  it("never reports fewer than one wave", () => {
    expect(waveCountForField(0, 18, 4)).toBe(1);
    expect(waveCountForField(Number.NaN, 0, 0)).toBe(1);
  });

  it("never asks for more than the club's two waves", () => {
    // 384 players would be six waves at one group on every hole. This club plays A and B only.
    expect(waveCountForField(384, 18, 4)).toBe(2);
    expect(waveCountForField(288, 18, 2)).toBe(2);
    expect(waveCountForField(1000, 18, 4)).toBe(2);
  });
});

describe("dayWaveStartTimes", () => {
  it("gives a day with a small field its AM and PM waves anyway", () => {
    expect(dayWaveStartTimes({ startTime: null }, 1, 4, "06:30", 360)).toEqual([
      { wave: "A", time: "06:30" },
      { wave: "B", time: "12:30" },
    ]);
  });

  it("starts at the day's own time and keeps the last day's earlier afternoon", () => {
    expect(dayWaveStartTimes({ startTime: "07:00" }, 3, 4, "06:30", 360)).toEqual([
      { wave: "A", time: "07:00" },
      { wave: "B", time: "12:00" },
    ]);
  });

  it("cuts a larger count to the two waves the club plays", () => {
    expect(
      dayWaveStartTimes({ startTime: null }, 0, 4, "06:30", 360, 3).map((w) => w.wave),
    ).toEqual(["A", "B"]);
    expect(dayWaveStartTimes({ startTime: null }, 0, 4, "06:30", 360, 9)).toEqual([
      { wave: "A", time: "06:30" },
      { wave: "B", time: "12:30" },
    ]);
  });
});

describe("waveStartTimes", () => {
  it("lists wave A at the first tee and wave B one gap after", () => {
    expect(waveStartTimes("06:30", 360)).toEqual([
      { wave: "A", time: "06:30" },
      { wave: "B", time: "12:30" },
    ]);
  });

  it("honours the requested count", () => {
    expect(waveStartTimes("07:00", 300, 1)).toEqual([{ wave: "A", time: "07:00" }]);
    expect(waveStartTimes("07:00", 300, 0)).toHaveLength(1);
  });

  it("never offers a third wave, whatever count it is asked for", () => {
    expect(waveStartTimes("06:30", 360, 6).map((wave) => wave.wave)).toEqual(["A", "B"]);
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
