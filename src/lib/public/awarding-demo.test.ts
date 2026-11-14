import { describe, expect, it } from "vitest";
import { demoAwardingBoards, demoLaneReveal } from "@/lib/demo/awarding";
import { heldLanes, REVEAL_LANES } from "@/lib/public/results-reveal";
import { awardingDemoEnabled } from "./awarding-demo";

describe("the awarding demo flag", () => {
  it("is off unless the flag is set", () => {
    expect(awardingDemoEnabled({})).toBe(false);
    expect(awardingDemoEnabled({ AWARDING_DEMO: "0" })).toBe(false);
    expect(awardingDemoEnabled({ AWARDING_DEMO: "true", VERCEL_ENV: "preview" })).toBe(false);
  });

  it("can never be on in production", () => {
    // The variable is refused on the production project, whatever else is set.
    expect(
      awardingDemoEnabled({
        AWARDING_DEMO: "1",
        VERCEL_ENV: "production",
        NODE_ENV: "development",
      }),
    ).toBe(false);
    // A plain production build has no Vercel environment at all and is refused too.
    expect(awardingDemoEnabled({ AWARDING_DEMO: "1", NODE_ENV: "production" })).toBe(false);
  });

  it("is available on a preview deployment and in local development", () => {
    expect(awardingDemoEnabled({ AWARDING_DEMO: "1", VERCEL_ENV: "preview" })).toBe(true);
    expect(awardingDemoEnabled({ AWARDING_DEMO: "1", VERCEL_ENV: "development" })).toBe(true);
    expect(awardingDemoEnabled({ AWARDING_DEMO: "1", NODE_ENV: "development" })).toBe(true);
  });
});

describe("the demo release sequence", () => {
  const t0 = Date.parse("2026-11-15T06:00:00.000Z");
  const at = (seconds: number) => demoLaneReveal(t0 + seconds * 1000);

  it("opens blank: every lane held, with no countdown", () => {
    const lanes = at(0);
    expect(heldLanes(lanes)).toEqual(REVEAL_LANES.map((lane) => lane.id));
    expect(Object.values(lanes).every((lane) => lane.releaseAt === null)).toBe(true);
    expect(Object.values(lanes).every((lane) => lane.board.length === 0)).toBe(true);
  });

  it("counts one lane down at a time, in lane order", () => {
    const counting = at(20);
    expect(counting.classA.state).toBe("held");
    expect(counting.classA.releaseAt).toBe(new Date(t0 + 30_000).toISOString());
    expect(counting.classB.releaseAt).toBeNull();

    const next = at(40);
    expect(next.classA.state).toBe("released");
    expect(next.classA.board.length).toBeGreaterThan(0);
    expect(next.classB.state).toBe("held");
    expect(next.classB.releaseAt).toBe(new Date(t0 + 45_000).toISOString());
  });

  it("ends with all six boards and starts again", () => {
    const all = at(120);
    expect(heldLanes(all)).toEqual([]);
    for (const lane of REVEAL_LANES) expect(all[lane.id].board.length).toBeGreaterThan(0);
    // The loop restarts, so a reload is never stuck on a finished sequence.
    expect(heldLanes(at(180))).toEqual(REVEAL_LANES.map((lane) => lane.id));
  });

  it("serves a board for all six lanes from the sample field", () => {
    const boards = demoAwardingBoards();
    for (const lane of REVEAL_LANES) {
      expect(boards[lane.id].length).toBeGreaterThan(0);
      expect(boards[lane.id].length).toBeLessThanOrEqual(3);
    }
  });
});
