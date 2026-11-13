import { createSupabaseServerClient } from "@/lib/supabase/server";

export const TABULATION_ROLE = "tabulation";

export interface ScorecardAccessResult {
  ok: boolean;
  status: number;
  message: string;
  /** Who got in: the tabulation team, or club staff using the editor. Absent when refused. */
  role?: "tabulation" | "staff";
  email?: string;
  /** The club role of a staff account, so the page can offer the right way back to the desk. */
  staffRole?: string;
}

/**
 * The scorecard team is a separate role, not club staff. A tabulation account must never be added
 * to `club_members`: that table's RLS gives every member access to the desk's player and event data.
 * Instead the role lives in the Supabase user's app metadata, or in an explicit email allowlist for
 * fast onboarding. No club_members row is required.
 */
export function canUseScorecard(input: {
  email?: string | null;
  appMetadata?: Record<string, unknown> | null;
}): boolean {
  const metadataRole = input.appMetadata?.scorecard_role;
  if (metadataRole === TABULATION_ROLE) return true;
  const email = input.email?.trim().toLowerCase();
  if (!email) return false;
  const allowlist = (process.env.SCORECARD_TABULATION_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email);
}

/** Club staff may use the scorecard alongside the tabulation team. */
export function canAdministerScorecard(clubRole: string): boolean {
  return clubRole === "owner" || clubRole === "organizer" || clubRole === "desk";
}

/** Local development can opt out of the tabulation session; production builds never can. */
function localBypass(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.SCORECARD_AUTH === "off";
}

export async function requireScorecardAccess(): Promise<ScorecardAccessResult> {
  if (localBypass()) return { ok: true, status: 200, message: "" };
  try {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      return {
        ok: false,
        status: 401,
        message: "Sign in with a tabulation account to use the scorecard editor.",
      };
    }
    const email = data.user.email ?? undefined;
    const { data: membership } = await client
      .from("club_members")
      .select("role")
      .eq("user_id", data.user.id)
      .limit(1);
    const clubRole = membership?.[0]?.role ?? "";
    if (canAdministerScorecard(clubRole)) {
      return { ok: true, status: 200, message: "", role: "staff", email, staffRole: clubRole };
    }
    if (canUseScorecard({ email: data.user.email, appMetadata: data.user.app_metadata })) {
      return { ok: true, status: 200, message: "", role: "tabulation", email };
    }
    return {
      ok: false,
      status: 403,
      message: "This account is not on the tabulation team.",
    };
  } catch {
    return {
      ok: false,
      status: 401,
      message: "The session could not be checked. Sign in again.",
    };
  }
}
