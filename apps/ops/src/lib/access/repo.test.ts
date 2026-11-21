import { describe, expect, it, vi } from "vitest";
import {
  type AccessClient,
  createAccessGateway,
  knownOverrides,
  mapAccessRow,
  mapMatrix,
} from "./repo";

function client(responses: Record<string, { data: unknown; error?: unknown }>) {
  const rpc = vi.fn(async (name: string) => {
    const response = responses[name] ?? { data: null };
    return { data: response.data, error: (response.error as never) ?? null };
  });
  return { rpc } as unknown as AccessClient & { rpc: typeof rpc };
}

describe("mapAccessRow", () => {
  it("keeps a known page and level", () => {
    expect(mapAccessRow({ page: "documents", level: "edit" })).toEqual({
      page: "documents",
      level: "edit",
    });
  });

  it("drops a row with an unknown level, a missing page or the wrong shape", () => {
    expect(mapAccessRow({ page: "documents", level: "write" })).toBeNull();
    expect(mapAccessRow({ level: "edit" })).toBeNull();
    expect(mapAccessRow("documents")).toBeNull();
  });
});

describe("mapMatrix", () => {
  it("reads the jsonb the function returns", () => {
    const matrix = mapMatrix({
      roles: [{ role: "member", page: "pipeline", level: "view" }],
      overrides: [{ userId: "user-1", page: "documents", level: "none" }],
    });

    expect(matrix.roles).toEqual([{ role: "member", page: "pipeline", level: "view" }]);
    expect(matrix.overrides).toEqual([{ userId: "user-1", page: "documents", level: "none" }]);
  });

  it("returns empty lists for anything unexpected", () => {
    expect(mapMatrix(null)).toEqual({ roles: [], overrides: [] });
    expect(mapMatrix({ roles: "nope", overrides: [{ userId: 1 }] })).toEqual({
      roles: [],
      overrides: [],
    });
  });

  it("hides an override for a page the registry does not know", () => {
    const matrix = mapMatrix({
      overrides: [
        { userId: "user-1", page: "documents", level: "view" },
        { userId: "user-1", page: "desk.draw", level: "edit" },
      ],
    });

    expect(knownOverrides(matrix)).toEqual([
      { userId: "user-1", page: "documents", level: "view" },
    ]);
  });
});

describe("createAccessGateway", () => {
  it("calls ws_my_access and maps the rows", async () => {
    const api = client({
      ws_my_access: {
        data: [
          { page: "documents", level: "edit" },
          { page: "admin", level: "none" },
        ],
      },
    });

    const rows = await createAccessGateway(api).myAccess();
    expect(api.rpc).toHaveBeenCalledWith("ws_my_access", undefined);
    expect(rows).toHaveLength(2);
  });

  it("sends the role matrix change with its reason", async () => {
    const api = client({ ws_set_role_permission: { data: null } });

    await createAccessGateway(api).setRolePermission(
      "member",
      "pipeline",
      "edit",
      "  needed for the draw  ",
    );

    expect(api.rpc).toHaveBeenCalledWith("ws_set_role_permission", {
      p_role: "member",
      p_page: "pipeline",
      p_level: "edit",
      p_reason: "needed for the draw",
    });
  });

  it("sends a null level to clear an override", async () => {
    const api = client({ ws_set_user_permission: { data: null } });

    await createAccessGateway(api).setUserPermission("user-1", "documents", null, "back to role");

    expect(api.rpc).toHaveBeenCalledWith("ws_set_user_permission", {
      p_user: "user-1",
      p_page: "documents",
      p_level: null,
      p_reason: "back to role",
    });
  });

  it("throws the database error with its code", async () => {
    const api = client({
      ws_permission_matrix: {
        data: null,
        error: { message: "Only a workspace owner can do that.", code: "42501" },
      },
    });

    await expect(createAccessGateway(api).matrix()).rejects.toMatchObject({
      message: "Only a workspace owner can do that.",
      code: "42501",
    });
  });
});
