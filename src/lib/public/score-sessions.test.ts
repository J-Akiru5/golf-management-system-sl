import { describe, expect, it } from "vitest";
import {
  buildScoreSessions,
  buildScoreStarts,
  type ScorePairingGroup,
  scoreSessionKey,
} from "./score-sessions";

const group = (
  dayNumber: number | null,
  playDate: string | null,
  time: string,
  playerIds: Array<string | null>,
): ScorePairingGroup => ({
  time,
  dayNumber,
  playDate,
  playerIds: playerIds.map((id) => id ?? ""),
});

describe("score sessions", () => {
  it("reads the morning and the afternoon from the group's start time", () => {
    const sessions = buildScoreSessions([
      group(1, "2026-11-13", "06:30", ["p1"]),
      group(1, "2026-11-13", "12:30", ["p2"]),
    ]);
    expect(sessions[scoreSessionKey("p1", "2026-11-13")]).toBe("AM");
    expect(sessions[scoreSessionKey("p2", "2026-11-13")]).toBe("PM");
  });

  it("reads the last day's 11:30 start as the afternoon, like the pairings page", () => {
    const sessions = buildScoreSessions([
      group(1, "2026-11-13", "06:30", ["p1"]),
      group(2, "2026-11-14", "06:30", ["p2"]),
      group(3, "2026-11-15", "06:30", ["p3"]),
      group(3, "2026-11-15", "11:30", ["p4"]),
    ]);
    expect(sessions[scoreSessionKey("p3", "2026-11-15")]).toBe("AM");
    expect(sessions[scoreSessionKey("p4", "2026-11-15")]).toBe("PM");
  });

  it("keys by player and date, so the same player is not reused on another day", () => {
    const sessions = buildScoreSessions([
      group(1, "2026-11-13", "06:30", ["p1"]),
      group(2, "2026-11-14", "12:30", ["p1"]),
    ]);
    expect(sessions[scoreSessionKey("p1", "2026-11-13")]).toBe("AM");
    expect(sessions[scoreSessionKey("p1", "2026-11-14")]).toBe("PM");
  });

  it("skips a player without a public id and a day without a date", () => {
    const sessions = buildScoreSessions([
      group(1, "2026-11-13", "06:30", [null]),
      group(2, "", "06:30", ["p1"]),
    ]);
    expect(Object.keys(sessions)).toHaveLength(0);
  });

  it("treats a group on a snapshot without days as the first day", () => {
    const sessions = buildScoreSessions([group(null, null, "06:30", ["p1"])]);
    expect(Object.keys(sessions)).toHaveLength(0);
  });
});

describe("score starts", () => {
  it("keeps each player's tee time and starting hole for the day", () => {
    const starts = buildScoreStarts([
      { ...group(2, "2026-11-14", "06:30", ["p1", "p2"]), startHole: 7 },
      { ...group(2, "2026-11-14", "12:40", ["p3"]), startHole: 12 },
    ]);

    expect(starts[scoreSessionKey("p1", "2026-11-14")]).toEqual({ time: "06:30", hole: 7 });
    expect(starts[scoreSessionKey("p3", "2026-11-14")]).toEqual({ time: "12:40", hole: 12 });
  });

  it("trims a stored seconds field and leaves a missing hole null", () => {
    const starts = buildScoreStarts([group(1, "2026-11-13", "06:30:00", ["p1"])]);

    expect(starts[scoreSessionKey("p1", "2026-11-13")]).toEqual({ time: "06:30", hole: null });
  });

  it("skips a group without a time, and a snapshot with no dated day", () => {
    const noTime = buildScoreStarts([group(1, "2026-11-13", "", ["p1"])]);
    expect(Object.keys(noTime)).toHaveLength(0);

    const noDate = buildScoreStarts([group(null, null, "06:30", ["p2"])]);
    expect(Object.keys(noDate)).toHaveLength(0);
  });
});
