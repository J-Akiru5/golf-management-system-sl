import { WORKSPACE_ROLES } from "@/lib/db/constants";
import type { WorkspaceMemberStatus, WorkspaceRole } from "@/lib/db/types";

const JOINED_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** A joined date for the member table. An unreadable value says so rather than guessing. */
export function formatJoined(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return JOINED_FORMAT.format(date);
}

export function roleLabel(role: WorkspaceRole): string {
  return WORKSPACE_ROLES.find((entry) => entry.id === role)?.label ?? role;
}

export function roleSummary(role: WorkspaceRole): string {
  return WORKSPACE_ROLES.find((entry) => entry.id === role)?.summary ?? "";
}

export function statusLabel(status: WorkspaceMemberStatus): string {
  return status === "active" ? "Active" : "Suspended";
}
