import { describe, expect, it } from "vitest";
import { can, DESK_ROLES, isManager, MANAGER_ROLES, requireClubRole } from "./roles";

describe("staff roles", () => {
  it("only owner and organizer may manage the tournament", () => {
    expect(MANAGER_ROLES).toEqual(["owner", "organizer"]);
    expect(isManager("owner")).toBe(true);
    expect(isManager("organizer")).toBe(true);
    expect(isManager("desk")).toBe(false);
  });

  it("desk may register players but not change tournament settings", () => {
    expect(can("desk", "register-player")).toBe(true);
    expect(can("desk", "manage-tournament")).toBe(false);
    expect(DESK_ROLES).toContain("desk");
  });

  it("fails closed when the member does not hold one of the required roles", () => {
    expect(() => requireClubRole({ role: "desk", displayName: "Pro shop" }, MANAGER_ROLES)).toThrow(
      /does not have permission/,
    );
    expect(() =>
      requireClubRole({ role: "owner", displayName: "Owner" }, MANAGER_ROLES),
    ).not.toThrow();
  });

  it("names the account in the failure so the desk knows who to ask", () => {
    expect(() => requireClubRole({ role: "desk", displayName: "Pro shop" }, MANAGER_ROLES)).toThrow(
      /Pro shop/,
    );
  });
});
