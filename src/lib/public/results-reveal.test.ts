import { describe, expect, it } from "vitest";
import {
  BLACKOUT_SURFACES,
  blackoutFlags,
  blackoutHeld,
  formatCountdown,
  heldLanes,
  LANES_KEY,
  type LaneReveal,
  laneIsHeld,
  laneLabel,
  lanePhase,
  laneRemainingMs,
  laneSecondsRemaining,
  laneSignature,
  mergeLaneReveal,
  mergeRevealKey,
  parseLaneRevealMap,
  parseLaneState,
  parseRevealAt,
  parseRevealPoll,
  REVEAL_LANES,
  revealAtFromSeconds,
  revealIsDue,
  revealPhase,
  revealPollBaseMs,
  revealRemainingMs,
  revealSeconds,
  revealSignature,
  storedLaneReveal,
  storedRevealAt,
} from "./results-reveal";

describe("the blackout surfaces", () => {
  it("holds exactly the results and the player list", () => {
    expect([...BLACKOUT_SURFACES]).toEqual(["leaderboard", "roster"]);
  });

  it("is held when either key is off, and released only when both are on", () => {
    const released = { leaderboard: true, roster: true };
    expect(blackoutHeld(released)).toBe(false);
    expect(blackoutHeld({ leaderboard: false, roster: true })).toBe(true);
    expect(blackoutHeld({ leaderboard: true, roster: false })).toBe(true);
    expect(blackoutHeld({ leaderboard: false, roster: false })).toBe(true);
  });

  it("gates one page on the surface that page shows", () => {
    const state = { leaderboard: false, roster: true };
    expect(blackoutHeld(state, ["leaderboard"])).toBe(true);
    expect(blackoutHeld(state, ["roster"])).toBe(false);
  });

  it("never freezes a surface when the release state is unknown", () => {
    // An older database or a failed read is not a reason to hide a live page.
    expect(blackoutHeld(null)).toBe(false);
    expect(blackoutHeld(undefined)).toBe(false);
    expect(blackoutFlags(null)).toEqual({ leaderboard: false, roster: false });
  });
});

describe("the reveal time", () => {
  const at = "2026-11-15T06:00:15.000Z";

  it("is what the organizer's clock says plus the chosen seconds", () => {
    expect(revealAtFromSeconds(15, Date.parse("2026-11-15T06:00:00.000Z"))).toBe(at);
  });

  it("keeps the input between 1 and 600 seconds", () => {
    expect(revealSeconds("15")).toBe(15);
    expect(revealSeconds(0)).toBe(1);
    expect(revealSeconds(-30)).toBe(1);
    expect(revealSeconds(9999)).toBe(600);
    expect(revealSeconds("12.6")).toBe(13);
    // A cleared box is the documented default, not an immediate reveal.
    expect(revealSeconds("")).toBe(15);
    expect(revealSeconds("abc")).toBe(15);
    expect(revealSeconds(null)).toBe(15);
  });

  it("is due at the deadline and after it, never before", () => {
    expect(revealIsDue(at, Date.parse(at) - 1)).toBe(false);
    expect(revealIsDue(at, Date.parse(at))).toBe(true);
    expect(revealIsDue(at, Date.parse(at) + 60_000)).toBe(true);
    expect(revealIsDue(null, Date.now())).toBe(false);
    expect(revealIsDue("not a time", Date.now())).toBe(false);
  });

  it("reads the key inside publish_views and ignores anything unusable", () => {
    expect(storedRevealAt({ resultsRevealAt: at })).toBe(at);
    expect(storedRevealAt({ resultsRevealAt: "soon" })).toBeNull();
    expect(storedRevealAt({ leaderboard: true })).toBeNull();
    expect(storedRevealAt(null)).toBeNull();
    expect(parseRevealAt(17)).toBeNull();
  });

  it("writes the key without touching the release keys or unknown keys", () => {
    const before = { leaderboard: false, roster: false, advisory: true };
    const withTime = mergeRevealKey(before, at);
    expect(withTime).toEqual({
      leaderboard: false,
      roster: false,
      advisory: true,
      resultsRevealAt: at,
    });
    // The release flags the desk set are not ours to change.
    expect(withTime.leaderboard).toBe(false);
    expect(withTime.roster).toBe(false);

    const cleared = mergeRevealKey(withTime, null);
    expect(cleared).toEqual({ leaderboard: false, roster: false, advisory: true });
    expect("resultsRevealAt" in cleared).toBe(false);

    expect(mergeRevealKey(null, at)).toEqual({ resultsRevealAt: at });
    expect(mergeRevealKey("broken", at)).toEqual({ resultsRevealAt: at });
  });
});

describe("the countdown", () => {
  const revealAt = "2026-11-15T14:00:15.000Z";
  const serverNow = "2026-11-15T14:00:00.000Z";

  it("counts down from the server clock while the clock is counting", () => {
    const remaining = revealRemainingMs({
      revealAt,
      serverNow,
      receivedAt: 100_000,
      now: 103_000,
    });
    expect(remaining).toBe(12_000);
    expect(revealPhase({ held: true, remainingMs: remaining })).toBe("counting");
  });

  it("ignores a device clock that is minutes or hours wrong", () => {
    // receivedAt/now are this device's clock. A phone set two hours fast still sees 15 seconds,
    // because only the elapsed time is taken from it.
    const fast = revealRemainingMs({
      revealAt,
      serverNow,
      receivedAt: 7_200_000,
      now: 7_200_000,
    });
    expect(fast).toBe(15_000);

    const slow = revealRemainingMs({
      revealAt,
      serverNow,
      receivedAt: -7_200_000,
      now: -7_197_000,
    });
    expect(slow).toBe(12_000);
  });

  it("is a few seconds late rather than wrong when the render took a few seconds", () => {
    // A page rendered at 14:00:00 that arrives at 14:00:03 has spent three of its fifteen seconds.
    const arrived = revealRemainingMs({
      revealAt,
      serverNow,
      receivedAt: 30_000,
      now: 30_000,
    });
    expect(arrived).toBe(15_000);
    const threeSecondsLater = revealRemainingMs({
      revealAt,
      serverNow,
      receivedAt: 30_000,
      now: 33_000,
    });
    expect(threeSecondsLater).toBe(12_000);
  });

  it("reaches zero at the deadline and never counts below it", () => {
    const atDeadline = revealRemainingMs({
      revealAt,
      serverNow,
      receivedAt: 0,
      now: 15_000,
    });
    expect(atDeadline).toBe(0);
    const past = revealRemainingMs({
      revealAt,
      serverNow,
      receivedAt: 0,
      now: 90_000,
    });
    expect(past).toBe(0);
  });

  it("is null when there is no reveal time or no usable server time", () => {
    expect(revealRemainingMs({ revealAt: null, serverNow, receivedAt: 0, now: 0 })).toBeNull();
    expect(revealRemainingMs({ revealAt, serverNow: "soon", receivedAt: 0, now: 0 })).toBeNull();
  });

  it("prints whole seconds, rounding up so the last second is shown", () => {
    expect(formatCountdown(15_000)).toBe("0:15");
    expect(formatCountdown(14_200)).toBe("0:15");
    expect(formatCountdown(1)).toBe("0:01");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(65_000)).toBe("1:05");
    expect(formatCountdown(600_000)).toBe("10:00");
    expect(formatCountdown(null)).toBe("");
  });

  it("polls every two to three seconds near the end, and less often before that", () => {
    expect(revealPollBaseMs(29_000)).toBe(2_500);
    expect(revealPollBaseMs(0)).toBe(2_500);
    expect(revealPollBaseMs(31_000)).toBe(5_000);
    expect(revealPollBaseMs(null)).toBe(5_000);
  });
});

describe("the phase the page shows", () => {
  it("is revealed once the database has released the results", () => {
    expect(revealPhase({ held: false, remainingMs: null })).toBe("revealed");
    // A stale countdown must never outlive the release.
    expect(revealPhase({ held: false, remainingMs: 9_000 })).toBe("revealed");
  });

  it("is hidden with no reveal time and no countdown", () => {
    expect(revealPhase({ held: true, remainingMs: null })).toBe("hidden");
  });

  it("is due when the time has passed but the database still holds", () => {
    // The organizer closed the tab mid-countdown: the public stays dark, with no leak.
    expect(revealPhase({ held: true, remainingMs: 0 })).toBe("due");
  });

  it("is hidden again when a countdown is cancelled", () => {
    const held = true;
    expect(revealPhase({ held, remainingMs: 12_000 })).toBe("counting");
    // Cancel clears the stored reveal time; the page has nothing to count down to.
    expect(revealPhase({ held, remainingMs: null })).toBe("hidden");
  });
});

describe("the poll signature", () => {
  it("changes when a blackout key changes or a reveal time is set or cleared", () => {
    const released = { leaderboard: false, roster: false };
    const hidden = { leaderboard: true, roster: true };
    const at = "2026-11-15T14:00:15.000Z";

    expect(revealSignature(released, null)).toBe("00|-");
    expect(revealSignature(hidden, null)).toBe("11|-");
    expect(revealSignature(hidden, at)).toBe(`11|${at}`);
    // A timestamp written a few milliseconds apart is one hold, not two.
    expect(revealSignature(hidden, "2026-11-15T14:00:15+00:00")).toBe(`11|${at}`);
  });

  it("reads the poll's answer and treats a malformed one as no answer", () => {
    expect(
      parseRevealPoll({ held: { leaderboard: false, roster: false }, revealAt: null }),
    ).toEqual({
      held: { leaderboard: false, roster: false },
      revealAt: null,
      lanes: parseLaneRevealMap(null),
    });
    expect(
      parseRevealPoll({
        held: { leaderboard: true, roster: false },
        revealAt: "2026-11-15T14:00:15Z",
      })?.revealAt,
    ).toBe("2026-11-15T14:00:15.000Z");
    expect(parseRevealPoll({ held: { leaderboard: "no" }, revealAt: null })).toBeNull();
    expect(parseRevealPoll({ held: {}, revealAt: null })).toBeNull();
    expect(parseRevealPoll(null)).toBeNull();
  });
});

describe("the awarding lanes", () => {
  const at = "2026-11-15T14:00:15.000Z";
  const serverNow = "2026-11-15T14:00:00.000Z";
  const laneOf = (state: "held" | "released", releaseAt: string | null): LaneReveal => ({
    state,
    releaseAt,
    board: [],
  });

  it("names the six lanes in the order the desk shows them", () => {
    expect(REVEAL_LANES.map((lane) => lane.id)).toEqual([
      "classA",
      "classB",
      "classC",
      "classD",
      "netOverall",
      "grossOverall",
    ]);
    expect(REVEAL_LANES.map((lane) => lane.label)).toEqual([
      "Class A",
      "Class B",
      "Class C",
      "Class D",
      "Net overall",
      "Gross overall",
    ]);
    expect(laneLabel("classC")).toBe("Class C");
  });

  it("always answers all six lanes, so a missing one cannot read as a gap", () => {
    // The map is written lane by lane; this guards a lane added on one side only.
    const ids = Object.keys(parseLaneRevealMap(null)).sort();
    expect(ids).toEqual(REVEAL_LANES.map((lane) => lane.id).sort());
  });

  it("releases a lane it knows nothing about, and never guesses a time", () => {
    const lanes = parseLaneRevealMap(null);
    expect(lanes.classA).toEqual({ state: "released", releaseAt: null, board: [] });
    expect(heldLanes(lanes)).toEqual([]);

    // An older event row, a malformed lane and an unknown state are all released.
    expect(parseLaneRevealMap("broken").classB.state).toBe("released");
    expect(parseLaneRevealMap({ classB: "held" }).classB.state).toBe("released");
    expect(parseLaneRevealMap({ classB: { state: "paused" } }).classB.state).toBe("released");
    expect(parseLaneState("held")).toBe("held");
    expect(parseLaneState("released")).toBe("released");
    expect(parseLaneState(true)).toBe("released");
  });

  it("reads one held lane with its countdown, ignoring a time it cannot use", () => {
    const lanes = parseLaneRevealMap({
      classA: { state: "held", releaseAt: at },
      classB: { state: "held", releaseAt: "soon" },
      classC: { state: "released", releaseAt: at },
    });
    expect(lanes.classA).toEqual({ state: "held", releaseAt: at, board: [] });
    // Held with no usable time is the calm holding screen, not a broken countdown.
    expect(lanes.classB).toEqual({ state: "held", releaseAt: null, board: [] });
    // A released lane carries no countdown even if a stale one was stored.
    expect(lanes.classC).toEqual({ state: "released", releaseAt: null, board: [] });
    expect(heldLanes(lanes)).toEqual(["classA", "classB"]);
    expect(laneIsHeld(lanes.classA)).toBe(true);
    expect(laneIsHeld(lanes.classC)).toBe(false);
  });

  it("is stored inside the event row, one lane at a time", () => {
    const publishViews = {
      leaderboard: false,
      roster: false,
      resultsRevealAt: at,
      resultsLanes: { classA: { state: "held", releaseAt: at } },
      aKeyThisBuildDoesNotKnow: "kept",
    };

    const stored = storedLaneReveal(publishViews);
    expect(stored.classA).toEqual({ state: "held", releaseAt: at, board: [] });
    // An untouched lane is released.
    expect(stored.netOverall.state).toBe("released");
    expect(storedLaneReveal(null).classA.state).toBe("released");

    const next = mergeLaneReveal(publishViews, "classC", {
      state: "held",
      releaseAt: at,
      board: [],
    });
    expect(next.resultsLanes).toEqual({
      classA: { state: "held", releaseAt: at },
      classC: { state: "held", releaseAt: at },
    });
    // Writing one lane leaves every other key and lane exactly as it was.
    expect(next.leaderboard).toBe(false);
    expect(next.roster).toBe(false);
    expect(next.resultsRevealAt).toBe(at);
    expect(next.aKeyThisBuildDoesNotKnow).toBe("kept");
    expect(LANES_KEY).toBe("resultsLanes");

    // Releasing a lane drops its time, so a stale countdown cannot outlive the release.
    const released = mergeLaneReveal(next, "classA", {
      state: "released",
      releaseAt: at,
      board: [],
    });
    expect((released.resultsLanes as Record<string, unknown>).classA).toEqual({
      state: "released",
    });
  });

  it("writes a first lane into an event with no stored lanes", () => {
    expect(mergeLaneReveal(null, "classD", { state: "held", releaseAt: at, board: [] })).toEqual({
      resultsLanes: { classD: { state: "held", releaseAt: at } },
    });
  });

  it("counts down from the server clock, per lane", () => {
    const lane = laneOf("held", at);
    const remaining = laneRemainingMs({ lane, serverNow, receivedAt: 30_000, now: 33_000 });
    expect(remaining).toBe(12_000);
    // The whole seconds a phone prints.
    expect(laneSecondsRemaining({ lane, serverNow, receivedAt: 0, now: 0 })).toBe(15);
    expect(laneSecondsRemaining({ lane, serverNow, receivedAt: 0, now: 14_100 })).toBe(1);
    expect(laneSecondsRemaining({ lane, serverNow, receivedAt: 0, now: 90_000 })).toBe(0);

    // A released lane has nothing to count.
    const released = laneOf("released", null);
    expect(laneRemainingMs({ lane: released, serverNow, receivedAt: 0, now: 0 })).toBeNull();
    expect(laneSecondsRemaining({ lane: released, serverNow, receivedAt: 0, now: 0 })).toBeNull();
    // Held with no time is no countdown either.
    const noTime = laneOf("held", null);
    expect(laneSecondsRemaining({ lane: noTime, serverNow, receivedAt: 0, now: 0 })).toBeNull();
  });

  it("shows the lane only once the desk has released it", () => {
    const held = laneOf("held", at);
    expect(lanePhase({ lane: held, remainingMs: 12_000 })).toBe("counting");
    expect(lanePhase({ lane: held, remainingMs: 0 })).toBe("due");
    expect(lanePhase({ lane: held, remainingMs: null })).toBe("hidden");
    // The clock alone never releases a lane; the stored state is the gate.
    const released = laneOf("released", at);
    expect(lanePhase({ lane: released, remainingMs: 12_000 })).toBe("released");
  });

  it("changes the poll signature when one lane moves", () => {
    const lanes = parseLaneRevealMap(null);
    expect(laneSignature(lanes)).toBe(
      "classA:released@-|classB:released@-|classC:released@-|classD:released@-|netOverall:released@-|grossOverall:released@-",
    );
    const moved = mergeLaneReveal({}, "classA", { state: "held", releaseAt: at, board: [] });
    const hidden = storedLaneReveal({ [LANES_KEY]: moved[LANES_KEY] });
    expect(laneSignature(hidden)).not.toBe(laneSignature(lanes));
    // The same timestamp written in another timezone is one hold, not a new one.
    const offset = storedLaneReveal({
      [LANES_KEY]: { classA: { state: "held", releaseAt: "2026-11-15T14:00:15+00:00" } },
    });
    expect(laneSignature(offset)).toBe(laneSignature(hidden));
  });

  it("reads the lanes out of the poll's answer", () => {
    const poll = parseRevealPoll({
      held: { leaderboard: false, roster: false },
      revealAt: null,
      lanes: { classA: { state: "held", releaseAt: at } },
    });
    expect(poll?.lanes.classA).toEqual({ state: "held", releaseAt: at, board: [] });
    expect(poll?.lanes.classB.state).toBe("released");

    // An endpoint that does not send lanes is six released lanes, never a frozen page.
    const older = parseRevealPoll({ held: { leaderboard: true, roster: true }, revealAt: at });
    expect(heldLanes(older?.lanes ?? parseLaneRevealMap(null))).toEqual([]);
  });
});
