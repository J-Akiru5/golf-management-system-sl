import { requireScorecardAccess } from "@/lib/scorecards/access";
import { normalizeSlug } from "@/lib/scorecards/document";
import { getScorecardStore, ScorecardStoreUnavailable } from "@/lib/scorecards/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const access = await requireScorecardAccess();
  if (!access.ok) {
    return Response.json({ ok: false, message: access.message }, { status: access.status });
  }
  const { slug: rawSlug } = await context.params;
  const slug = normalizeSlug(rawSlug);
  if (!slug)
    return Response.json(
      { ok: false, message: "That scorecard key is not valid." },
      { status: 400 },
    );
  try {
    const store = await getScorecardStore();
    const document = await store.get(slug);
    if (!document) {
      return Response.json(
        { ok: false, message: "No scorecard is saved under that key." },
        { status: 404 },
      );
    }
    return new Response(JSON.stringify(document.payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${slug}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ScorecardStoreUnavailable) {
      return Response.json({ ok: false, message: error.message }, { status: 503 });
    }
    return Response.json(
      { ok: false, message: "The scorecard could not be read." },
      { status: 500 },
    );
  }
}
