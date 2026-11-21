import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_ONLY_MESSAGE, REASON_REQUIRED } from "@/lib/admin/rules";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  bulkSuspendAction,
  inviteAction,
  listAccountsAction,
  setTabulatorAction,
  setWorkspaceRoleAction,
  suspendAction,
} from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: "ops.example.test" })),
}));
vi.mock("@/lib/supabase/server", () => ({ getServerSupabase: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ getServiceRoleSupabase: () => null }));

const supabaseMock = vi.mocked(getServerSupabase);

type Call = { name: string; args?: Record<string, unknown> };

function fakeClient(owner: boolean): { client: unknown; calls: Call[] } {
  const calls: Call[] = [];
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === "ws_has_role") return { data: owner, error: null };
    if (name === "god_list_accounts") return { data: [], error: null };
    return { data: null, error: null };
  });
  return { client: { rpc, auth: {} }, calls };
}

function use(owner: boolean): { calls: Call[] } {
  const { client, calls } = fakeClient(owner);
  supabaseMock.mockResolvedValue(client as never);
  return { calls };
}

beforeEach(() => {
  supabaseMock.mockReset();
});

describe("the owner gate in the server actions", () => {
  it("refuses every action before it reaches the god_* functions", async () => {
    const { calls } = use(false);

    const role = await setWorkspaceRoleAction("u1", "member", "");
    expect(role).toEqual({ ok: false, message: OWNER_ONLY_MESSAGE });

    const suspended = await suspendAction("u1", ["workspace"], "left the club");
    expect(suspended.ok).toBe(false);

    const listed = await listAccountsAction();
    expect(listed).toEqual({ ok: false, message: OWNER_ONLY_MESSAGE });

    expect(calls.every((call) => call.name === "ws_has_role")).toBe(true);
  });

  it("runs the workspace role change for an owner and audits through the function", async () => {
    const { calls } = use(true);

    const result = await setWorkspaceRoleAction("u1", "partner", "promoted");

    expect(result).toEqual({ ok: true, message: "Workspace role saved." });
    expect(calls.map((call) => call.name)).toEqual(["ws_has_role", "god_set_workspace_role"]);
    expect(calls[1]?.args).toEqual({
      p_user: "u1",
      p_role: "partner",
      p_reason: "promoted",
    });
  });

  it("needs a reason before it removes workspace access", async () => {
    const { calls } = use(true);

    const result = await setWorkspaceRoleAction("u1", "none", "no");

    expect(result).toEqual({ ok: false, message: REASON_REQUIRED });
    expect(calls.map((call) => call.name)).toEqual(["ws_has_role"]);
  });

  it("needs a reason and at least one app before it suspends", async () => {
    const { calls } = use(true);

    expect((await suspendAction("u1", ["workspace"], "no")).ok).toBe(false);
    expect((await suspendAction("u1", [], "left the club")).ok).toBe(false);
    expect(calls.map((call) => call.name)).toEqual(["ws_has_role", "ws_has_role"]);
  });
});

describe("controls that need the service-role key", () => {
  it("says so for invite and for the tabulator switch", async () => {
    use(true);

    const invited = await inviteAction({
      email: "new.person@example.test",
      displayName: "New Person",
      workspaceRole: "member",
      deskClubId: null,
      deskRole: "none",
      tabulator: false,
      note: "",
    });
    expect(invited.ok).toBe(false);
    expect(invited.message).toContain("service-role key");

    const tabulator = await setTabulatorAction("u1", true, "");
    expect(tabulator.ok).toBe(false);
    expect(tabulator.message).toContain("service-role key");
  });
});

describe("bulk actions", () => {
  it("refuses an empty selection", async () => {
    use(true);

    const result = await bulkSuspendAction([], ["workspace"], "left the club");
    expect(result).toEqual({
      ok: false,
      message: "Choose at least one account.",
      succeeded: 0,
      failures: [],
    });
  });

  it("runs the single action for each selected account and reports the count", async () => {
    const { calls } = use(true);

    const result = await bulkSuspendAction(
      ["u1", "u2", "u2"],
      ["workspace", "desk"],
      "left the club",
    );

    expect(result.ok).toBe(true);
    expect(result.succeeded).toBe(2);
    expect(calls.filter((call) => call.name === "god_suspend")).toHaveLength(2);
  });
});
