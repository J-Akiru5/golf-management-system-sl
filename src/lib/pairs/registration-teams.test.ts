import { describe, expect, it } from "vitest";
import { groupIntoTeams, type TeamableRow } from "./registration-teams";

// Made-up names only.
const row = (
  id: string,
  name: string,
  role: "member" | "guest",
  teamNo: number | null,
): TeamableRow => ({ e: { id, role, teamNo }, p: { name } });

const rows = [
  row("e1", "Villa Alpha", "member", 124),
  row("e2", "Villa Beta II", "guest", 124),
  row("e3", "Cruz Gamma", "member", 7),
  row("e4", "Cruz Delta", "guest", 7),
  row("e5", "Solo Epsilon", "member", null),
];

const byName = (text: string) => (r: TeamableRow) => r.p.name.toLowerCase().includes(text);
const names = (teams: ReturnType<typeof groupIntoTeams<TeamableRow>>) =>
  teams.map((t) => t.rows.map((r) => r.p.name));

describe("groupIntoTeams", () => {
  it("makes one card per pair and one per player entered alone", () => {
    const teams = groupIntoTeams(rows);
    expect(teams).toHaveLength(3);
    expect(teams.find((t) => t.number === 124)?.rows.map((r) => r.e.role)).toEqual([
      "member",
      "guest",
    ]);
    expect(teams.find((t) => t.number === null)?.rows).toHaveLength(1);
  });

  it("keeps both partners when the search matches only one of them (issue 200)", () => {
    // "ii" is in the guest's name only, and the card must still show the member.
    const teams = groupIntoTeams(rows, byName("ii"));
    expect(names(teams)).toEqual([["Villa Alpha", "Villa Beta II"]]);
    expect(teams[0]?.number).toBe(124);
  });

  it("keeps both partners when the search matches the member only", () => {
    expect(names(groupIntoTeams(rows, byName("alpha")))).toEqual([
      ["Villa Alpha", "Villa Beta II"],
    ]);
  });

  it("leaves out a pair where neither partner matches", () => {
    expect(names(groupIntoTeams(rows, byName("zzz")))).toEqual([]);
    expect(names(groupIntoTeams(rows, byName("cruz")))).toEqual([["Cruz Gamma", "Cruz Delta"]]);
  });

  it("finds a player entered alone", () => {
    expect(names(groupIntoTeams(rows, byName("solo")))).toEqual([["Solo Epsilon"]]);
  });

  it("returns every card when there is no search", () => {
    expect(groupIntoTeams(rows, undefined)).toHaveLength(3);
  });

  it("shows a third entry on one pair number as a card of its own instead of dropping it", () => {
    const withThird = [...rows, row("e6", "Extra Zeta", "guest", 124)];
    const teams = groupIntoTeams(withThird).filter((t) => t.number === 124);
    expect(teams).toHaveLength(2);
    expect(
      teams
        .flatMap((t) => t.rows)
        .map((r) => r.p.name)
        .sort(),
    ).toEqual(["Extra Zeta", "Villa Alpha", "Villa Beta II"]);
  });

  it("keeps a stable order by the member's name, whatever order the rows arrive in", () => {
    const forward = names(groupIntoTeams(rows));
    const backward = names(groupIntoTeams([...rows].reverse()));
    expect(backward).toEqual(forward);
    expect(forward[0]).toEqual(["Cruz Gamma", "Cruz Delta"]);
  });

  it("does not change the rows it is given", () => {
    const copy = JSON.parse(JSON.stringify(rows));
    groupIntoTeams(rows, byName("ii"));
    expect(rows).toEqual(copy);
  });
});
