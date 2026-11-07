import { describe, expect, it } from "vitest";
import { areaOf, STAFF_PREFIXES } from "@/lib/auth/routes";
import { isStaffCurrent, STAFF_NAV } from "./nav";

describe("staff navigation", () => {
  it("keeps every destination inside the guarded staff area", () => {
    for (const item of STAFF_NAV) {
      expect(STAFF_PREFIXES).toContain(item.href.split("/")[1] === "staff" ? "/staff" : item.href);
      expect(areaOf(item.href)).toBe("staff");
    }
    expect(STAFF_PREFIXES).toContain("/staff");
  });

  it("has four labelled destinations", () => {
    expect(STAFF_NAV).toHaveLength(4);
    expect(STAFF_NAV.map((item) => item.label)).toEqual(["Today", "Players", "Schedule", "Score"]);
  });

  it("marks the current destination, including detail pages", () => {
    const players = STAFF_NAV.find((item) => item.href === "/staff/players")!;
    const today = STAFF_NAV.find((item) => item.href === "/staff")!;
    const schedule = STAFF_NAV.find((item) => item.href === "/staff/schedule")!;

    expect(isStaffCurrent("/staff/players", players)).toBe(true);
    expect(isStaffCurrent("/staff/score", players)).toBe(false);
    expect(isStaffCurrent("/staff/schedule/g-1", schedule)).toBe(true);
    expect(isStaffCurrent("/staff", today)).toBe(true);
    expect(isStaffCurrent("/staff/players", today)).toBe(false);
  });

  it("is guarded as staff, not public", () => {
    expect(areaOf("/staff/groups/g-1/score")).toBe("staff");
  });
});
