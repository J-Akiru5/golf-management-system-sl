import type { ClubRole } from "@/lib/auth/member";
import { DESK_ROLES } from "@/lib/auth/roles";

/**
 * Links and permission checks for a player profile.
 *
 * `/players/[id]` is a staff route: `STAFF_PREFIXES` in `src/lib/auth/routes.ts` includes
 * `/players`, so the proxy sends anyone without a club_members row to `/my`. The desk therefore
 * shows the link only when the signed-in account can actually open it, otherwise it would offer a
 * path that bounces the person somewhere else.
 *
 * Demo mode has no auth configured, so the link stays live there. That is the same three-state
 * convention as `src/components/desk/RoleGate.tsx`: `undefined` means auth is not set up,
 * `null` means signed in with no membership row, and a role is checked against the allowed list.
 */

/** The desk route for one player's record. */
export function playerProfileHref(playerId: string): string {
  return `/players/${encodeURIComponent(playerId)}`;
}

/** Whether the signed-in account may open a player profile. */
export function canOpenPlayerProfile(role: ClubRole | null | undefined): boolean {
  // No auth configured (demo): keep the link live, as RoleGate does.
  if (role === undefined) return true;
  // Signed in but no club_members row: least privilege.
  if (role === null) return false;
  return (DESK_ROLES as readonly ClubRole[]).includes(role);
}
