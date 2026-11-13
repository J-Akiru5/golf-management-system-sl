import { NextResponse } from "next/server";
import { requireScorecardAccess } from "@/lib/scorecards/access";
import { cleanLabel, normalizeSlug, validateScorecardPayload } from "@/lib/scorecards/document";
import { getScorecardStore, ScorecardStoreUnavailable } from "@/lib/scorecards/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function storeError(error: unknown): NextResponse | null {
  if (error instanceof ScorecardStoreUnavailable) {
    return jsonError(503, error.message);
  }
  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const access = await requireScorecardAccess();
  if (!access.ok) return jsonError(access.status, access.message);
  const { slug: rawSlug } = await context.params;
  const slug = normalizeSlug(rawSlug);
  if (!slug) return jsonError(400, "That scorecard key is not valid.");
  try {
    const store = await getScorecardStore();
    const document = await store.get(slug);
    if (!document) return jsonError(404, "No scorecard has been saved under that key yet.");
    return NextResponse.json(document);
  } catch (error) {
    return (
      storeError(error) ??
      NextResponse.json({ ok: false, message: "The scorecard could not be read." }, { status: 500 })
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const access = await requireScorecardAccess();
  if (!access.ok) return jsonError(access.status, access.message);
  const { slug: rawSlug } = await context.params;
  const slug = normalizeSlug(rawSlug);
  if (!slug) return jsonError(400, "That scorecard key is not valid.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "The save request is not valid JSON.");
  }
  if (!isRecord(body)) return jsonError(400, "The save request must be an object.");
  const checked = validateScorecardPayload(body.payload);
  if (!checked.ok) return jsonError(400, checked.message);
  try {
    const store = await getScorecardStore();
    const document = await store.put({
      slug,
      event: cleanLabel(body.event, "24th Bamboo Tee"),
      label: cleanLabel(body.label, "Day 1 AM"),
      payload: checked.payload,
    });
    return NextResponse.json({ ok: true, updatedAt: document.updatedAt });
  } catch (error) {
    return (
      storeError(error) ??
      NextResponse.json(
        { ok: false, message: "The scorecard could not be saved." },
        { status: 500 },
      )
    );
  }
}
