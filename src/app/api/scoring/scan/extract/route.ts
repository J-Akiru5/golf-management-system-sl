import { NextResponse } from "next/server";
import { normalizeScanResult } from "@/lib/scoring/scan/normalize";
import { readScorecardObject, scorecardObjectBelongsToClub } from "@/lib/scoring/scan/r2";
import { scanSession, tournamentForClub } from "@/lib/scoring/scan/session";
import type { ScorecardScanMode } from "@/lib/scoring/scan/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await scanSession();
  if (!session.ok) return jsonError(session.status, session.message);

  let body: {
    tournamentId?: unknown;
    key?: unknown;
    mode?: unknown;
    template?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(400, "The scan request is not valid JSON.");
  }

  const tournamentId = typeof body.tournamentId === "string" ? body.tournamentId : "";
  const key = typeof body.key === "string" ? body.key : "";
  const mode: ScorecardScanMode = body.mode === "group" ? "group" : "individual";
  const template = typeof body.template === "string" ? body.template : "igcc-paper";

  if (!tournamentId) return jsonError(400, "Choose the tournament first.");
  if (!scorecardObjectBelongsToClub(key, session.member.clubId)) {
    return jsonError(400, "That photo is not in this club's storage.");
  }

  const serviceUrl = process.env.SCAN_INFERENCE_URL?.trim();
  if (!serviceUrl) {
    return NextResponse.json({
      ok: true,
      available: false,
      message:
        "The card reader is not connected on this deployment, so no scores can be drafted. The photo is stored; enter the scores by hand. An owner can connect it by setting SCAN_INFERENCE_URL.",
    });
  }

  try {
    const tournament = await tournamentForClub(session.client, session.member.clubId, tournamentId);
    if (!tournament) return jsonError(404, "That tournament is not in your club.");

    const image = await readScorecardObject(key);
    const form = new FormData();
    form.append(
      "image",
      new Blob([image.bytes as unknown as BlobPart], { type: image.mime }),
      "scorecard.jpg",
    );
    form.append("mode", mode);
    form.append("template", template);
    const token = process.env.SCAN_INFERENCE_TOKEN?.trim();
    const response = await fetch(serviceUrl, {
      method: "POST",
      body: form,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      return jsonError(502, `The card reader refused the image (${response.status}).`);
    }
    const result = normalizeScanResult(await response.json());
    if (!result) {
      return jsonError(502, "The card reader returned an invalid result.");
    }
    return NextResponse.json({ ok: true, available: true, result });
  } catch (error) {
    return jsonError(500, error instanceof Error ? error.message : "The card could not be read.");
  }
}
