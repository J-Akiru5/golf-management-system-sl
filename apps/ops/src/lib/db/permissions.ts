import type { WorkspaceMemberStatus, WorkspaceRole } from "./types";

/**
 * What the interface lets each role do. This only decides what to SHOW. The database enforces the
 * same rules in RLS, so a hidden button is never the only protection.
 * Keep in step with supabase/migrations/20261120000100 to 20261120000300.
 */
export type WorkspaceAction =
  | "content.read"
  | "content.write"
  | "content.delete" // docs, snapshots, pipeline cards, tasks, other people's comments
  | "members.read"
  | "members.manage" // add, re-role, suspend, remove
  | "members.list_emails";

const RULES: Record<WorkspaceAction, ReadonlyArray<WorkspaceRole>> = {
  "content.read": ["owner", "partner", "member"],
  "content.write": ["owner", "partner", "member"],
  "content.delete": ["owner", "partner"],
  "members.read": ["owner", "partner", "member"],
  "members.manage": ["owner"],
  "members.list_emails": ["owner"],
};

export type Viewer = { role: WorkspaceRole; status: WorkspaceMemberStatus } | null;

/** A missing or suspended membership can do nothing. */
export function can(viewer: Viewer, action: WorkspaceAction): boolean {
  if (!viewer || viewer.status !== "active") return false;
  return RULES[action].includes(viewer.role);
}

/** A comment can be deleted by its author, or by an owner or partner. */
export function canDeleteComment(
  viewer: Viewer,
  viewerId: string | null,
  authorId: string | null,
): boolean {
  if (!viewer || viewer.status !== "active") return false;
  if (viewerId !== null && viewerId === authorId) return true;
  return can(viewer, "content.delete");
}

/** Only the author edits a comment; not even an owner may edit someone else's words. */
export function canEditComment(
  viewer: Viewer,
  viewerId: string | null,
  authorId: string | null,
): boolean {
  if (!viewer || viewer.status !== "active") return false;
  return viewerId !== null && viewerId === authorId;
}
