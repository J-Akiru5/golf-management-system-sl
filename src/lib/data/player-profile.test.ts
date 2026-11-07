import { describe, expect, it } from "vitest";
import { canOpenPlayerProfile, playerProfileHref } from "./player-profile";

describe("playerProfileHref", () => {
  it("builds the staff route for a player id", () => {
    expect(playerProfileHref("6f1c2b1e-0d4a-4c3f-9a51-2f7b8c9d0e11")).toBe(
      "/players/6f1c2b1e-0d4a-4c3f-9a51-2f7b8c9d0e11",
    );
  });

  it("percent-encodes an id that needs it", () => {
    expect(playerProfileHref("a b/c")).toBe("/players/a%20b%2Fc");
  });
});

describe("canOpenPlayerProfile", () => {
  it("leaves the link live when auth is not configured", () => {
    expect(canOpenPlayerProfile(undefined)).toBe(true);
  });

  it("closes the link for a signed-in account with no club membership", () => {
    expect(canOpenPlayerProfile(null)).toBe(false);
  });

  it("opens the link for every staff role", () => {
    expect(canOpenPlayerProfile("owner")).toBe(true);
    expect(canOpenPlayerProfile("organizer")).toBe(true);
    expect(canOpenPlayerProfile("desk")).toBe(true);
  });
});
