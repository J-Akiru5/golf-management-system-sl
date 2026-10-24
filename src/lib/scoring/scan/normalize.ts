import type { ScorecardScanHole, ScorecardScanPlayer, ScorecardScanResult } from "./types";

const HOLE_NUMBERS = Array.from({ length: 18 }, (_, index) => index + 1);

function numberOrNull(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

/**
 * The card reader is a separate service. Treat its output as untrusted: every player must have
 * holes 1-18 exactly once, scores stay in the scoring range, and confidence stays 0-1.
 */
export function normalizeScanResult(payload: unknown): ScorecardScanResult | null {
  if (!payload || typeof payload !== "object") return null;
  const input = payload as {
    players?: unknown;
    engine?: unknown;
    engineVersion?: unknown;
    raw?: unknown;
  };
  if (!Array.isArray(input.players) || !input.players.length) return null;
  if (typeof input.engine !== "string" || !input.engine.trim()) return null;
  if (typeof input.engineVersion !== "string" || !input.engineVersion.trim()) return null;

  const players: ScorecardScanPlayer[] = [];
  for (const candidate of input.players) {
    if (!candidate || typeof candidate !== "object") return null;
    const row = candidate as {
      rowIndex?: unknown;
      name?: unknown;
      holes?: unknown;
      writtenTotal?: unknown;
    };
    if (!Array.isArray(row.holes)) return null;
    const holes: ScorecardScanHole[] = [];
    for (const holeCandidate of row.holes) {
      if (!holeCandidate || typeof holeCandidate !== "object") return null;
      const hole = holeCandidate as { hole?: unknown; strokes?: unknown; confidence?: unknown };
      const number = Number(hole.hole);
      if (!Number.isInteger(number) || !HOLE_NUMBERS.includes(number)) return null;
      holes.push({
        hole: number,
        strokes: numberOrNull(hole.strokes, 1, 20),
        confidence: numberOrNull(hole.confidence, 0, 1),
      });
    }
    const byNumber = new Map(holes.map((hole) => [hole.hole, hole]));
    if (byNumber.size !== 18) return null;
    players.push({
      rowIndex: Number.isInteger(row.rowIndex) ? Number(row.rowIndex) : players.length,
      name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : null,
      holes: HOLE_NUMBERS.map((number) => byNumber.get(number) as ScorecardScanHole),
      writtenTotal: numberOrNull(row.writtenTotal, 1, 300),
    });
  }
  return {
    players,
    engine: input.engine.trim(),
    engineVersion: input.engineVersion.trim(),
    raw: input.raw,
  };
}
