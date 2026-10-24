import { NextResponse } from "next/server";
import {
  createScorecardObjectKey,
  isR2Configured,
  isSupportedImageMime,
  presignScorecardPut,
} from "@/lib/scoring/scan/r2";
import { scanSession, tournamentForClub } from "@/lib/scoring/scan/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await scanSession();
  if (!session.ok) return jsonError(session.status, session.message);
  if (!isR2Configured()) {
    return jsonError(503, "Photo storage is not configured. Add the R2 settings and try again.");
  }

  let body: {
    tournamentId?: unknown;
    mime?: unknown;
    bytes?: unknown;
    sha256?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(400, "The upload request is not valid JSON.");
  }

  const tournamentId = typeof body.tournamentId === "string" ? body.tournamentId : "";
  const mime = typeof body.mime === "string" ? body.mime : "";
  const bytes = typeof body.bytes === "number" ? body.bytes : NaN;
  const sha256 = typeof body.sha256 === "string" ? body.sha256 : "";

  if (!tournamentId) return jsonError(400, "Choose the tournament first.");
  if (!isSupportedImageMime(mime)) {
    return jsonError(400, "Use a JPEG, PNG or WebP photo.");
  }
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_IMAGE_BYTES) {
    return jsonError(400, "The photo must be between 1 byte and 12 MB.");
  }
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    return jsonError(400, "The photo fingerprint is missing.");
  }

  try {
    const tournament = await tournamentForClub(session.client, session.member.clubId, tournamentId);
    if (!tournament) return jsonError(404, "That tournament is not in your club.");

    const key = createScorecardObjectKey(session.member.clubId, mime);
    const presigned = await presignScorecardPut(key, mime);
    return NextResponse.json({
      ok: true,
      key,
      uploadUrl: presigned.uploadUrl,
      headers: presigned.headers,
      expiresIn: presigned.expiresIn,
    });
  } catch (error) {
    return jsonError(500, error instanceof Error ? error.message : "The upload could not start.");
  }
}
