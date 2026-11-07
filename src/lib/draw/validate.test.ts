import { describe, expect, it } from "vitest";
import { DEMO_CONFIG } from "@/lib/demo/data";
import type { Registration } from "@/lib/routing";
import { type DrawGroup, dropCheck, validateDraw } from "./validate";

const reg = (id: string, over: Partial<Registration> = {}): Registration => ({
  playerId: id,
  playerName: `Player ${id}`,
  status: "ok",
  reasons: [],
  index: 10,
  age: 40,
  categoryId: "regular",
  teeId: "white",
  playingHandicap: 10,
  flightId: "r-a",
  ...over,
});
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
const names = {
  flight: (id: string | null) => id ?? "—",
  category: (id: string | null) => id ?? "—",
};
const config = DEMO_CONFIG; // groupSize 4, minGroupSize 3

function check(draw: DrawGroup[], regs: Registration[], engineWarnings: string[] = []) {
  return validateDraw({ draw, registrations: regs, config, engineWarnings, names });
}
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("validateDraw", () => {
  const four = ["a", "b", "c", "d"].map((i) => reg(i));

  it("is quiet for a clean draw", () => {
    expect(check([grp(1, ["a", "b", "c", "d"])], four)).toEqual([]);
  });

  it("blocks a player placed in two groups", () => {
    const issues = check([grp(1, ["a", "b", "c"]), grp(2, ["a", "d", "b"])], four);
    expect(issues.filter((i) => i.severity === "blocking").map((i) => i.id)).toEqual([
      "dup-a",
      "dup-b",
    ]);
  });

  it("blocks a group over the size limit", () => {
    const regs = ["a", "b", "c", "d", "e"].map((i) => reg(i));
    const issues = check([grp(1, ["a", "b", "c", "d", "e"])], regs);
    expect(ids(issues)).toContain("cap-1");
  });

  it("blocks ready players left out of every group", () => {
    const issues = check([grp(1, ["a", "b", "c"])], four);
    expect(issues).toEqual([
      expect.objectContaining({ id: "unplaced-d", severity: "blocking", playerId: "d" }),
    ]);
  });

  it("blocks ineligible or unreviewed players inside a group", () => {
    const regs = [
      reg("a"),
      reg("b", { status: "ineligible" }),
      reg("c", { status: "needs_review" }),
    ];
    const issues = check([grp(1, ["a", "b", "c"])], regs);
    expect(issues.map((i) => i.id)).toEqual(["status-b", "status-c"]);
    expect(issues[0]?.message).toContain("not eligible");
    expect(issues[1]?.message).toContain("marked Needs review");
  });

  it("does not call a player unplaced on a day they did not choose", () => {
    const issues = validateDraw({
      draw: [grp(1, ["a", "b", "c"])],
      registrations: four,
      config,
      engineWarnings: [],
      names,
      dayNumber: 1,
      dayMembers: new Set(["a", "b", "c"]),
    });
    expect(issues).toEqual([]);
  });

  it("does not demand a group for players who are not ready", () => {
    const regs = [...four.slice(0, 3), reg("z", { status: "ineligible" })];
    expect(check([grp(1, ["a", "b", "c"])], regs)).toEqual([]);
  });

  it("warns, but does not block, on small and empty groups", () => {
    const issues = check([grp(1, ["a", "b"]), grp(2, [])], [reg("a"), reg("b")]);
    expect(issues.map((i) => [i.id, i.severity])).toEqual([
      ["small-1", "warning"],
      ["empty-2", "warning"],
    ]);
  });

  it("warns about players from another flight and mixed categories", () => {
    const regs = [
      reg("a"),
      reg("b"),
      reg("c", { flightId: "l-a", categoryId: "ladies", teeId: "red" }),
    ];
    const issues = check([grp(1, ["a", "b", "c"])], regs);
    expect(ids(issues)).toEqual(["flight-1", "cats-1"]);
    // The line names who is in another flight, not only that someone is.
    expect(issues.find((i) => i.id === "flight-1")?.message).toContain("Player c is");
  });

  it("passes the routing engine's warnings through as warnings", () => {
    const issues = check([grp(1, ["a", "b", "c", "d"])], four, ["Flight X was split."]);
    expect(issues).toEqual([
      expect.objectContaining({ severity: "warning", message: "Flight X was split." }),
    ]);
  });

  it("reports locked groups as information and sorts blocking first", () => {
    const issues = check([grp(1, ["a", "b"], { locked: true })], [reg("a"), reg("b"), reg("c")]);
    expect(issues.map((i) => i.severity)).toEqual(["blocking", "warning", "info"]);
  });
});

describe("dropCheck", () => {
  const regs = new Map(
    [reg("a"), reg("b"), reg("c", { flightId: "l-a" }), reg("x"), reg("y")].map((r) => [
      r.playerId,
      r,
    ]),
  );
  const draw = [
    grp(1, ["a", "b"]),
    grp(2, ["x", "y", "b2", "b3"]),
    grp(3, [], { locked: true }),
    grp(4, ["c"], { flightId: "l-a" }),
  ];

  it("allows a move into a group with room", () => {
    expect(dropCheck(draw, config, regs, "a", 4, names)).toMatchObject({ ok: true });
  });
  it("explains why a full group refuses", () => {
    expect(dropCheck(draw, config, regs, "a", 2, names)).toEqual({
      ok: false,
      reason: "Group 2 is full (4 of 4).",
    });
  });
  it("refuses a locked target and a locked source", () => {
    expect(dropCheck(draw, config, regs, "a", 3, names)).toMatchObject({ ok: false });
    const lockedSource = [grp(1, ["a"], { locked: true }), grp(2, [])];
    expect(dropCheck(lockedSource, config, regs, "a", 2, names)).toMatchObject({ ok: false });
  });
  it("refuses a move into the player's own group", () => {
    expect(dropCheck(draw, config, regs, "a", 1, names)).toMatchObject({ ok: false });
  });
  it("lets an unplaced player in and notes a flight mismatch", () => {
    expect(dropCheck(draw, config, regs, "c", 1, names)).toEqual({
      ok: true,
      notes: ["Different flight from this group (r-a)."],
    });
  });
});
