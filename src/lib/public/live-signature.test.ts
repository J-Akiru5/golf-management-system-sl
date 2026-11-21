import { describe, expect, it } from "vitest";
import type { PublicReleaseState } from "@/lib/data/public";
import type { PublicRoundSummary } from "@/lib/data/public-results";
import { liveSignature, resultsSignature } from "./live-signature";

const released: PublicReleaseState = {
  tournamentId: "event-1",
  pairings: true,
  teeTimes: true,
  roster: true,
  leaderboard: true,
  photos: true,
  rules: true,
};

const round = (over: Partial<PublicRoundSummary> = {}): PublicRoundSummary => ({
  roundId: "round-1",
  tournamentId: "event-1",
  eventName: "The 24th Bamboo Tee",
  dayNumber: 1,
  playDate: "2026-12-21",
  version: 1,
  state: "provisional",
  publishedAt: "2026-12-21T06:00:00Z",
  ...over,
});

describe("resultsSignature", () => {
  it("is stable for the same publications whatever order they arrive in", () => {
    const one = round();
    const two = round({ roundId: "round-2", dayNumber: 2, playDate: "2026-12-22" });
    expect(resultsSignature([one, two])).toBe(resultsSignature([two, one]));
  });

  it("changes when a round is published again, finalized or first published", () => {
    const first = resultsSignature([round()]);
    expect(resultsSignature([round({ version: 2 })])).not.toBe(first);
    expect(resultsSignature([round({ state: "final" })])).not.toBe(first);
    expect(resultsSignature([round({ publishedAt: "2026-12-21T07:00:00Z" })])).not.toBe(first);
    expect(resultsSignature([round(), round({ roundId: "round-2" })])).not.toBe(first);
  });

  it("says so plainly when nothing is published", () => {
    expect(resultsSignature([])).toBe("none");
  });
});

describe("liveSignature", () => {
  const base = {
    published: { at: "2026-12-20T10:00:00Z", version: 3 },
    release: released,
    results: resultsSignature([round()]),
  };

  it("is stable while nothing has moved", () => {
    expect(liveSignature(base)).toBe(liveSignature({ ...base, release: { ...released } }));
  });

  it("moves for a pairings publish, a release toggle and a round publish", () => {
    const first = liveSignature(base);
    expect(
      liveSignature({ ...base, published: { at: "2026-12-20T10:05:00Z", version: 4 } }),
    ).not.toBe(first);
    expect(liveSignature({ ...base, release: { ...released, leaderboard: false } })).not.toBe(
      first,
    );
    expect(liveSignature({ ...base, results: resultsSignature([round({ version: 2 })]) })).not.toBe(
      first,
    );
    expect(liveSignature({ ...base, published: null, results: "none" })).not.toBe(first);
  });
});
