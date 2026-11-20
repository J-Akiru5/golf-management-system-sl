import { beforeEach, describe, expect, it } from "vitest";
import { mapMemberError } from "./errors";
import { createDemoMembersRepo, type Member, resetDemoMembers } from "./repo";

/** The demo runs on module state, so every case starts from the same seed. */
beforeEach(() => {
  resetDemoMembers();
});

describe("demo getMe", () => {
  it("returns the demo owner by default", async () => {
    const me = await createDemoMembersRepo().getMe();
    expect(me).not.toBeNull();
    expect(me?.userId).toBe("demo-owner");
    expect(me?.displayName).toBe("Ana Reyes");
    expect(me?.role).toBe("owner");
    expect(me?.email).toBe("ana.reyes@teeline.test");
  });

  it("returns the member the demo viewer was switched to", async () => {
    const me = await createDemoMembersRepo("member").getMe();
    expect(me?.userId).toBe("demo-member");
    expect(me?.role).toBe("member");
  });
});

describe("demo listMembers", () => {
  it("lists every member oldest first", async () => {
    const members = await createDemoMembersRepo().listMembers();
    expect(members.map((member) => member.userId)).toEqual([
      "demo-owner",
      "demo-partner",
      "demo-member",
      "demo-noel",
    ]);
    expect(members[1]?.displayName).toBe("Miguel Santos");
    expect(members[3]?.status).toBe("suspended");
  });

  it("hands out copies, so a caller cannot edit the store", async () => {
    const repo = createDemoMembersRepo();
    const members = await repo.listMembers();
    const first = members[0];
    expect(first).toBeDefined();
    if (first) first.displayName = "Changed";
    const again = await repo.listMembers();
    expect(again[0]?.displayName).toBe("Ana Reyes");
  });
});

describe("demo listMembersWithEmail", () => {
  it("gives an owner every email", async () => {
    const members = await createDemoMembersRepo().listMembersWithEmail();
    expect(members).toHaveLength(4);
    expect(members[0]?.email).toBe("ana.reyes@teeline.test");
  });

  it("refuses a member with the owner-only error", async () => {
    const repo = createDemoMembersRepo("member");
    await expect(repo.listMembersWithEmail()).rejects.toSatisfy(
      (error: unknown) => mapMemberError(error) === "Only an owner can do that.",
    );
  });

  it("refuses a partner too", async () => {
    const repo = createDemoMembersRepo("partner");
    await expect(repo.listMembersWithEmail()).rejects.toSatisfy(
      (error: unknown) => mapMemberError(error) === "Only an owner can do that.",
    );
  });
});

describe("demo addMember", () => {
  it("adds an account that already exists and is not a member", async () => {
    const repo = createDemoMembersRepo();
    const userId = await repo.addMember({
      email: "rosa.diaz@teeline.test",
      role: "partner",
      displayName: "Rosa Diaz",
    });

    expect(userId).toBe("demo-rosa");
    const members = await repo.listMembers();
    const added = members.find((member) => member.userId === "demo-rosa");
    expect(added).toEqual({
      userId: "demo-rosa",
      role: "partner",
      status: "active",
      displayName: "Rosa Diaz",
      createdAt: expect.any(String) as unknown as string,
    });
    expect(members[members.length - 1]?.userId).toBe("demo-rosa");
  });

  it("matches the email without caring about case or spaces", async () => {
    const repo = createDemoMembersRepo();
    await expect(
      repo.addMember({
        email: "  ROSA.DIAZ@teeline.test ",
        role: "member",
        displayName: "Rosa Diaz",
      }),
    ).resolves.toBe("demo-rosa");
  });

  it("reports an email with no account", async () => {
    const repo = createDemoMembersRepo();
    await expect(
      repo.addMember({
        email: "nobody@teeline.test",
        role: "member",
        displayName: "Nobody",
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        mapMemberError(error) ===
        "No account has that email address. Create the account in Supabase first, then add them here.",
    );
  });

  it("reports someone who is already a member", async () => {
    const repo = createDemoMembersRepo();
    await expect(
      repo.addMember({
        email: "grace.lim@teeline.test",
        role: "member",
        displayName: "Grace Lim",
      }),
    ).rejects.toSatisfy(
      (error: unknown) => mapMemberError(error) === "That person is already a member.",
    );
  });

  it("refuses a non-owner", async () => {
    const repo = createDemoMembersRepo("member");
    await expect(
      repo.addMember({
        email: "rosa.diaz@teeline.test",
        role: "member",
        displayName: "Rosa Diaz",
      }),
    ).rejects.toSatisfy((error: unknown) => mapMemberError(error) === "Only an owner can do that.");
  });
});

describe("demo setRole", () => {
  const find = (members: Member[], userId: string): Member | undefined =>
    members.find((member) => member.userId === userId);

  it("lets an owner change a role", async () => {
    const repo = createDemoMembersRepo();
    await repo.setRole("demo-member", "partner");
    const members = await repo.listMembers();
    expect(find(members, "demo-member")?.role).toBe("partner");
  });

  it("refuses a non-owner", async () => {
    const repo = createDemoMembersRepo("partner");
    await expect(repo.setRole("demo-member", "owner")).rejects.toSatisfy(
      (error: unknown) => mapMemberError(error) === "Only an owner can do that.",
    );
  });

  it("refuses to demote the last active owner", async () => {
    const repo = createDemoMembersRepo();
    await expect(repo.setRole("demo-owner", "member")).rejects.toSatisfy(
      (error: unknown) =>
        mapMemberError(error) === "The workspace needs at least one active owner.",
    );
  });

  it("allows demoting an owner once another active owner exists", async () => {
    const repo = createDemoMembersRepo();
    await repo.setRole("demo-member", "owner");
    await expect(repo.setRole("demo-owner", "member")).resolves.toBeUndefined();
    const members = await repo.listMembers();
    expect(find(members, "demo-owner")?.role).toBe("member");
  });
});

describe("demo setStatus", () => {
  it("suspends and reactivates a member", async () => {
    const repo = createDemoMembersRepo();
    await repo.setStatus("demo-member", "suspended");
    let members = await repo.listMembers();
    expect(members.find((member) => member.userId === "demo-member")?.status).toBe("suspended");

    await repo.setStatus("demo-member", "active");
    members = await repo.listMembers();
    expect(members.find((member) => member.userId === "demo-member")?.status).toBe("active");
  });

  it("refuses to suspend the last active owner", async () => {
    const repo = createDemoMembersRepo();
    await expect(repo.setStatus("demo-owner", "suspended")).rejects.toSatisfy(
      (error: unknown) =>
        mapMemberError(error) === "The workspace needs at least one active owner.",
    );
  });

  it("refuses a non-owner", async () => {
    const repo = createDemoMembersRepo("member");
    await expect(repo.setStatus("demo-partner", "suspended")).rejects.toSatisfy(
      (error: unknown) => mapMemberError(error) === "Only an owner can do that.",
    );
  });
});

describe("demo removeMember", () => {
  it("removes a member", async () => {
    const repo = createDemoMembersRepo();
    await repo.removeMember("demo-noel");
    const members = await repo.listMembers();
    expect(members.some((member) => member.userId === "demo-noel")).toBe(false);
  });

  it("refuses to remove the last active owner", async () => {
    const repo = createDemoMembersRepo();
    await expect(repo.removeMember("demo-owner")).rejects.toSatisfy(
      (error: unknown) =>
        mapMemberError(error) === "The workspace needs at least one active owner.",
    );
  });

  it("removes the viewer's own row once another owner exists", async () => {
    const repo = createDemoMembersRepo();
    await repo.setRole("demo-member", "owner");
    await repo.removeMember("demo-owner");
    await expect(repo.getMe()).resolves.toBeNull();
  });
});

describe("demo updateMyDisplayName", () => {
  it("changes the viewer's own name", async () => {
    const repo = createDemoMembersRepo("member");
    await repo.updateMyDisplayName("  Grace L.  ");
    const me = await repo.getMe();
    expect(me?.displayName).toBe("Grace L.");
  });

  it("refuses an empty name", async () => {
    const repo = createDemoMembersRepo();
    await expect(repo.updateMyDisplayName("   ")).rejects.toThrow("Enter a display name.");
  });

  it("refuses a name over 80 characters", async () => {
    const repo = createDemoMembersRepo();
    await expect(repo.updateMyDisplayName("a".repeat(81))).rejects.toThrow(
      "Use 80 characters or fewer.",
    );
  });
});
