import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  WorkspaceMemberStatus,
  WorkspaceMemberWithEmail,
  WorkspaceRole,
} from "@/lib/db/types";
import { memberError } from "./errors";
import {
  checkDisplayName,
  decide,
  isWorkspaceRole,
  type MemberAction,
  type MemberFacts,
} from "./rules";

/**
 * The members repository.
 *
 * Two implementations behind one interface: Supabase, run as the caller's session so row level
 * security and the guard trigger apply, and an in-memory demo that applies the same rules from
 * rules.ts. The demo is for checking the interface without a database and is only reachable
 * through getRepos() when demo mode is on.
 */

export type Member = MemberFacts & {
  displayName: string;
  createdAt: string;
};

export type MemberWithEmail = Member & { email: string };

/** The signed-in person. The email is their own, from their account, and may be absent. */
export type Me = Member & { email: string | null };

export type NewMember = {
  email: string;
  role: WorkspaceRole;
  displayName: string;
};

export interface MembersRepo {
  getMe(): Promise<Me | null>;
  updateMyDisplayName(name: string): Promise<void>;
  listMembers(): Promise<Member[]>;
  /** Owner only. The database raises 42501 for anyone else. */
  listMembersWithEmail(): Promise<MemberWithEmail[]>;
  addMember(input: NewMember): Promise<string>;
  setRole(userId: string, role: WorkspaceRole): Promise<void>;
  setStatus(userId: string, status: WorkspaceMemberStatus): Promise<void>;
  removeMember(userId: string): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Supabase

const COLUMNS = "user_id, role, status, display_name, created_at";

type SelectedRow = Pick<
  WorkspaceMemberWithEmail,
  "user_id" | "role" | "status" | "display_name" | "created_at"
>;

function toMember(row: SelectedRow): Member {
  return {
    userId: row.user_id,
    role: row.role,
    status: row.status,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

function toMemberWithEmail(row: WorkspaceMemberWithEmail): MemberWithEmail {
  return {
    userId: row.user_id,
    role: row.role,
    status: row.status,
    displayName: row.display_name,
    createdAt: row.created_at,
    email: row.email,
  };
}

type SupabaseError = { code?: string | null; message: string };

/** Rethrow a Supabase error with its database code on it, so mapMemberError can read it. */
function throwIf(error: SupabaseError | null): void {
  if (!error) return;
  const wrapped = new Error(error.message) as Error & { code?: string };
  if (error.code) wrapped.code = error.code;
  throw wrapped;
}

/**
 * Row level security does not raise an error when it refuses an update or a delete: it just changes
 * zero rows. Treat zero rows as a failure so the screen never reports a change that did not happen.
 */
function requireChanged(data: unknown[] | null): void {
  if (!data || data.length === 0) throw new Error("No row was changed.");
}

export function createSupabaseMembersRepo(client: SupabaseClient<Database>): MembersRepo {
  async function currentUserId(): Promise<string | null> {
    const { data } = await client.auth.getUser();
    return data.user?.id ?? null;
  }

  return {
    async getMe() {
      const { data: auth } = await client.auth.getUser();
      const user = auth.user;
      if (!user) return null;

      const { data, error } = await client
        .from("workspace_members")
        .select(COLUMNS)
        .eq("user_id", user.id)
        .maybeSingle();
      throwIf(error);
      if (!data) return null;

      return { ...toMember(data), email: user.email ?? null };
    },

    async updateMyDisplayName(name) {
      const userId = await currentUserId();
      if (!userId) throw new Error("There is no signed-in account to update.");

      const { data, error } = await client
        .from("workspace_members")
        .update({ display_name: name.trim() })
        .eq("user_id", userId)
        .select("user_id");
      throwIf(error);
      requireChanged(data);
    },

    async listMembers() {
      const { data, error } = await client
        .from("workspace_members")
        .select(COLUMNS)
        .order("created_at", { ascending: true });
      throwIf(error);
      return (data ?? []).map(toMember);
    },

    async listMembersWithEmail() {
      const { data, error } = await client.rpc("ws_list_members");
      throwIf(error);
      return (data ?? []).map(toMemberWithEmail);
    },

    async addMember(input) {
      const { data, error } = await client.rpc("ws_add_member", {
        p_email: input.email.trim(),
        p_role: input.role,
        p_display_name: input.displayName.trim(),
      });
      throwIf(error);
      if (!data) throw new Error("The database did not return the new member's id.");
      return data;
    },

    async setRole(userId, role) {
      const { data, error } = await client
        .from("workspace_members")
        .update({ role })
        .eq("user_id", userId)
        .select("user_id");
      throwIf(error);
      requireChanged(data);
    },

    async setStatus(userId, status) {
      const { data, error } = await client
        .from("workspace_members")
        .update({ status })
        .eq("user_id", userId)
        .select("user_id");
      throwIf(error);
      requireChanged(data);
    },

    async removeMember(userId) {
      const { data, error } = await client
        .from("workspace_members")
        .delete()
        .eq("user_id", userId)
        .select("user_id");
      throwIf(error);
      requireChanged(data);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Demo

type DemoAccount = {
  userId: string;
  email: string;
};

type DemoSeedMember = Member & { email: string };

/**
 * Believable demo data. The addresses use the reserved .test domain, so none of them is a real
 * mailbox. Two accounts exist without a member row, so adding someone can be tried end to end.
 */
const DEMO_SEED: ReadonlyArray<DemoSeedMember> = [
  {
    userId: "demo-owner",
    email: "ana.reyes@teeline.test",
    displayName: "Ana Reyes",
    role: "owner",
    status: "active",
    createdAt: "2026-09-02T08:00:00.000Z",
  },
  {
    userId: "demo-partner",
    email: "miguel.santos@teeline.test",
    displayName: "Miguel Santos",
    role: "partner",
    status: "active",
    createdAt: "2026-09-10T08:00:00.000Z",
  },
  {
    userId: "demo-member",
    email: "grace.lim@teeline.test",
    displayName: "Grace Lim",
    role: "member",
    status: "active",
    createdAt: "2026-10-05T08:00:00.000Z",
  },
  {
    userId: "demo-noel",
    email: "noel.cruz@teeline.test",
    displayName: "Noel Cruz",
    role: "member",
    status: "suspended",
    createdAt: "2026-10-21T08:00:00.000Z",
  },
];

/** Accounts that exist but are not on the member list yet. */
const DEMO_SPARE_ACCOUNTS: ReadonlyArray<DemoAccount> = [
  { userId: "demo-rosa", email: "rosa.diaz@teeline.test" },
  { userId: "demo-jun", email: "jun.park@teeline.test" },
];

/** Which seeded member stands in for each role when `?as=` is used. */
const DEMO_VIEWERS: Record<WorkspaceRole, string> = {
  owner: "demo-owner",
  partner: "demo-partner",
  member: "demo-member",
};

type DemoState = {
  members: Member[];
  accounts: DemoAccount[];
};

let demoState: DemoState | null = null;

function state(): DemoState {
  if (demoState === null) {
    demoState = {
      members: DEMO_SEED.map(({ email: _email, ...member }) => ({ ...member })),
      accounts: [
        ...DEMO_SEED.map(({ userId, email }) => ({ userId, email })),
        ...DEMO_SPARE_ACCOUNTS.map((account) => ({ ...account })),
      ],
    };
  }
  return demoState;
}

/** Back to the seed. Tests use it between cases; the app never calls it. */
export function resetDemoMembers(): void {
  demoState = null;
}

function copy(member: Member): Member {
  return { ...member };
}

function compareByJoined(a: Member, b: Member): number {
  return a.createdAt.localeCompare(b.createdAt);
}

function emailFor(member: Member): string {
  const account = state().accounts.find((candidate) => candidate.userId === member.userId);
  if (!account) throw new Error("The demo data is missing the account for a member.");
  return account.email;
}

function findMember(userId: string): Member {
  const member = state().members.find((candidate) => candidate.userId === userId);
  if (!member) throw new Error("That member is no longer in the list.");
  return member;
}

const demoRepos = new Map<WorkspaceRole, MembersRepo>();

/**
 * The demo viewer. `viewerRole` comes from the `?as=` query parameter in demo mode only; the
 * Supabase implementation ignores it and uses the real session instead.
 *
 * One instance per role, because getRepos() builds the demo set on every call and the set has to
 * stay comparable across calls. The state behind it is module level, so the instance is still
 * current after a save.
 */
export function createDemoMembersRepo(viewerRole: WorkspaceRole = "owner"): MembersRepo {
  const cached = demoRepos.get(viewerRole);
  if (cached) return cached;

  const repo = buildDemoMembersRepo(viewerRole);
  demoRepos.set(viewerRole, repo);
  return repo;
}

function buildDemoMembersRepo(viewerRole: WorkspaceRole): MembersRepo {
  function viewer(): Member {
    const member = state().members.find(
      (candidate) => candidate.userId === DEMO_VIEWERS[viewerRole],
    );
    if (!member) throw memberError("42501", "The demo viewer is no longer a member.");
    return member;
  }

  function guard(target: Member, action: MemberAction): void {
    const decision = decide(viewer(), target, action, state().members);
    if (!decision.allowed) throw memberError(decision.code, decision.reason);
  }

  return {
    async getMe() {
      const member = state().members.find(
        (candidate) => candidate.userId === DEMO_VIEWERS[viewerRole],
      );
      if (!member) return null;
      return { ...copy(member), email: emailFor(member) };
    },

    async updateMyDisplayName(name) {
      const me = viewer();
      guard(me, { kind: "edit_display_name" });
      const problem = checkDisplayName(name);
      if (problem) throw new Error(problem);

      const stored = findMember(me.userId);
      stored.displayName = name.trim();
    },

    async listMembers() {
      return [...state().members].sort(compareByJoined).map(copy);
    },

    async listMembersWithEmail() {
      const me = viewer();
      if (me.role !== "owner" || me.status !== "active") {
        throw memberError("42501", "only an owner can list member emails");
      }
      return [...state().members].sort(compareByJoined).map((member) => ({
        ...copy(member),
        email: emailFor(member),
      }));
    },

    async addMember(input) {
      const me = viewer();
      if (me.role !== "owner" || me.status !== "active") {
        throw memberError("42501", "only an owner can add members");
      }
      if (!isWorkspaceRole(input.role)) throw new Error("Choose a role.");

      const email = input.email.trim().toLowerCase();
      const account = state().accounts.find((candidate) => candidate.email.toLowerCase() === email);
      if (!account) throw memberError("P0002", "no account has that email address");

      if (state().members.some((member) => member.userId === account.userId)) {
        throw memberError("23505", "that person is already a member");
      }

      state().members.push({
        userId: account.userId,
        role: input.role,
        status: "active",
        displayName: input.displayName.trim(),
        createdAt: new Date().toISOString(),
      });
      return account.userId;
    },

    async setRole(userId, role) {
      if (!isWorkspaceRole(role)) throw new Error("Choose a role.");
      const target = findMember(userId);
      guard(target, { kind: "change_role", role });
      target.role = role;
    },

    async setStatus(userId, status) {
      const target = findMember(userId);
      guard(target, { kind: "set_status", status });
      target.status = status;
    },

    async removeMember(userId) {
      const target = findMember(userId);
      guard(target, { kind: "remove" });
      const remaining = state().members.filter((member) => member.userId !== userId);
      state().members = remaining;
    },
  };
}
