import { describe, expect, it } from "vitest";
import { pairingsBackLink } from "./pairings-nav";

describe("pairingsBackLink", () => {
  it("returns to the pairings list from a player's profile", () => {
    expect(pairingsBackLink("profile")).toEqual({
      labelKey: "pairings.backToPairings",
      href: "/pairings",
    });
  });

  it("returns to the main page from the pairings tab", () => {
    expect(pairingsBackLink("pairings")).toEqual({
      labelKey: "pairings.backHome",
      href: "/",
    });
  });

  it("returns to the main page from the other top-level tabs", () => {
    for (const tab of ["players", "leaderboard"] as const) {
      expect(pairingsBackLink(tab)).toEqual({
        labelKey: "pairings.backHome",
        href: "/",
      });
    }
    expect(pairingsBackLink(undefined)).toEqual({
      labelKey: "pairings.backHome",
      href: "/",
    });
  });
});
