import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleAccess } from "./pages";

const mocks = vi.hoisted(() => ({
  demoMode: vi.fn(() => false),
  getServerSupabase: vi.fn(),
  getViewer: vi.fn(),
}));

vi.mock("@/lib/flags", () => ({ demoMode: mocks.demoMode }));
vi.mock("@/lib/supabase/server", () => ({ getServerSupabase: mocks.getServerSupabase }));
vi.mock("@/lib/auth/viewer", () => ({ getViewer: mocks.getViewer }));

const { currentAccess, loadAccess, loadPermissionMatrix, requireAccess } = await import("./server");

function sessionClient(rpc: (name: string) => { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async (name: string) => rpc(name)) };
}

beforeEach(() => {
  mocks.demoMode.mockReset();
  mocks.demoMode.mockReturnValue(false);
  mocks.getServerSupabase.mockReset();
  mocks.getViewer.mockReset();
});

describe("loadAccess", () => {
  it("gives the demo owner everything without touching the database", async () => {
    mocks.demoMode.mockReturnValue(true);
    expect(await loadAccess("member")).toEqual(roleAccess("owner"));
    expect(mocks.getServerSupabase).not.toHaveBeenCalled();
  });

  it("uses the database's answer, keeping the role default for a page it did not mention", async () => {
    mocks.getServerSupabase.mockResolvedValue(
      sessionClient(() => ({
        data: [
          { page: "documents", level: "none" },
          { page: "pipeline", level: "edit" },
        ],
        error: null,
      })),
    );

    const access = await loadAccess("member");
    expect(access.documents).toBe("none");
    expect(access.pipeline).toBe("edit");
    expect(access.tasks).toBe("edit");
    expect(access.admin).toBe("none");
  });

  it("falls back to the role defaults when the function does not exist yet", async () => {
    mocks.getServerSupabase.mockResolvedValue(
      sessionClient(() => ({
        data: null,
        error: { message: "Could not find the function public.ws_my_access", code: "PGRST202" },
      })),
    );

    expect(await loadAccess("partner")).toEqual(roleAccess("partner"));
  });

  it("falls back rather than locking anyone out when the client cannot be built", async () => {
    mocks.getServerSupabase.mockRejectedValue(new Error("no configuration"));
    expect(await loadAccess("member")).toEqual(roleAccess("member"));
  });
});

describe("currentAccess", () => {
  it("gives a person with no active member row nothing", async () => {
    mocks.getViewer.mockResolvedValue(null);
    expect(await currentAccess()).toEqual({});
  });

  it("reads the access of an active member", async () => {
    mocks.getViewer.mockResolvedValue({
      user: { id: "user-1" },
      member: { role: "partner", status: "active", display_name: "Pat" },
    });
    mocks.getServerSupabase.mockResolvedValue(
      sessionClient(() => ({ data: [{ page: "documents", level: "view" }], error: null })),
    );

    const access = await currentAccess();
    expect(access.documents).toBe("view");
    expect(access.admin).toBe("none");
  });
});

describe("requireAccess", () => {
  it("passes for a page the person can open", async () => {
    mocks.getViewer.mockResolvedValue({
      user: { id: "user-1" },
      member: { role: "member", status: "active", display_name: "Mo" },
    });
    mocks.getServerSupabase.mockRejectedValue(new Error("no configuration"));

    await expect(requireAccess("documents", "edit")).resolves.toBeUndefined();
  });

  it("refuses a page the person cannot see with a plain sentence", async () => {
    mocks.getViewer.mockResolvedValue({
      user: { id: "user-1" },
      member: { role: "member", status: "active", display_name: "Mo" },
    });
    mocks.getServerSupabase.mockRejectedValue(new Error("no configuration"));

    await expect(requireAccess("admin")).rejects.toThrow("You do not have access to that page.");
  });

  it("says view-only when the person has view and the action needs edit", async () => {
    mocks.getViewer.mockResolvedValue({
      user: { id: "user-1" },
      member: { role: "member", status: "active", display_name: "Mo" },
    });
    mocks.getServerSupabase.mockRejectedValue(new Error("no configuration"));

    await expect(requireAccess("pipeline", "edit")).rejects.toThrow(
      "You have view-only access to that page.",
    );
  });
});

describe("loadPermissionMatrix", () => {
  it("returns the matrix the function sent", async () => {
    mocks.getServerSupabase.mockResolvedValue(
      sessionClient(() => ({
        data: {
          roles: [{ role: "owner", page: "overview", level: "edit" }],
          overrides: [],
        },
        error: null,
      })),
    );

    const result = await loadPermissionMatrix();
    expect(result).toEqual({
      ok: true,
      matrix: {
        roles: [{ role: "owner", page: "overview", level: "edit" }],
        overrides: [],
      },
    });
  });

  it("reports a refusal as a message, never as a crash", async () => {
    mocks.getServerSupabase.mockResolvedValue(
      sessionClient(() => ({
        data: null,
        error: { message: "Only a workspace owner can do that.", code: "42501" },
      })),
    );

    const result = await loadPermissionMatrix();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("owner");
  });
});
