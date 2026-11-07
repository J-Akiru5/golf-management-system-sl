import { NextResponse } from "next/server";
import { demoObjectKeyIsOurs, demoScanEnabled, putDemoScorecard } from "@/lib/scoring/scan/demo";
import { isSupportedImageMime } from "@/lib/scoring/scan/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** The local PUT endpoint behind the demo presign. It is never available in a production build. */
export async function PUT(request: Request): Promise<Response> {
  if (!demoScanEnabled()) {
    return NextResponse.json({ ok: false, message: "Not found." }, { status: 404 });
  }
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!demoObjectKeyIsOurs(key)) {
    return NextResponse.json(
      { ok: false, message: "The photo key is not valid." },
      { status: 400 },
    );
  }
  const mime = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!isSupportedImageMime(mime)) {
    return NextResponse.json(
      { ok: false, message: "Use a JPEG, PNG or WebP photo." },
      { status: 400 },
    );
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length <= 0 || bytes.length > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { ok: false, message: "The photo must be between 1 byte and 12 MB." },
      { status: 400 },
    );
  }
  putDemoScorecard(key, bytes, mime);
  return new Response(null, { status: 204 });
}
