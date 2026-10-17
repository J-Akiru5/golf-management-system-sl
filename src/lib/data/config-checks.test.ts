import { describe, expect, it } from "vitest";
import { DEMO_HOLES, DEMO_TEES, makeDemoTournaments } from "@/lib/demo/data";
import { checkTournament } from "./config-checks";
import type { Tournament } from "./types";

// Demo-config numbers only.

const bambooTee = makeDemoTournaments()[0] as Tournament;

describe("checkTournament", () => {
  it("passes the demo event with warnings only, never a hard failure", () => {
    const checks = checkTournament(bambooTee, DEMO_TEES, DEMO_HOLES);
    expect(checks.some((c) => c.level === "bad")).toBe(false);
    const ids = checks.map((c) => c.id);
    // The demo event carries the known open items.
    expect(ids).toContain("name");
    expect(ids).toContain("tees");
    expect(ids).toContain("holes");
    expect(ids).toContain("day4");
    expect(checks.find((c) => c.id === "day4")?.detail).toContain("11:30PM Tee Off");
  });

  it("blocks overlapping flight ranges", () => {
    const broken: Tournament = {
      ...bambooTee,
      flights: [
        { id: "x1", categoryId: "regular", name: "Regular A", min: 0, max: 15 },
        { id: "x2", categoryId: "regular", name: "Regular B", min: 14, max: 30 },
      ],
    };
    const checks = checkTournament(broken, DEMO_TEES, DEMO_HOLES);
    const overlap = checks.find((c) => c.id === "flights-overlap");
    expect(overlap?.level).toBe("bad");
    expect(overlap?.detail).toContain("Regular A");
  });

  it("blocks a category whose tee is not set up", () => {
    const broken: Tournament = {
      ...bambooTee,
      categories: bambooTee.categories.map((c) =>
        c.id === "ladies" ? { ...c, teeId: "missing-tee" } : c,
      ),
    };
    const checks = checkTournament(broken, DEMO_TEES, DEMO_HOLES);
    expect(checks.find((c) => c.id === "tee-ladies")?.level).toBe("bad");
  });

  it("warns when a handicap band has no flight", () => {
    const broken: Tournament = {
      ...bambooTee,
      flights: bambooTee.flights.map((f) => (f.id === "r-c" ? { ...f, min: 25, max: 30 } : f)),
    };
    const checks = checkTournament(broken, DEMO_TEES, DEMO_HOLES);
    const gap = checks.find((c) => c.id === "flights-gap");
    expect(gap?.level).toBe("warn");
    expect(gap?.detail).toContain("Regular");
  });
});
