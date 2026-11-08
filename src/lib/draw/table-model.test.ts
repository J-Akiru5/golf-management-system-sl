import { describe, expect, it } from "vitest";
import type { DrawGroup } from "@/lib/draw/validate";
import { fmtTime } from "@/lib/format";
import { UNCLASSIFIED_LABEL } from "@/lib/routing";
import type { PairingFlight } from "./pairing-sections";
import { buildDrawTable } from "./table-model";

const grp = (number: number, ids: string[], over: Partial<DrawGroup> = {}): DrawGroup => ({
  number,
  flightId: "r-a",
  playerIds: ids,
  startHole: number,
  wave: "A",
  time: "07:00",
  locked: false,
  ...over,
});

const names: Record<string, string> = {
  a: "Ana",
  b: "Ben",
  c: "Cal",
  d: "Dan",
  e: "Eli",
};
const flights: Record<string, string> = {
  "r-a": "Men's A",
  "r-b": "Men's B",
  "l-a": "Ladies A",
};

function build(
  groups: readonly DrawGroup[],
  over: Partial<Parameters<typeof buildDrawTable>[0]> = {},
) {
  return buildDrawTable({
    groups,
    startFormat: "shotgun",
    playerName: (id) => names[id] ?? id,
    flightName: (id) => (id ? (flights[id] ?? id) : "—"),
    isUnclassified: () => false,
    ...over,
  });
}

describe("buildDrawTable", () => {
  it("labels rows as HOLE 3 and HOLE 3B when two groups share a start hole", () => {
    const sections = build([
      grp(1, ["a", "b"], { startHole: 3, time: "07:00" }),
      grp(2, ["c", "d"], { startHole: 3, time: "07:00" }),
      grp(3, ["e"], { startHole: 4, time: "07:00" }),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.groups.map((g) => g.label)).toEqual(["HOLE 3", "HOLE 3B", "HOLE 4"]);
  });

  it("uses TEE labels for a two-tee start", () => {
    const sections = build(
      [grp(1, ["a", "b"], { startHole: 1 }), grp(2, ["c", "d"], { startHole: 10 })],
      { startFormat: "two_tee" },
    );
    expect(sections[0]?.groups.map((g) => g.label)).toEqual(["TEE 1", "TEE 10"]);
  });

  it("sets column count from the widest group, never fewer than 2 and never more than 4", () => {
    expect(build([grp(1, ["a"])])[0]?.columns).toBe(2);
    expect(build([grp(1, ["a", "b"])])[0]?.columns).toBe(2);
    expect(build([grp(1, ["a", "b", "c", "d"])])[0]?.columns).toBe(4);
    expect(build([grp(1, ["a", "b", "c", "d", "e"])])[0]?.columns).toBe(4);
  });

  it("fills empty cells for short groups", () => {
    const sections = build([grp(1, ["a", "b", "c", "d"]), grp(2, ["e"])]);
    const short = sections[0]?.groups[1];
    expect(short?.cells).toEqual([{ playerId: "e", name: "Eli" }, null, null, null]);
  });

  it("keeps class ordering by first appearance and puts unclassified last when it appears last", () => {
    const sections = build(
      [
        grp(1, ["a"], { time: "07:00", flightId: "r-b" }),
        grp(2, ["b"], { time: "07:00", flightId: "r-a" }),
        grp(3, ["c"], { time: "07:00", flightId: "unc" }),
      ],
      { isUnclassified: (g) => g.flightId === "unc" },
    );
    expect(sections.map((s) => s.groups[0]?.flightName)).toEqual([
      "Men's B",
      "Men's A",
      UNCLASSIFIED_LABEL,
    ]);
    expect(sections[2]?.heading).toBe(UNCLASSIFIED_LABEL);
    expect(sections[0]?.heading).toContain("Men's B");
    expect(sections[1]?.heading).toContain("Men's A");
  });

  it("labels unclassified groups with the unclassified flight name", () => {
    const sections = build([grp(1, ["a"], { flightId: "x" })], {
      isUnclassified: () => true,
    });
    expect(sections[0]?.heading).toBe(UNCLASSIFIED_LABEL);
    expect(sections[0]?.groups[0]?.flightName).toBe(UNCLASSIFIED_LABEL);
  });

  it("keeps groups in the order they appear within a section", () => {
    const sections = build([
      grp(5, ["a"], { startHole: 5, time: "07:00" }),
      grp(2, ["b"], { startHole: 2, time: "07:00" }),
    ]);
    expect(sections[0]?.groups.map((g) => g.number)).toEqual([5, 2]);
  });

  it("groups by flight and orders rows by hole when flight is chosen", () => {
    const flightOf = (g: DrawGroup): PairingFlight | null =>
      g.number === 1 || g.number === 2
        ? { time: "06:30", letter: "A", session: "AM" }
        : g.number === 3
          ? { time: "06:45", letter: "B", session: "AM" }
          : null;
    const sections = build(
      [
        grp(1, ["a"], { startHole: 7, time: "06:30", flightId: "r-a" }),
        grp(2, ["b"], { startHole: 1, time: "06:30", flightId: "r-a" }),
        grp(3, ["c"], { startHole: 3, time: "06:45", flightId: "r-b" }),
      ],
      { categorization: "flight", flightOf },
    );
    expect(sections.map((s) => s.heading)).toEqual([
      `${fmtTime("06:30")} · Flight A`,
      `${fmtTime("06:45")} · Flight B`,
    ]);
    expect(sections[0]?.groups.map((g) => g.label)).toEqual(["HOLE 1", "HOLE 7"]);
    expect(sections[0]?.groups.map((g) => g.flightName)).toEqual(["Men's A", "Men's A"]);
  });

  it("does not mutate the input groups", () => {
    const input = [grp(1, ["a", "b"])];
    const copy = structuredClone(input);
    build(input);
    expect(input).toEqual(copy);
  });
});
