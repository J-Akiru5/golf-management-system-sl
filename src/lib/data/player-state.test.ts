import { describe, expect, it } from "vitest";
import { isPlayerRemoved, playerStateLabel } from "./player-state";

describe("isPlayerRemoved", () => {
  it("counts an ordinary record as in use", () => {
    expect(isPlayerRemoved({ active: true, deletedAt: null })).toBe(false);
  });

  it("reads a record with no state at all as in use", () => {
    expect(isPlayerRemoved({})).toBe(false);
  });

  it("counts a disabled record as not to be used", () => {
    expect(isPlayerRemoved({ active: false })).toBe(true);
  });

  it("counts a soft-deleted record as not to be used, even if the flag says active", () => {
    expect(isPlayerRemoved({ active: true, deletedAt: "2026-11-05T09:00:00.000Z" })).toBe(true);
  });
});

describe("playerStateLabel", () => {
  it("names the three states the desk sees", () => {
    expect(playerStateLabel({ active: true, deletedAt: null })).toBe("Active");
    expect(playerStateLabel({ active: false })).toBe("Disabled");
    expect(playerStateLabel({ active: false, deletedAt: "2026-11-05T09:00:00.000Z" })).toBe(
      "Removed",
    );
  });
});
