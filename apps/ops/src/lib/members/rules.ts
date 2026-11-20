import type { WorkspaceMemberStatus, WorkspaceRole } from "@/lib/db/types";
import type { MemberErrorCode } from "./errors";

/**
 * The member rules, as pure functions.
 *
 * They mirror `ws_members_guard` in supabase/migrations/20261120000100_workspace_members.sql so the
 * interface can disable an action and say why before the database is asked. The database is still
 * the enforcement: a hidden or disabled control is never the only protection.
 *
 * The rules:
 *   * only an active owner changes a role or a status, or removes a member;
 *   * the last active owner cannot be demoted, suspended or removed;
 *   * anyone changes only their own display name.
 */
export type MemberFacts = {
  userId: string;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
};

export type MemberAction =
  | { kind: "change_role"; role: WorkspaceRole }
  | { kind: "set_status"; status: WorkspaceMemberStatus }
  | { kind: "remove" }
  | { kind: "edit_display_name" };

export type Decision =
  | { allowed: true }
  | { allowed: false; reason: string; code: MemberErrorCode };

const ALLOWED: Decision = { allowed: true };

export const MEMBER_RULE_MESSAGES = {
  activeMember: "You need an active workspace membership to change anything here.",
  ownerOnly: "Only an owner can do that.",
  ownName: "You can only change your own display name.",
  lastOwner: "The workspace needs at least one active owner.",
  emptyName: "Enter a display name.",
  longName: "Use 80 characters or fewer.",
} as const;

const ROLES: ReadonlyArray<WorkspaceRole> = ["owner", "partner", "member"];

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && (ROLES as ReadonlyArray<string>).includes(value);
}

/** An active owner other than the target. If there is none, the target is the last one. */
export function otherActiveOwners(
  target: MemberFacts,
  members: ReadonlyArray<MemberFacts>,
): number {
  return members.filter(
    (member) =>
      member.userId !== target.userId && member.role === "owner" && member.status === "active",
  ).length;
}

export function isLastActiveOwner(
  target: MemberFacts,
  members: ReadonlyArray<MemberFacts>,
): boolean {
  return (
    target.role === "owner" &&
    target.status === "active" &&
    otherActiveOwners(target, members) === 0
  );
}

export function decide(
  viewer: MemberFacts | null,
  target: MemberFacts,
  action: MemberAction,
  members: ReadonlyArray<MemberFacts>,
): Decision {
  if (viewer === null || viewer.status !== "active") {
    return { allowed: false, reason: MEMBER_RULE_MESSAGES.activeMember, code: "42501" };
  }

  if (action.kind === "edit_display_name") {
    if (viewer.userId !== target.userId) {
      return { allowed: false, reason: MEMBER_RULE_MESSAGES.ownName, code: "42501" };
    }
    return ALLOWED;
  }

  if (viewer.role !== "owner") {
    return { allowed: false, reason: MEMBER_RULE_MESSAGES.ownerOnly, code: "42501" };
  }

  // The guard trigger only counts a target that is an owner AND active right now. A demotion, a
  // suspension or a removal of that row would leave the workspace with nobody who can manage it.
  const wouldRemoveActiveOwner =
    target.role === "owner" &&
    target.status === "active" &&
    (action.kind === "remove" ||
      (action.kind === "change_role" && action.role !== "owner") ||
      (action.kind === "set_status" && action.status !== "active"));

  if (wouldRemoveActiveOwner && isLastActiveOwner(target, members)) {
    return { allowed: false, reason: MEMBER_RULE_MESSAGES.lastOwner, code: "23514" };
  }

  return ALLOWED;
}

export function canChangeRole(
  viewer: MemberFacts | null,
  target: MemberFacts,
  newRole: WorkspaceRole,
  members: ReadonlyArray<MemberFacts>,
): boolean {
  return decide(viewer, target, { kind: "change_role", role: newRole }, members).allowed;
}

export function canSuspend(
  viewer: MemberFacts | null,
  target: MemberFacts,
  members: ReadonlyArray<MemberFacts>,
): boolean {
  return decide(viewer, target, { kind: "set_status", status: "suspended" }, members).allowed;
}

export function canReactivate(
  viewer: MemberFacts | null,
  target: MemberFacts,
  members: ReadonlyArray<MemberFacts>,
): boolean {
  return decide(viewer, target, { kind: "set_status", status: "active" }, members).allowed;
}

export function canRemove(
  viewer: MemberFacts | null,
  target: MemberFacts,
  members: ReadonlyArray<MemberFacts>,
): boolean {
  return decide(viewer, target, { kind: "remove" }, members).allowed;
}

export function canEditDisplayName(viewer: MemberFacts | null, target: MemberFacts): boolean {
  return decide(viewer, target, { kind: "edit_display_name" }, []).allowed;
}

/** The sentence to show for a refused action, or null when it is allowed. */
export function explainBlock(
  viewer: MemberFacts | null,
  target: MemberFacts,
  action: MemberAction,
  members: ReadonlyArray<MemberFacts>,
): string | null {
  const decision = decide(viewer, target, action, members);
  return decision.allowed ? null : decision.reason;
}

/** Mirrors the display_name check in the migration: 1 to 80 characters after trimming. */
export function checkDisplayName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return MEMBER_RULE_MESSAGES.emptyName;
  if (Array.from(trimmed).length > 80) return MEMBER_RULE_MESSAGES.longName;
  return null;
}
