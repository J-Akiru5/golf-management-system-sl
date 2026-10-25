import { describe, expect, it } from "vitest";
import { displayName } from "./format";

describe("displayName", () => {
  it("shows a player name in capitals and trims the stored spelling", () => {
    expect(displayName("  Carmela Dela Cruz Reyes ")).toBe("CARMELA DELA CRUZ REYES");
  });
});
