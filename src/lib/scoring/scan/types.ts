/** A scorecard photo is either one player's card or one group sheet. */
export type ScorecardScanMode = "individual" | "group";

export interface ScorecardScanHole {
  hole: number;
  strokes: number | null;
  confidence: number | null;
}

export interface ScorecardScanPlayer {
  /** Row number on the physical card, starting at 0. */
  rowIndex: number;
  name: string | null;
  holes: ScorecardScanHole[];
  writtenTotal: number | null;
}

export interface ScorecardScanResult {
  players: ScorecardScanPlayer[];
  engine: string;
  engineVersion: string;
  raw?: unknown;
}

export interface ScorecardScanImage {
  /** R2 object key. Starts with the club id so the scoring image row accepts it. */
  path: string;
  sha256: string;
  mime: string;
  bytes: number;
  previewUrl: string;
}

export interface ScorecardScanApply {
  playerId: string;
  strokes: Record<number, string>;
  /** Reader confidence per hole. A missing key means the value was not read by the reader. */
  confidence: Record<number, number | null>;
  image: ScorecardScanImage | null;
  extraction: {
    engine: string;
    engineVersion: string;
    raw: unknown;
  } | null;
  captureKey: string;
}

/** The response from the optional inference service. */
export interface ScorecardScanInferenceResponse {
  ok: boolean;
  message?: string;
  result?: ScorecardScanResult;
}
