import type { ClubRole, DeskMember } from "./member";

/**
 * Roles that may publish or unpublish pairings, change tournament settings, or manage members.
 * The same rule is enforced in the database by RLS (`tournaments_manager_write`,
 * `club_members_manager_write`), so hiding a button is never the only defence.
 */
export const MANAGER_ROLES = ["owner", "organizer"] as const satisfies readonly ClubRole[];

/** Everyone with a club_members row may register players and edit registrations. */
export const DESK_ROLES = ["owner", "organizer", "desk"] as const satisfies readonly ClubRole[];

export function isManager(role: ClubRole): boolean {
  return (MANAGER_ROLES as readonly ClubRole[]).includes(role);
}

export function can(role: ClubRole, action: "manage-tournament" | "register-player"): boolean {
  return action === "manage-tournament" ? isManager(role) : DESK_ROLES.includes(role);
}

/**
 * Server-side gate for actions the database also protects. Use it in server actions and route
 * handlers before touching the database, so the failure is a clear message rather than a bare RLS
 * rejection.
 */
export function requireClubRole(
  member: Pick<DeskMember, "role" | "displayName">,
  roles: readonly ClubRole[],
): void {
  if (!roles.includes(member.role)) {
    const who = member.displayName || "this account";
    throw new Error(
      `${who} does not have permission for this action. It needs the ${roles.join(" or ")} role.`,
    );
  }
}
