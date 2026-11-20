import type { WorkspaceMemberStatus } from "@/lib/db/types";

/**
 * The gate from SPEC section 4, in order. Pure, so every branch is tested without a browser or a
 * database: the layout only maps the answer to a redirect, a 404 or a page.
 */
export type AccessDecision = "not_found" | "login" | "no_access" | "allow";

export type AccessInput = {
  /** The feature flag, OPS_ENABLED. */
  enabled: boolean;
  /** A Supabase session exists. */
  signedIn: boolean;
  /** The member's status, or null when there is no workspace_members row. */
  member: WorkspaceMemberStatus | null;
};

export function decideAccess({ enabled, signedIn, member }: AccessInput): AccessDecision {
  if (!enabled) return "not_found";
  if (!signedIn) return "login";
  if (member === null) return "no_access";
  if (member !== "active") return "no_access";
  return "allow";
}
