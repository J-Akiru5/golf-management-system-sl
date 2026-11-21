import { describe, expect, it, vi } from "vitest";
import { createAdminGateway, mapAccountRow, mapAuditRow } from "./repo";

const ACCOUNT_ROW = {
  user_id: "9b2f0000-0000-0000-0000-000000000001",
  email: "ana.reyes@example.test",
  display_name: "Ana Reyes",
  account_created_at: "2026-10-01T08:00:00.000Z",
  last_sign_in_at: "2026-11-20T08:00:00.000Z",
  last_active_at: "2026-11-20T09:00:00.000Z",
  email_confirmed: true,
  invited_pending: false,
  banned: false,
  workspace_role: "owner",
  workspace_status: "active",
  desk_roles: [{ clubId: "c1", clubName: "IGCC", role: "organizer" }],
  tabulator: false,
  player_name: null,
  suspended: false,
  suspended_at: null,
  suspended_reason: null,
};

describe("mapAccountRow", () => {
  it("maps the snake_case row to the screen shape", () => {
    expect(mapAccountRow(ACCOUNT_ROW)).toEqual({
      userId: ACCOUNT_ROW.user_id,
      email: "ana.reyes@example.test",
      displayName: "Ana Reyes",
      accountCreatedAt: "2026-10-01T08:00:00.000Z",
      lastSignInAt: "2026-11-20T08:00:00.000Z",
      lastActiveAt: "2026-11-20T09:00:00.000Z",
      emailConfirmed: true,
      invitedPending: false,
      banned: false,
      workspaceRole: "owner",
      workspaceStatus: "active",
      deskRoles: [{ clubId: "c1", clubName: "IGCC", role: "organizer" }],
      tabulator: false,
      playerName: null,
      suspended: false,
      suspendedAt: null,
      suspendedReason: null,
    });
  });

  it("drops a row without an id rather than inventing one", () => {
    expect(mapAccountRow({ email: "nobody@example.test" })).toBeNull();
    expect(mapAccountRow(null)).toBeNull();
  });

  it("falls back to the email for a missing display name", () => {
    expect(mapAccountRow({ ...ACCOUNT_ROW, display_name: null })?.displayName).toBe(
      "ana.reyes@example.test",
    );
  });
});

describe("mapAuditRow", () => {
  it("maps a log row and keeps the details object", () => {
    expect(
      mapAuditRow({
        id: 12,
        at: "2026-11-21T10:00:00.000Z",
        actor: "a1",
        actor_email: "owner@example.test",
        target: "u1",
        target_email: "ana@example.test",
        action: "suspend",
        details: { apps: ["workspace"] },
        reason: "left the club",
      }),
    ).toEqual({
      id: 12,
      at: "2026-11-21T10:00:00.000Z",
      actorId: "a1",
      actorEmail: "owner@example.test",
      targetId: "u1",
      targetEmail: "ana@example.test",
      action: "suspend",
      details: { apps: ["workspace"] },
      reason: "left the club",
    });
  });

  it("drops a row without a time or an action", () => {
    expect(mapAuditRow({ id: 1, at: null, action: "suspend" })).toBeNull();
    expect(mapAuditRow({ id: 1, at: "2026-01-01T00:00:00.000Z" })).toBeNull();
  });
});

describe("createAdminGateway", () => {
  it("calls the named functions with the arguments the migration expects", async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: name === "god_list_accounts" ? [ACCOUNT_ROW] : [], error: null };
    });
    const gateway = createAdminGateway({ rpc });

    const accounts = await gateway.listAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.userId).toBe(ACCOUNT_ROW.user_id);

    await gateway.setWorkspaceRole("u1", "none", "  removed at their request  ");
    await gateway.setDeskRole("u1", "c1", "desk", "");
    await gateway.suspend("u1", ["workspace", "desk"], "left the club");
    await gateway.restore("u1", null);
    await gateway.signOutEverywhere("u1", "lost phone");
    await gateway.record("u1", "invite", { email: "a@b.test" }, null);

    expect(calls.map((call) => call.name)).toEqual([
      "god_list_accounts",
      "god_set_workspace_role",
      "god_set_desk_role",
      "god_suspend",
      "god_restore",
      "god_sign_out",
      "god_record",
    ]);
    expect(calls[1]?.args).toEqual({
      p_user: "u1",
      p_role: "none",
      p_reason: "removed at their request",
    });
    expect(calls[2]?.args).toEqual({ p_user: "u1", p_club: "c1", p_role: "desk", p_reason: null });
    expect(calls[3]?.args).toEqual({
      p_user: "u1",
      p_apps: ["workspace", "desk"],
      p_reason: "left the club",
    });
  });

  it("raises the database code so the action can map it", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "Only a workspace owner can do that.", code: "42501" },
    }));
    const gateway = createAdminGateway({ rpc });

    await expect(gateway.listAccounts()).rejects.toMatchObject({ code: "42501" });
  });
});
