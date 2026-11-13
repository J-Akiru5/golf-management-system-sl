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
  const params = new URL(request.url).searchParams;
  const event = params.get("event")?.trim() ?? "";
  const requestedDay = Number(params.get("day"));
  const day =
    Number.isFinite(requestedDay) && requestedDay > 0 ? Math.trunc(requestedDay) : undefined;
  try {
    const field = await loadField(event, { day });
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
