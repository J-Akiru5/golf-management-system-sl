import { describe, expect, it } from "vitest";
import { STAFF_PREFIXES } from "@/lib/auth/routes";
import {
  DESK_MOBILE_ITEMS,
  isMobileCurrent,
  type MobileLinkItem,
  PLAYER_MOBILE_ITEMS,
} from "./mobile-nav";

const links = (items: readonly { kind: string }[]): MobileLinkItem[] =>
  items.filter((item): item is MobileLinkItem => item.kind === "link");

describe("desk bottom bar", () => {
  it("offers four destinations and one escape, led by Today", () => {
    expect(DESK_MOBILE_ITEMS).toHaveLength(5);
    expect(links(DESK_MOBILE_ITEMS).map((item) => item.href)).toEqual([
      "/admin",
      "/draw",
      "/register",
      "/players",
    ]);
    expect(DESK_MOBILE_ITEMS.at(-1)).toMatchObject({ kind: "more", label: "More" });
  });

  it("only points at screens the desk already has", () => {
    for (const item of links(DESK_MOBILE_ITEMS)) {
      expect(STAFF_PREFIXES).toContain(item.href);
    }
  });

  it("keeps visible labels, not icon-only guesses", () => {
    expect(DESK_MOBILE_ITEMS.map((item) => item.label)).toEqual([
      "Today",
      "Draw",
      "Register",
      "Players",
      "More",
    ]);
  });

  it("has one raised centre action: the register desk", () => {
    const actions = links(DESK_MOBILE_ITEMS).filter((item) => item.action);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.label).toBe("Register");
    // Centre of five: two destinations on either side.
    expect(DESK_MOBILE_ITEMS[2]).toMatchObject({ kind: "link", href: "/register", action: true });
  });
});

describe("player bottom bar", () => {
  it("carries the player app's five destinations", () => {
    expect(links(PLAYER_MOBILE_ITEMS).map((item) => item.href)).toEqual([
      "/my",
      "/my/board",
      "/my/card",
      "/pairings",
      "/my/profile",
    ]);
    expect(PLAYER_MOBILE_ITEMS.map((item) => item.label)).toEqual([
      "Home",
      "Board",
      "Card",
      "Pairings",
      "Profile",
    ]);
  });

  it("marks Home only on the dashboard, never on a screen it parents", () => {
    const home = PLAYER_MOBILE_ITEMS[0];
    expect(home).toMatchObject({ href: "/my", exact: true });
    expect(links(PLAYER_MOBILE_ITEMS).filter((item) => item.exact)).toHaveLength(1);
  });
});

describe("bar contracts", () => {
  it("gives every control a stable, unique test id", () => {
    const ids = [...DESK_MOBILE_ITEMS, ...PLAYER_MOBILE_ITEMS].map((item) => item.testId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("desk-bar-") || id.startsWith("player-bar-"))).toBe(
      true,
    );
  });

  it("marks a detail page as its parent destination, and home only on the home page", () => {
    expect(isMobileCurrent("/players", "/players")).toBe(true);
    expect(isMobileCurrent("/players/p-1", "/players")).toBe(true);
    expect(isMobileCurrent("/print-preview", "/print")).toBe(false);
    expect(isMobileCurrent("/", "/")).toBe(true);
    expect(isMobileCurrent("/pairings", "/")).toBe(false);
  });
});
