import { describe, expect, it } from "vitest";
import type { MarkerPoolPlayer } from "./markers";
import { markerCandidates } from "./markers";

const ROSTER: readonly MarkerPoolPlayer[] = [
  { playerId: "rosa", name: "ROSA, ANA", group: "1A", teamId: "team-a" },
  { playerId: "teammate", name: "TEAMMATE, TOM", group: "1A", teamId: "team-a" },
  { playerId: "bino", name: "BINO, CARLO", group: "1A", teamId: "team-b" },
  { playerId: "cruz", name: "CRUZ, DINO", group: "1A", teamId: "team-b" },
  { playerId: "diaz", name: "DIAZ, EMO", group: "1A", teamId: null },
  { playerId: "other", name: "OTHER, FRED", group: "2A", teamId: "team-b" },
  { playerId: "nogroup", name: "NOGROUP, GINA", group: null, teamId: "team-b" },
];

describe("marker candidates", () => {
  it("offers the other team in the group first, then unknown teams, by name", () => {
    const result = markerCandidates("rosa", ROSTER);
    expect(result.reason).toBeNull();
    expect(result.candidates.map((candidate) => candidate.playerId)).toEqual([
      "bino",
      "cruz",
      "diaz",
    ]);
    expect(result.candidates.map((candidate) => candidate.teamKnown)).toEqual([true, true, false]);
  });

  it("never offers the player as their own marker", () => {
    const result = markerCandidates("rosa", ROSTER);
    expect(result.candidates.map((candidate) => candidate.playerId)).not.toContain("rosa");
  });

  it("drops a same-team player only when both teams are known", () => {
    const result = markerCandidates("rosa", ROSTER);
    expect(result.candidates.map((candidate) => candidate.playerId)).not.toContain("teammate");
  });

  it("keeps a same-team player when the player's team is not known", () => {
    const roster: MarkerPoolPlayer[] = [
      { playerId: "anon", name: "ANON, ALE", group: "2A", teamId: null },
      { playerId: "known", name: "KNOWN, KIM", group: "2A", teamId: "team-a" },
    ];
    const result = markerCandidates("anon", roster);
    expect(result.candidates).toEqual([
      { playerId: "known", name: "KNOWN, KIM", teamKnown: false },
    ]);
  });

  it("keeps a candidate whose team is not known and marks it unknown", () => {
    const result = markerCandidates("rosa", ROSTER);
    expect(result.candidates.find((candidate) => candidate.playerId === "diaz")).toEqual({
      playerId: "diaz",
      name: "DIAZ, EMO",
      teamKnown: false,
    });
  });

  it("returns an empty list with no_group when the player has no group", () => {
    const result = markerCandidates("nogroup", ROSTER);
    expect(result.candidates).toEqual([]);
    expect(result.reason).toBe("no_group");
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("returns an empty list when the player is not in the list", () => {
    const result = markerCandidates("missing", ROSTER);
    expect(result.candidates).toEqual([]);
    expect(result.reason).toBe("player_not_found");
  });

  it("returns an empty list when the only others are on the same known team", () => {
    const roster: MarkerPoolPlayer[] = [
      { playerId: "rosa", name: "ROSA, ANA", group: "1A", teamId: "team-a" },
      { playerId: "teammate", name: "TEAMMATE, TOM", group: "1A", teamId: "team-a" },
    ];
    const result = markerCandidates("rosa", roster);
    expect(result.candidates).toEqual([]);
    expect(result.reason).toBe("no_candidates");
  });
});
