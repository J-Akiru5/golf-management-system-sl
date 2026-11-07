import { describe, expect, it } from "vitest";
import { pickRoundForDay } from "./load-desk-state";

// A three-day event has one round per playing day. The desk used to fall back to the first round, so
// asking for day 3 showed day 1's board (audit finding A1, GitHub #174).
const ROUNDS = [
  { id: "round-1", day_number: 1 },
  { id: "round-2", day_number: 2 },
  { id: "round-3", day_number: 3 },
];

describe("pickRoundForDay", () => {
  it("returns the round of the day that was asked for", () => {
    expect(pickRoundForDay(ROUNDS, 1)?.id).toBe("round-1");
    expect(pickRoundForDay(ROUNDS, 2)?.id).toBe("round-2");
    expect(pickRoundForDay(ROUNDS, 3)?.id).toBe("round-3");
  });

  it("returns null for a day the event has no round for", () => {
    // loadDeskState throws on this null instead of showing day 1 for day 3.
    expect(pickRoundForDay([{ id: "round-1", day_number: 1 }], 3)).toBeNull();
  });

  it("returns the first round when no day is asked for", () => {
    expect(pickRoundForDay(ROUNDS, null)?.id).toBe("round-1");
    expect(pickRoundForDay([], null)).toBeNull();
  });
});
