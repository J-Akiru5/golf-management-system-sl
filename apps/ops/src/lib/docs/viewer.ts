import { getViewer } from "@/lib/auth/viewer";
import type { WorkspaceRole } from "@/lib/db/types";
import { demoMode } from "@/lib/flags";

/** Who is looking at the documents area, in the shape the pages and actions need. */
export type DocsViewer = {
  id: string;
  displayName: string;
  role: WorkspaceRole;
  demo: boolean;
};

/**
 * Demo mode has no session, so it gets the same viewer the shell shows: an owner, clearly marked as
 * demo. Anything else reads the real membership row. Null means no active member.
 */
export async function getDocsViewer(): Promise<DocsViewer | null> {
  if (demoMode()) {
    return { id: "demo-user", displayName: "Demo user", role: "owner", demo: true };
  }

  const viewer = await getViewer();
  if (!viewer?.member || viewer.member.status !== "active") return null;
  return {
    id: viewer.user.id,
    displayName: viewer.member.display_name,
    role: viewer.member.role,
    demo: false,
  };
}

/** The permissions helper's viewer, for `can(viewer, "content.delete")` and friends. */
export function permissionsViewer(viewer: DocsViewer) {
  return { role: viewer.role, status: "active" as const };
}
