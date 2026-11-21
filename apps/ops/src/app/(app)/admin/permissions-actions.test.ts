import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  createGateway: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/gate", () => ({
  requireOwner: mocks.requireOwner,
  adminErrorMessage: (error: unknown) =>
    error instanceof Error && error.message.trim() !== ""
      ? error.message
      : "Something went wrong. Try again.",
}));
vi.mock("@/lib/access/repo", () => ({ createAccessGateway: mocks.createGateway }));

const { loadPermissionsAction, setRolePermissionAction, setUserPermissionAction } = await import(
  "./permissions-actions"
);

const gateway = {
  myAccess: vi.fn(),
  matrix: vi.fn(),
  setRolePermission: vi.fn(),
  setUserPermission: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOwner.mockResolvedValue({});
  mocks.createGateway.mockReturnValue(gateway);
  gateway.setRolePermission.mockResolvedValue(undefined);
  gateway.setUserPermission.mockResolvedValue(undefined);
});

describe("setRolePermissionAction", () => {
  it("refuses to lower the owner before it calls the database", async () => {
    const result = await setRolePermissionAction("owner", "documents", "none", "trying it out");

    expect(result.ok).toBe(false);
    expect(result.message).toContain("owner");
    expect(gateway.setRolePermission).not.toHaveBeenCalled();
  });

  it("refuses a short reason", async () => {
    const result = await setRolePermissionAction("member", "documents", "view", "no");

    expect(result.ok).toBe(false);
    expect(result.message).toContain("reason");
    expect(gateway.setRolePermission).not.toHaveBeenCalled();
  });

  it("refuses an unknown page or level", async () => {
    expect((await setRolePermissionAction("member", "desk.draw", "view", "short reason")).ok).toBe(
      false,
    );
    expect(
      (await setRolePermissionAction("member", "documents", "write" as never, "short reason")).ok,
    ).toBe(false);
    expect(gateway.setRolePermission).not.toHaveBeenCalled();
  });

  it("saves a valid change with the reason and revalidates Admin", async () => {
    const result = await setRolePermissionAction("member", "pipeline", "edit", "the draw needs it");

    expect(result).toEqual({ ok: true, message: "Role permissions saved." });
    expect(gateway.setRolePermission).toHaveBeenCalledWith(
      "member",
      "pipeline",
      "edit",
      "the draw needs it",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/permissions");
  });

  it("reports a refusal from the owner gate without calling the database", async () => {
    mocks.requireOwner.mockRejectedValue(new Error("Only a workspace owner can open Admin."));

    const result = await setRolePermissionAction("member", "pipeline", "edit", "the draw needs it");

    expect(result.ok).toBe(false);
    expect(result.message).toContain("owner");
    expect(gateway.setRolePermission).not.toHaveBeenCalled();
  });

  it("reports a database refusal as a message", async () => {
    gateway.setRolePermission.mockRejectedValue(new Error("the workspace is read only"));

    const result = await setRolePermissionAction("member", "pipeline", "view", "a real reason");

    expect(result).toEqual({ ok: false, message: "the workspace is read only" });
  });
});

describe("setUserPermissionAction", () => {
  it("needs a person and a known page", async () => {
    expect((await setUserPermissionAction("", "documents", "view", "a real reason")).ok).toBe(
      false,
    );
    expect((await setUserPermissionAction("user-1", "nowhere", "view", "a real reason")).ok).toBe(
      false,
    );
    expect(gateway.setUserPermission).not.toHaveBeenCalled();
  });

  it("clears an override with a null level", async () => {
    const result = await setUserPermissionAction(
      "user-1",
      "documents",
      null,
      "back on the role default",
    );

    expect(result).toEqual({ ok: true, message: "Back on the role default." });
    expect(gateway.setUserPermission).toHaveBeenCalledWith(
      "user-1",
      "documents",
      null,
      "back on the role default",
    );
  });

  it("saves an override", async () => {
    const result = await setUserPermissionAction(
      "user-1",
      "documents",
      "none",
      "they left the team",
    );

    expect(result).toEqual({ ok: true, message: "Access saved." });
    expect(gateway.setUserPermission).toHaveBeenCalledWith(
      "user-1",
      "documents",
      "none",
      "they left the team",
    );
  });
});

describe("loadPermissionsAction", () => {
  it("returns the matrix", async () => {
    gateway.matrix.mockResolvedValue({ roles: [], overrides: [] });

    await expect(loadPermissionsAction()).resolves.toEqual({
      ok: true,
      matrix: { roles: [], overrides: [] },
    });
  });

  it("turns a failure into a message", async () => {
    gateway.matrix.mockRejectedValue(new Error("the migration has not been applied"));

    const result = await loadPermissionsAction();
    expect(result).toEqual({ ok: false, message: "the migration has not been applied" });
  });
});
