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

  it("warns when a handicap band has no class", () => {
    // Classes are field-wide, so dropping one leaves that band uncovered for every tee.
    const broken: Tournament = {
      ...bambooTee,
      flights: bambooTee.flights.filter((f) => f.id !== "c"),
    };
    const checks = checkTournament(broken, DEMO_TEES, DEMO_HOLES);
    const gap = checks.find((c) => c.id === "flights-gap");
    expect(gap?.level).toBe("warn");
    expect(gap?.detail).toContain("No class covers index");
  });
});

describe("course data checks follow what is saved", () => {
  const filled = DEMO_HOLES.map((h) => ({ ...h, par: 4, strokeIndex: h.number }));

  it("asks for a confirmation until an owner or organizer gives it", () => {
    const pending = checkTournament(bambooTee, DEMO_TEES, filled);
    expect(pending.find((c) => c.id === "tees")?.level).toBe("warn");
    expect(pending.find((c) => c.id === "holes")?.level).toBe("ok");

    const confirmed = checkTournament(
      { ...bambooTee, courseDataConfirmed: true },
      DEMO_TEES,
      filled,
    );
    expect(confirmed.find((c) => c.id === "tees")?.level).toBe("ok");
  });

  it("blocks when no tees are saved at all", () => {
    expect(checkTournament(bambooTee, [], filled).find((c) => c.id === "tees")?.level).toBe("bad");
  });

  it("treats an empty hole list as not entered, not as fine", () => {
    const none = checkTournament(bambooTee, DEMO_TEES, []).find((c) => c.id === "holes");
    expect(none?.level).toBe("warn");
    expect(none?.label).toContain("18 holes");
  });

  it("blocks a repeated stroke index", () => {
    const repeated = filled.map((h) => (h.number === 6 ? { ...h, strokeIndex: 1 } : h));
    const check = checkTournament(bambooTee, DEMO_TEES, repeated).find((c) => c.id === "holes");
    expect(check?.level).toBe("bad");
    expect(check?.detail).toContain("holes 1 and 6");
  });

  it("no longer calls the numbers a demo", () => {
    const text = checkTournament(bambooTee, DEMO_TEES, filled)
      .map((c) => `${c.label} ${c.detail}`)
      .join(" ");
    expect(text).not.toMatch(/this demo/i);
  });
});
