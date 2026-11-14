import { describe, expect, it } from "vitest";
import { dropTargetAt, sameTarget, TOUCH_DRAG_THRESHOLD } from "./board-drag";

/**
 * The glue around a drag, not the decision. The unit suite runs without a browser, so the two
 * things that matter here are that a board is never read when there is no page, and that a pointer
 * sitting still does not count as a new place (which would re-render the board on every move).
 */

describe("dropTargetAt", () => {
  it("answers nothing when there is no page to read", () => {
    // No DOM in this suite: the guard is what keeps a server render from throwing.
    expect(dropTargetAt(0, 0)).toBeNull();
    expect(dropTargetAt(120, 480)).toBeNull();
  });
});

describe("sameTarget", () => {
  it("treats two places as the same place", () => {
    expect(sameTarget({ kind: "group", group: 3 }, { kind: "group", group: 3 })).toBe(true);
    expect(sameTarget({ kind: "player", playerId: "p1" }, { kind: "player", playerId: "p1" })).toBe(
      true,
    );
  });

  it("tells a group from a player and one group from another", () => {
    expect(sameTarget({ kind: "group", group: 3 }, { kind: "group", group: 4 })).toBe(false);
    expect(sameTarget({ kind: "player", playerId: "p1" }, { kind: "player", playerId: "p2" })).toBe(
      false,
    );
    expect(sameTarget({ kind: "group", group: 3 }, { kind: "player", playerId: "p1" })).toBe(false);
  });

  it("tells a place from no place", () => {
    expect(sameTarget(null, null)).toBe(true);
    expect(sameTarget(null, { kind: "group", group: 3 })).toBe(false);
    expect(sameTarget({ kind: "group", group: 3 }, null)).toBe(false);
  });
});

describe("TOUCH_DRAG_THRESHOLD", () => {
  it("is a short distance, so a tap is not a drag and a drag is not a wait", () => {
    expect(TOUCH_DRAG_THRESHOLD).toBeGreaterThan(0);
    expect(TOUCH_DRAG_THRESHOLD).toBeLessThanOrEqual(12);
  });
});
