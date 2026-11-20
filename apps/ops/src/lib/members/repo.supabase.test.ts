import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database, WorkspaceMemberStatus, WorkspaceRole } from "@/lib/db/types";
import { mapMemberError } from "./errors";
import { createSupabaseMembersRepo } from "./repo";

/**
 * A small stand-in for the Supabase client. It keeps rows in memory and answers the calls the
 * repository makes, so the Supabase implementation is exercised without a project: column mapping,
 * the arguments handed to the two owner-only functions, and how a database error is re-thrown.
 */
type Row = {
  user_id: string;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  display_name: string;
  created_at: string;
};

type FakeError = { code?: string; message: string };

type FakeResult = { data: unknown; error: FakeError | null };

const ROWS: Row[] = [
  {
    user_id: "u-ana",
    role: "owner",
    status: "active",
    display_name: "Ana Reyes",
    created_at: "2026-09-02T08:00:00.000Z",
  },
  {
    user_id: "u-grace",
    role: "member",
    status: "active",
    display_name: "Grace Lim",
    created_at: "2026-10-05T08:00:00.000Z",
  },
];

class FakeQuery {
  private filters: Array<{ column: string; value: unknown }> = [];
  private orderBy: string | null = null;
  private patch: Partial<Row> | null = null;
  private mode: "select" | "update" | "delete" = "select";
  private returning = false;
  /** When set, update and delete behave as if row level security refused them: zero rows. */
  public refuse = false;

  constructor(
    private rows: Row[],
    private fail: FakeError | null,
  ) {}

  select() {
    if (this.mode !== "select") this.returning = true;
    return this;
  }

  update(patch: Partial<Row>) {
    this.mode = "update";
    this.patch = patch;
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  order(column: string) {
    this.orderBy = column;
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.run(true));
  }

  then(
    onFulfilled: (value: FakeResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ): Promise<unknown> {
    return Promise.resolve(this.run(false)).then(onFulfilled, onRejected);
  }

  private matches(row: Row): boolean {
    return this.filters.every(
      (filter) => (row as unknown as Record<string, unknown>)[filter.column] === filter.value,
    );
  }

  private run(single: boolean): FakeResult {
    if (this.fail) return { data: null, error: this.fail };

    if (this.mode === "select") {
      let found = this.rows.filter((row) => this.matches(row));
      if (this.orderBy) {
        const key = this.orderBy;
        found = [...found].sort((a, b) =>
          String((a as unknown as Record<string, unknown>)[key]).localeCompare(
            String((b as unknown as Record<string, unknown>)[key]),
          ),
        );
      }
      return { data: single ? (found[0] ?? null) : found, error: null };
    }

    const hit = this.refuse ? [] : this.rows.filter((row) => this.matches(row));

    if (this.mode === "update") {
      for (const row of hit) Object.assign(row, this.patch);
      return {
        data: this.returning ? hit.map((row) => ({ user_id: row.user_id })) : null,
        error: null,
      };
    }

    const keep = this.rows.filter((row) => !hit.includes(row));
    this.rows.length = 0;
    this.rows.push(...keep);
    return {
      data: this.returning ? hit.map((row) => ({ user_id: row.user_id })) : null,
      error: null,
    };
  }
}

function fakeClient(
  options: {
    user?: { id: string; email: string | null } | null;
    fail?: FakeError;
    refuse?: boolean;
  } = {},
) {
  const rows = ROWS.map((row) => ({ ...row }));
  const user =
    options.user === undefined ? { id: "u-ana", email: "ana.reyes@teeline.test" } : options.user;
  const fail = options.fail ?? null;
  const rpcCalls: Array<{ name: string; args?: Record<string, unknown> }> = [];

  const client = {
    rows,
    rpcCalls,
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from: () => {
      const query = new FakeQuery(rows, fail);
      query.refuse = options.refuse ?? false;
      return query;
    },
    rpc: async (name: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (fail) return { data: null, error: fail };
      if (name === "ws_list_members") {
        return {
          data: rows.map((row) => ({ ...row, email: `${row.user_id}@teeline.test` })),
          error: null,
        };
      }
      if (name === "ws_add_member") return { data: "u-new", error: null };
      return { data: null, error: { message: `Unexpected call ${name}` } };
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, rows, rpcCalls };
}

describe("Supabase members repo", () => {
  it("reads the signed-in person with their own email", async () => {
    const { client } = fakeClient();
    const me = await createSupabaseMembersRepo(client).getMe();
    expect(me).toEqual({
      userId: "u-ana",
      role: "owner",
      status: "active",
      displayName: "Ana Reyes",
      createdAt: "2026-09-02T08:00:00.000Z",
      email: "ana.reyes@teeline.test",
    });
  });

  it("returns null with no session", async () => {
    const { client } = fakeClient({ user: null });
    await expect(createSupabaseMembersRepo(client).getMe()).resolves.toBeNull();
  });

  it("maps rows to camelCase, oldest first", async () => {
    const { client } = fakeClient();
    const members = await createSupabaseMembersRepo(client).listMembers();
    expect(members).toHaveLength(2);
    expect(members[0]).toEqual({
      userId: "u-ana",
      role: "owner",
      status: "active",
      displayName: "Ana Reyes",
      createdAt: "2026-09-02T08:00:00.000Z",
    });
    expect(members[1]?.displayName).toBe("Grace Lim");
  });

  it("maps the owner-only member list, including emails", async () => {
    const { client, rpcCalls } = fakeClient();
    const members = await createSupabaseMembersRepo(client).listMembersWithEmail();
    expect(rpcCalls[0]?.name).toBe("ws_list_members");
    expect(members[1]?.email).toBe("u-grace@teeline.test");
  });

  it("adds a member through the owner-only function and returns the id", async () => {
    const { client, rpcCalls } = fakeClient();
    const id = await createSupabaseMembersRepo(client).addMember({
      email: "  rosa.diaz@teeline.test  ",
      role: "partner",
      displayName: "  Rosa Diaz ",
    });
    expect(id).toBe("u-new");
    expect(rpcCalls[0]).toEqual({
      name: "ws_add_member",
      args: {
        p_email: "rosa.diaz@teeline.test",
        p_role: "partner",
        p_display_name: "Rosa Diaz",
      },
    });
  });

  it("updates a role on the named row", async () => {
    const { client, rows } = fakeClient();
    await createSupabaseMembersRepo(client).setRole("u-grace", "partner");
    expect(rows.find((row) => row.user_id === "u-grace")?.role).toBe("partner");
  });

  it("updates a status on the named row", async () => {
    const { client, rows } = fakeClient();
    await createSupabaseMembersRepo(client).setStatus("u-grace", "suspended");
    expect(rows.find((row) => row.user_id === "u-grace")?.status).toBe("suspended");
  });

  it("removes the named row", async () => {
    const { client, rows } = fakeClient();
    await createSupabaseMembersRepo(client).removeMember("u-grace");
    expect(rows.map((row) => row.user_id)).toEqual(["u-ana"]);
  });

  it("trims the display name and updates the signed-in row", async () => {
    const { client, rows } = fakeClient();
    await createSupabaseMembersRepo(client).updateMyDisplayName("  Ana R.  ");
    expect(rows.find((row) => row.user_id === "u-ana")?.display_name).toBe("Ana R.");
  });
});

describe("Supabase members repo when row level security refuses a change", () => {
  it("throws instead of reporting a role change that changed nothing", async () => {
    const { client, rows } = fakeClient({ refuse: true });
    const repo = createSupabaseMembersRepo(client);
    await expect(repo.setRole("u-grace", "partner")).rejects.toThrow("No row was changed.");
    expect(rows.find((row) => row.user_id === "u-grace")?.role).toBe("member");
  });

  it("throws for a refused status change, removal and display name update", async () => {
    const { client, rows } = fakeClient({ refuse: true });
    const repo = createSupabaseMembersRepo(client);
    await expect(repo.setStatus("u-grace", "suspended")).rejects.toThrow("No row was changed.");
    await expect(repo.removeMember("u-grace")).rejects.toThrow("No row was changed.");
    await expect(repo.updateMyDisplayName("Ana R.")).rejects.toThrow("No row was changed.");
    expect(rows).toHaveLength(2);
  });

  it("a refused change reads as the generic sentence, never as success", async () => {
    const { client } = fakeClient({ refuse: true });
    const repo = createSupabaseMembersRepo(client);
    await expect(repo.setRole("u-grace", "partner")).rejects.toSatisfy(
      (error) => mapMemberError(error) === "Something went wrong. Nothing was changed.",
    );
  });
});

describe("Supabase members repo error mapping", () => {
  it("carries 42501 from a refused read", async () => {
    const { client } = fakeClient({ fail: { code: "42501", message: "permission denied" } });
    const repo = createSupabaseMembersRepo(client);
    await expect(repo.listMembersWithEmail()).rejects.toSatisfy(
      (error: unknown) => mapMemberError(error) === "Only an owner can do that.",
    );
  });

  it("carries P0002 from a missing account", async () => {
    const { client } = fakeClient({ fail: { code: "P0002", message: "no account" } });
    const repo = createSupabaseMembersRepo(client);
    await expect(
      repo.addMember({ email: "nobody@teeline.test", role: "member", displayName: "Nobody" }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        mapMemberError(error) ===
        "No account has that email address. Create the account in Supabase first, then add them here.",
    );
  });

  it("carries 23505 from a duplicate member", async () => {
    const { client } = fakeClient({ fail: { code: "23505", message: "duplicate key" } });
    const repo = createSupabaseMembersRepo(client);
    await expect(
      repo.addMember({ email: "grace.lim@teeline.test", role: "member", displayName: "Grace Lim" }),
    ).rejects.toSatisfy(
      (error: unknown) => mapMemberError(error) === "That person is already a member.",
    );
  });

  it("carries 23514 from the last-owner rule on a change", async () => {
    const { client } = fakeClient({
      fail: { code: "23514", message: "the workspace needs at least one active owner" },
    });
    const repo = createSupabaseMembersRepo(client);
    await expect(repo.setRole("u-ana", "member")).rejects.toSatisfy(
      (error: unknown) =>
        mapMemberError(error) === "The workspace needs at least one active owner.",
    );
    await expect(repo.setStatus("u-ana", "suspended")).rejects.toSatisfy(
      (error: unknown) =>
        mapMemberError(error) === "The workspace needs at least one active owner.",
    );
    await expect(repo.removeMember("u-ana")).rejects.toSatisfy(
      (error: unknown) =>
        mapMemberError(error) === "The workspace needs at least one active owner.",
    );
  });

  it("uses the unknown sentence for an error with no known code", async () => {
    const { client } = fakeClient({ fail: { message: "connection reset" } });
    const repo = createSupabaseMembersRepo(client);
    await expect(repo.setRole("u-grace", "partner")).rejects.toSatisfy(
      (error: unknown) => mapMemberError(error) === "Something went wrong. Nothing was changed.",
    );
  });
});
