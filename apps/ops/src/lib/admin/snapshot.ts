import type { WorkspaceMemberStatus, WorkspaceRole } from "@/lib/db/types";
import type { DeskAssignment, DeskRole, PreviousAccess } from "./types";

/**
 * The `previous` snapshot a suspend records. The database writes it, so the reader must never
 * assume its shape: a missing or malformed value becomes "nothing recorded" rather than breaking
 * the sheet.
 */

const WORKSPACE_ROLES: ReadonlyArray<WorkspaceRole> = ["owner", "partner", "member"];
const DESK_ROLES: ReadonlyArray<DeskRole> = ["owner", "organizer", "desk"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && (WORKSPACE_ROLES as ReadonlyArray<string>).includes(value);
}

function isDeskRole(value: unknown): value is DeskRole {
  return typeof value === "string" && (DESK_ROLES as ReadonlyArray<string>).includes(value);
}

function isMemberStatus(value: unknown): value is WorkspaceMemberStatus {
  return value === "active" || value === "suspended";
}

function parseDesk(value: unknown): DeskAssignment[] {
  if (!Array.isArray(value)) return [];

  const assignments: DeskAssignment[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const clubId = entry.clubId;
    const clubName = entry.clubName;
    const role = entry.role;
    if (typeof clubId !== "string" || typeof clubName !== "string" || !isDeskRole(role)) continue;
    if (clubId.trim().length === 0 || clubName.trim().length === 0) continue;
    assignments.push({ clubId, clubName, role });
  }
  return assignments;
}

/** The desk assignments carried by a list row or a snapshot. */
export function parseDeskAssignments(value: unknown): DeskAssignment[] {
  return parseDesk(value);
}

export function parsePreviousAccess(value: unknown): PreviousAccess {
  if (!isRecord(value)) return { workspace: null, desk: [], tabulator: false };

  const rawWorkspace = value.workspace;
  let workspace: PreviousAccess["workspace"] = null;
  if (isRecord(rawWorkspace) && isWorkspaceRole(rawWorkspace.role)) {
    workspace = {
      role: rawWorkspace.role,
      status: isMemberStatus(rawWorkspace.status) ? rawWorkspace.status : "active",
    };
  }

  return {
    workspace,
    desk: parseDesk(value.desk),
    tabulator: value.tabulator === true,
  };
}

/** Plain lines for the sheet: what a restore will put back. */
export function previousAccessLines(previous: PreviousAccess): string[] {
  const lines: string[] = [];

  lines.push(
    previous.workspace
      ? `Workspace: ${previous.workspace.role} (${previous.workspace.status})`
      : "Workspace: no access",
  );

  lines.push(
    previous.desk.length === 0
      ? "Desk: no access"
      : `Desk: ${previous.desk.map((entry) => `${entry.clubName} ${entry.role}`).join(", ")}`,
  );

  lines.push(`Tabulator: ${previous.tabulator ? "yes" : "no"}`);

  return lines;
}

/** True when the snapshot would restore nothing, so the sheet can say so before a restore. */
export function previousAccessIsEmpty(previous: PreviousAccess): boolean {
  return previous.workspace === null && previous.desk.length === 0 && !previous.tabulator;
}
