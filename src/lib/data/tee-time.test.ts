import { describe, expect, it } from "vitest";
import {
  dayWaveStartTimes,
  sessionWaveTime,
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
  it("puts wave B one interval after wave A", () => {
    expect(dayWaveStartTimes({ startTime: null }, "06:30", 15)).toEqual([
      { wave: "A", time: "06:30" },
      { wave: "B", time: "06:45" },
    ]);
  });

  it("starts at the day's own time and keeps the event's interval", () => {
    expect(dayWaveStartTimes({ startTime: "07:00" }, "06:30", 20)).toEqual([
      { wave: "A", time: "07:00" },
      { wave: "B", time: "07:20" },
    ]);
  });

  it("reads the interval on every day instead of the day's session times", () => {
    // The last day no longer borrows the 11:30 afternoon: the interval is the only step.
    expect(dayWaveStartTimes({ startTime: null }, "06:30", 60).map((wave) => wave.time)).toEqual([
      "06:30",
      "07:30",
    ]);
  });

  it("cuts a larger count to the two waves the club plays", () => {
    expect(dayWaveStartTimes({ startTime: null }, "06:30", 15, 3).map((w) => w.wave)).toEqual([
      "A",
      "B",
    ]);
    expect(dayWaveStartTimes({ startTime: null }, "06:30", 15, 9)).toEqual([
      { wave: "A", time: "06:30" },
      { wave: "B", time: "06:45" },
    ]);
  });
});

describe("sessionWaveTime", () => {
  const base = {
    day: { startTime: null },
    dayCount: 4,
    firstTeeTime: "06:30",
    intervalMinutes: 15,
  };

  it("puts wave A at the session's own start", () => {
    expect(sessionWaveTime({ ...base, session: "AM", wave: "A", dayIndex: 2 })).toBe("06:30");
    expect(sessionWaveTime({ ...base, session: "PM", wave: "A", dayIndex: 2 })).toBe("12:30");
  });

  it("moves each later wave one interval later, in whichever session the player plays", () => {
    expect(sessionWaveTime({ ...base, session: "AM", wave: "B", dayIndex: 2 })).toBe("06:45");
    expect(sessionWaveTime({ ...base, session: "PM", wave: "B", dayIndex: 2 })).toBe("12:45");
  });

  it("keeps the last day's afternoon at 11:30", () => {
    expect(sessionWaveTime({ ...base, session: "PM", wave: "A", dayIndex: 3 })).toBe("11:30");
    expect(sessionWaveTime({ ...base, session: "PM", wave: "B", dayIndex: 3 })).toBe("11:45");
  });

  it("starts the morning at the day's own start time when it has one", () => {
    expect(
      sessionWaveTime({
        ...base,
        session: "AM",
        wave: "A",
        dayIndex: 1,
        day: { startTime: "07:00" },
      }),
    ).toBe("07:00");
  });

  it("reads a missing session as the morning and a missing wave as the first", () => {
    expect(sessionWaveTime({ ...base, session: null, wave: null, dayIndex: 0 })).toBe("06:30");
  });

  it("treats an unreadable wave as the first, never as a later one", () => {
    expect(sessionWaveTime({ ...base, session: "AM", wave: "?", dayIndex: 0 })).toBe("06:30");
  });
});

describe("waveStartTimes", () => {
  it("lists wave A at the first tee and wave B one interval after", () => {
    expect(waveStartTimes("06:30", 15)).toEqual([
      { wave: "A", time: "06:30" },
      { wave: "B", time: "06:45" },
    ]);
  });

  it("honours the requested count", () => {
    expect(waveStartTimes("07:00", 15, 1)).toEqual([{ wave: "A", time: "07:00" }]);
    expect(waveStartTimes("07:00", 15, 0)).toHaveLength(1);
  });

  it("never offers a third wave, whatever count it is asked for", () => {
    expect(waveStartTimes("06:30", 15, 6).map((wave) => wave.wave)).toEqual(["A", "B"]);
  });

  it("wraps past midnight rather than producing an invalid time", () => {
    expect(waveStartTimes("23:50", 15, 2)).toEqual([
      { wave: "A", time: "23:50" },
      { wave: "B", time: "00:05" },
    ]);
  });

  it("treats a nonsense interval as no gap", () => {
    expect(waveStartTimes("06:30", Number.NaN, 2).map((wave) => wave.time)).toEqual([
      "06:30",
      "06:30",
    ]);
  });
});
