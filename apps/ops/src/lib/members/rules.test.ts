import { describe, expect, it } from "vitest";
import {
  canChangeRole,
  canEditDisplayName,
  canReactivate,
  canRemove,
  canSuspend,
  checkDisplayName,
  decide,
  explainBlock,
  isLastActiveOwner,
  isWorkspaceRole,
  MEMBER_RULE_MESSAGES,
  type MemberFacts,
} from "./rules";

const ana: MemberFacts = { userId: "u-ana", role: "owner", status: "active" };
const ben: MemberFacts = { userId: "u-ben", role: "owner", status: "active" };
const miguel: MemberFacts = { userId: "u-miguel", role: "partner", status: "active" };
const grace: MemberFacts = { userId: "u-grace", role: "member", status: "active" };
const noel: MemberFacts = { userId: "u-noel", role: "member", status: "suspended" };
const dana: MemberFacts = { userId: "u-dana", role: "owner", status: "suspended" };

const alone = [ana, miguel, grace, noel];
const twoOwners = [ana, ben, miguel, grace, noel];

describe("canChangeRole", () => {
  it("lets an owner change another member's role", () => {
    expect(canChangeRole(ana, grace, "partner", alone)).toBe(true);
    expect(canChangeRole(ana, grace, "owner", alone)).toBe(true);
    expect(canChangeRole(ana, miguel, "member", alone)).toBe(true);
  });

  it("refuses a partner, a member, a suspended owner and no viewer", () => {
    expect(canChangeRole(miguel, grace, "partner", alone)).toBe(false);
    expect(canChangeRole(grace, miguel, "member", alone)).toBe(false);
    expect(canChangeRole({ ...ana, status: "suspended" }, grace, "partner", alone)).toBe(false);
    expect(canChangeRole(null, grace, "partner", alone)).toBe(false);
  });

  it("refuses to demote the last active owner", () => {
    const decision = decide(ana, ana, { kind: "change_role", role: "partner" }, alone);
    expect(decision).toEqual({
      allowed: false,
      reason: MEMBER_RULE_MESSAGES.lastOwner,
      code: "23514",
    });
    expect(canChangeRole(ana, ana, "member", alone)).toBe(false);
  });

  it("allows demoting an owner when another active owner remains", () => {
    expect(canChangeRole(ben, ana, "partner", twoOwners)).toBe(true);
    expect(canChangeRole(ana, ana, "partner", twoOwners)).toBe(true);
  });

  it("does not count a suspended owner as the remaining owner", () => {
    expect(canChangeRole(ana, ana, "member", [ana, dana])).toBe(false);
  });

  it("allows re-roling a suspended owner, because the last-owner rule only covers an active one", () => {
    expect(canChangeRole(ana, dana, "member", [ana, dana])).toBe(true);
  });

  it("treats changing a role to the same role as allowed", () => {
    expect(canChangeRole(ana, ana, "owner", alone)).toBe(true);
  });
});

describe("canSuspend and canReactivate", () => {
  it("lets an owner suspend an active member", () => {
    expect(canSuspend(ana, grace, alone)).toBe(true);
    expect(canSuspend(ana, miguel, alone)).toBe(true);
  });

  it("refuses suspending the last active owner", () => {
    expect(canSuspend(ana, ana, alone)).toBe(false);
    expect(canSuspend(ana, ana, twoOwners)).toBe(true);
  });

  it("lets an owner reactivate a suspended member and refuses a non-owner", () => {
    expect(canReactivate(ana, noel, alone)).toBe(true);
    expect(canReactivate(miguel, noel, alone)).toBe(false);
    expect(canReactivate(null, noel, alone)).toBe(false);
  });
});

describe("canRemove", () => {
  it("lets an owner remove another member", () => {
    expect(canRemove(ana, grace, alone)).toBe(true);
    expect(canRemove(ana, miguel, alone)).toBe(true);
  });

  it("refuses removing the last active owner", () => {
    expect(canRemove(ana, ana, alone)).toBe(false);
    expect(canRemove(ana, ana, twoOwners)).toBe(true);
  });

  it("refuses a non-owner", () => {
    expect(canRemove(miguel, grace, alone)).toBe(false);
    expect(canRemove(grace, miguel, alone)).toBe(false);
  });
});

describe("canEditDisplayName", () => {
  it("lets an active member change their own name only", () => {
    expect(canEditDisplayName(grace, grace)).toBe(true);
    expect(canEditDisplayName(ana, ana)).toBe(true);
    expect(canEditDisplayName(grace, miguel)).toBe(false);
    expect(canEditDisplayName(ana, grace)).toBe(false);
  });

  it("refuses a suspended or missing viewer", () => {
    expect(canEditDisplayName({ ...grace, status: "suspended" }, grace)).toBe(false);
    expect(canEditDisplayName(null, grace)).toBe(false);
  });
});

describe("explainBlock", () => {
  it("returns null when the action is allowed", () => {
    expect(explainBlock(ana, grace, { kind: "remove" }, alone)).toBeNull();
  });

  it("explains every refusal in plain words", () => {
    expect(explainBlock(ana, ana, { kind: "remove" }, alone)).toBe(
      "The workspace needs at least one active owner.",
    );
    expect(explainBlock(miguel, grace, { kind: "remove" }, alone)).toBe(
      "Only an owner can do that.",
    );
    expect(explainBlock(grace, miguel, { kind: "edit_display_name" }, alone)).toBe(
      "You can only change your own display name.",
    );
    expect(explainBlock({ ...ana, status: "suspended" }, grace, { kind: "remove" }, alone)).toBe(
      "You need an active workspace membership to change anything here.",
    );
  });
});

describe("isLastActiveOwner", () => {
  it("is true only for an active owner with no other active owner", () => {
    expect(isLastActiveOwner(ana, alone)).toBe(true);
    expect(isLastActiveOwner(ana, twoOwners)).toBe(false);
    expect(isLastActiveOwner(grace, [grace])).toBe(false);
    expect(isLastActiveOwner(dana, [dana])).toBe(false);
  });
});

describe("checkDisplayName", () => {
  it("accepts a normal name and trims it", () => {
    expect(checkDisplayName("Ana Reyes")).toBeNull();
    expect(checkDisplayName("  Ana Reyes  ")).toBeNull();
  });

  it("refuses an empty or whitespace-only name", () => {
    expect(checkDisplayName("")).toBe("Enter a display name.");
    expect(checkDisplayName("   ")).toBe("Enter a display name.");
  });

  it("refuses more than 80 characters", () => {
    expect(checkDisplayName("a".repeat(80))).toBeNull();
    expect(checkDisplayName("a".repeat(81))).toBe("Use 80 characters or fewer.");
  });
});

describe("isWorkspaceRole", () => {
  it("accepts the three roles and nothing else", () => {
    expect(isWorkspaceRole("owner")).toBe(true);
    expect(isWorkspaceRole("partner")).toBe(true);
    expect(isWorkspaceRole("member")).toBe(true);
    expect(isWorkspaceRole("admin")).toBe(false);
    expect(isWorkspaceRole(null)).toBe(false);
    expect(isWorkspaceRole(3)).toBe(false);
  });
});
