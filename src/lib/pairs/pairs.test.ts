import { describe, expect, it } from "vitest";
import type { RegistrationEntry } from "@/lib/data/types";
import { nextPairNumber, pairProblems, pairSlots, partnerCandidates } from "./pairs";

const entry = (id: string, role: "member" | "guest", teamNo: number | null): RegistrationEntry => ({
  id,
  clubId: "club",
  tournamentId: "event",
  playerId: `player-${id}`,
  role,
  teamNo,
  sponsor: null,
  shirt: null,
  teePreferences: {},
  declaredWshId: null,
  declaredWshHandicap: null,
  extra: {},
  paymentStatus: "pending",
  frozen: {
    index: 12,
    recordId: null,
    effectiveDate: "2026-10-01",
    frozenAt: "2026-11-01T00:00:00.000Z",
  },
  createdAt: "2026-11-01T00:00:00.000Z",
  source: "desk",
});

describe("pairSlots", () => {
  it("returns the member and the guest for one number", () => {
    const slots = pairSlots(
      [entry("m1", "member", 124), entry("g1", "guest", 124), entry("x", "member", 125)],
      124,
    );
    expect(slots.member?.id).toBe("m1");
    expect(slots.guest?.id).toBe("g1");
  });

  it("shows an incomplete pair as one empty side", () => {
    expect(pairSlots([entry("g1", "guest", 124)], 124)).toEqual({
      number: 124,
      member: null,
      guest: expect.objectContaining({ id: "g1" }),
    });
  });
});

describe("nextPairNumber", () => {
  it("starts at 1 and continues past the highest number", () => {
    expect(nextPairNumber([])).toBe(1);
    expect(nextPairNumber([entry("a", "member", 3), entry("b", "guest", 124)])).toBe(125);
  });
});

describe("partnerCandidates", () => {
  it("offers only the matching role and leaves out paired players", () => {
    const entries = [
      entry("solo-member", "member", null),
      entry("paired-member", "member", 2),
      entry("solo-guest", "guest", null),
    ];
    expect(partnerCandidates(entries, "member").map((row) => row.id)).toEqual(["solo-member"]);
  });

  it("keeps the current pair visible when asked", () => {
    const entries = [entry("current", "guest", 5), entry("other", "guest", 6)];
    expect(partnerCandidates(entries, "guest", { pairNumber: 5 }).map((row) => row.id)).toEqual([
      "current",
    ]);
  });

  it("never offers the player being replaced", () => {
    const entries = [entry("current", "guest", 5), entry("other", "guest", null)];
    expect(
      partnerCandidates(entries, "guest", { pairNumber: 5, excludeEntryId: "current" }).map(
        (row) => row.id,
      ),
    ).toEqual(["other"]);
  });
});

describe("pairProblems", () => {
  const entries = [
    entry("member-solo", "member", null),
    entry("guest-solo", "guest", null),
    entry("member-paired", "member", 7),
    entry("guest-paired", "guest", 7),
  ];

  it("accepts an unfinished pair", () => {
    expect(
      pairProblems({
        entries,
        number: 124,
        memberEntryId: "member-solo",
        guestEntryId: null,
      }),
    ).toEqual([]);
  });

  it("rejects a number below one and the same player on both sides", () => {
    const problems = pairProblems({
      entries,
      number: 0,
      memberEntryId: "member-solo",
      guestEntryId: "member-solo",
    });
    expect(problems.map((problem) => problem.code)).toEqual(["number", "same", "role"]);
  });

  it("rejects a player already in another pair", () => {
    const problems = pairProblems({
      entries,
      number: 124,
      memberEntryId: "member-paired",
      guestEntryId: null,
    });
    expect(problems.map((problem) => problem.code)).toEqual(["taken"]);
  });

  it("rejects a new pair number that is already used", () => {
    const problems = pairProblems({
      entries,
      number: 7,
      memberEntryId: "member-solo",
      guestEntryId: null,
      creating: true,
    });
    expect(problems.map((problem) => problem.code)).toEqual(["exists"]);
  });

  it("allows both sides empty only when the caller is removing the last player", () => {
    expect(
      pairProblems({
        entries,
        number: 7,
        memberEntryId: null,
        guestEntryId: null,
        allowEmpty: true,
      }),
    ).toEqual([]);
  });
});
