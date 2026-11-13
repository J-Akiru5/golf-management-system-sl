import { describe, expect, it } from "vitest";
import { parsePublicTab, publicTabHref } from "./public-tabs";

describe("public tabs", () => {
  it("accepts the tabs and falls back to pairings", () => {
    expect(parsePublicTab("pairings")).toBe("pairings");
    expect(parsePublicTab("players")).toBe("players");
    expect(parsePublicTab("profile")).toBe("profile");
    expect(parsePublicTab("leaderboard")).toBe("leaderboard");
    expect(parsePublicTab("scores")).toBe("scores");
    expect(parsePublicTab(undefined)).toBe("pairings");
    expect(parsePublicTab("nonsense")).toBe("pairings");
    expect(parsePublicTab(["profile", "leaderboard"])).toBe("profile");
  });

  it("keeps the profile tab on the pairings page and the selected player in the URL", () => {
    expect(publicTabHref("profile")).toBe("/pairings?tab=profile");
    expect(publicTabHref("profile", { player: "p1" })).toBe("/pairings?tab=profile&player=p1");
  });

  it("sends Players to the roster and Leaderboard to its own page", () => {
    expect(publicTabHref("players")).toBe("/roster");
    expect(publicTabHref("leaderboard")).toBe("/leaderboard");
    expect(publicTabHref("leaderboard", { category: "Ladies", flight: "Class A" })).toBe(
      "/leaderboard?category=Ladies&flight=Class+A",
    );
  });

  it("keeps Pairings on the clean path when no filter is present", () => {
    expect(publicTabHref("pairings")).toBe("/pairings");
  });

  it("sends the all-scores tab to its own page", () => {
    expect(publicTabHref("scores")).toBe("/results");
  });
});
