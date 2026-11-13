import { NextResponse } from "next/server";
import { requireScorecardAccess } from "@/lib/scorecards/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who is using the scorecard editor. The static page cannot read the Supabase session itself, so
 * it asks here: it shows the account, offers Sign out, and offers the desk or staff app only to
 * the club staff who can actually open them.
 */
export async function GET(): Promise<NextResponse> {
  const access = await requireScorecardAccess();
  if (!access.ok) {
    return NextResponse.json({ ok: false, message: access.message }, { status: access.status });
  }
  const desk = access.role === "staff" ? (access.staffRole === "desk" ? "/staff" : "/admin") : null;
  return NextResponse.json({
    ok: true,
    role: access.role ?? "tabulation",
    email: access.email ?? "",
    desk,
  });
}
