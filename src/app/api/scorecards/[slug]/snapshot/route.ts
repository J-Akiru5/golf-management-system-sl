import { NextResponse } from "next/server";
import { requireScorecardAccess } from "@/lib/scorecards/access";
import { normalizeSlug } from "@/lib/scorecards/document";
import { getScorecardStore, ScorecardStoreUnavailable } from "@/lib/scorecards/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Copies the shared document aside before a reset or a replace. The copy is the recovery path: the
 * page refuses to run either action when this fails, and the admin can read the snapshot from the
 * private bucket afterwards.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const access = await requireScorecardAccess();
  if (!access.ok) {
    return NextResponse.json({ ok: false, message: access.message }, { status: access.status });
  }
  const { slug: rawSlug } = await context.params;
  const slug = normalizeSlug(rawSlug);
  if (!slug) {
    return NextResponse.json(
      { ok: false, message: "That scorecard key is not valid." },
      { status: 400 },
    );
  }
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const reason =
    isRecord(body) && typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";
  try {
    const store = await getScorecardStore();
    const snapshot = await store.snapshot({
      slug,
      reason: reason || "snapshot before a change",
      by: access.email ?? null,
    });
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (error) {
    if (error instanceof ScorecardStoreUnavailable) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { ok: false, message: "The snapshot could not be kept." },
      { status: 500 },
    );
  }
}
