import { NextResponse } from "next/server";
import { requireScorecardAccess } from "@/lib/scorecards/access";
import { MAX_PHOTO_BYTES, readCardPhoto } from "@/lib/scorecards/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, message }, { status });
}

/** Reads one photo of a scorecard and returns a draft for the page to review. */
export async function POST(request: Request): Promise<NextResponse> {
  const access = await requireScorecardAccess();
  if (!access.ok) return jsonError(access.status, access.message);

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_PHOTO_BYTES + 64 * 1024) {
    return jsonError(413, "The photo must be smaller than 4 MB.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "The scan request is not a photo upload.");
  }
  const image = form.get("image");
  if (!(image instanceof Blob)) return jsonError(400, "Choose a photo of the card first.");

  const outcome = await readCardPhoto({
    bytes: new Uint8Array(await image.arrayBuffer()),
    mime: image.type,
    mode: form.get("mode") === "group" ? "group" : "individual",
    serviceUrl: process.env.SCAN_INFERENCE_URL,
    token: process.env.SCAN_INFERENCE_TOKEN,
  });

  if (!outcome.ok) return jsonError(outcome.status, outcome.message);
  if (!outcome.available) {
    return NextResponse.json({ ok: true, available: false, message: outcome.message });
  }
  const { players, engine, engineVersion } = outcome.result;
  return NextResponse.json({ ok: true, available: true, players, engine, engineVersion });
}
