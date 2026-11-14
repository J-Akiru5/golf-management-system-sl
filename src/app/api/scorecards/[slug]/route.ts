import { NextResponse } from "next/server";
import { requireScorecardAccess } from "@/lib/scorecards/access";
import { cleanLabel, normalizeSlug, validateScorecardPayload } from "@/lib/scorecards/document";
import { mergeScorecardPayloads } from "@/lib/scorecards/merge";
import {
  getScorecardStore,
  ScorecardStoreBusy,
  ScorecardStoreUnavailable,
} from "@/lib/scorecards/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function storeError(error: unknown): NextResponse | null {
  if (error instanceof ScorecardStoreBusy) {
    // Another save holds the lease. The page keeps the edits and retries in a moment.
    return NextResponse.json({ ok: false, busy: true, message: error.message }, { status: 423 });
  }
  if (error instanceof ScorecardStoreUnavailable) {
    return jsonError(503, error.message);
  }
  return null;
}

export async function GET(
  request: Request,
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
    // Every tabulator polls for other people's changes. Asking with the time of the copy already held
    // costs one small answer instead of the whole document when nothing has changed.
    const since = new URL(request.url).searchParams.get("since");
    const serverTime = Date.now();
    if (since && since === document.updatedAt) {
      return NextResponse.json({
        ok: true,
        unchanged: true,
        updatedAt: document.updatedAt,
        serverTime,
      });
    }
    return NextResponse.json({ ...document, serverTime });
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
    // The document is shared by everyone signed in to the scorecard, so a save is merged into what
    // is stored, card by card, instead of replacing it. Otherwise the last person to save would erase
    // everyone else's cards, and nobody would see anyone else's work. The lease makes the read, merge
    // and write one step: without it two saves arriving together could both merge over the same copy
    // and the second write would drop the first one's cards.
    const outcome = await store.locked(slug, access.email ?? null, async () => {
      const stored = await store.get(slug);
      const now = Date.now();
      const merged = mergeScorecardPayloads(stored?.payload ?? null, checked.payload, now, {
        storedBy: stored?.updatedBy ?? null,
        incomingBy: access.email ?? null,
      });
      const recheck = validateScorecardPayload(merged.payload);
      if (!recheck.ok) return { ok: false as const, message: recheck.message };
      if (stored && !merged.changed) {
        return {
          ok: true as const,
          updatedAt: stored.updatedAt,
          updatedBy: stored.updatedBy,
          serverTime: now,
          payload: recheck.payload,
        };
      }
      const document = await store.put({
        slug,
        event: cleanLabel(body.event, stored?.event ?? "24th Bamboo Tee"),
        label: cleanLabel(body.label, stored?.label ?? "Day 1 AM"),
        payload: recheck.payload,
        updatedBy: access.email ?? null,
      });
      return {
        ok: true as const,
        updatedAt: document.updatedAt,
        updatedBy: document.updatedBy,
        serverTime: now,
        payload: recheck.payload,
      };
    });
    if (!outcome.ok) return jsonError(400, outcome.message);
    return NextResponse.json({ ...outcome });
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
