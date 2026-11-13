import { NextResponse } from "next/server";
import { requireScorecardAccess } from "@/lib/scorecards/access";
import { loadField, SupabaseFieldUnavailable } from "@/lib/scorecards/field";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const access = await requireScorecardAccess();
  if (!access.ok) {
    return NextResponse.json({ ok: false, message: access.message }, { status: access.status });
  }
  const event = new URL(request.url).searchParams.get("event")?.trim() ?? "";
  try {
    const field = await loadField(event);
    if (!field) {
      return NextResponse.json(
        { ok: false, message: `No tournament matched "${event || "the latest event"}".` },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, ...field });
  } catch (error) {
    if (error instanceof SupabaseFieldUnavailable) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 503 });
    }
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "The field list could not be read.",
      },
      { status: 500 },
    );
  }
}
