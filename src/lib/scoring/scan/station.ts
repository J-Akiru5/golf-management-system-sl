/**
 * Pure rules for the scorecard scan station.
 *
 * The station lets a person edit every cell freely. These helpers answer only two questions:
 * what the four steps are, and whether a card has the one thing the owner requires before export,
 * a value on every hole. X counts as a value; a blank does not.
 */

export type ScanStationStepKey = "capture" | "read" | "verify" | "export";

export interface ScanStationStep {
  key: ScanStationStepKey;
  title: string;
  body: string;
}

export const SCAN_STATION_STEPS: readonly ScanStationStep[] = [
  {
    key: "capture",
    title: "Capture the card",
    body: "Take a photo or upload one. Keep the whole card in frame and in landscape.",
  },
  {
    key: "read",
    title: "Read the card",
    body: "The reader drafts the cells. A cell it cannot read stays empty, never guessed.",
  },
  {
    key: "verify",
    title: "Verify and edit",
    body: "Compare the photo with every cell. Change anything, including a weak read.",
  },
  {
    key: "export",
    title: "Export to Scores",
    body: "Every hole needs a value. The cards land in Review as submitted, not approved.",
  },
];

export const SCAN_STATION_STROKE_MIN = 1;
export const SCAN_STATION_STROKE_MAX = 20;

export type ScanStationCellState = "filled" | "blank" | "invalid";

/** A number from 1 to 20, or X, is a recorded hole. Everything else is not. */
export function scanStationCellState(
  value: string | number | null | undefined,
): ScanStationCellState {
  const raw = String(value ?? "").trim();
  if (raw === "") return "blank";
  if (raw.toUpperCase() === "X") return "filled";
  if (!/^\d{1,2}$/.test(raw)) return "invalid";
  const strokes = Number(raw);
  return strokes >= SCAN_STATION_STROKE_MIN && strokes <= SCAN_STATION_STROKE_MAX
    ? "filled"
    : "invalid";
}

export interface ScanStationExportInput {
  holes: readonly { number: number }[];
  strokes: Readonly<Record<number, string>>;
  /** Non-blocking notes such as a weak read, a total mismatch or an existing card. */
  warnings?: readonly string[];
}

export interface ScanStationExportReadiness {
  ready: boolean;
  filled: number;
  missing: number[];
  invalid: number[];
  blockers: string[];
  warnings: string[];
  label: string;
}

/**
 * The owner's only hard gate: every hole has a value.
 *
 * Warnings are returned unchanged and never change `ready`. The station shows them next to the
 * Export button; the person decides whether to fix them.
 */
export function scanStationExportReadiness(
  input: ScanStationExportInput,
): ScanStationExportReadiness {
  const missing: number[] = [];
  const invalid: number[] = [];
  let filled = 0;

  for (const hole of input.holes) {
    const state = scanStationCellState(input.strokes[hole.number]);
    if (state === "filled") {
      filled += 1;
    } else if (state === "blank") {
      missing.push(hole.number);
    } else {
      invalid.push(hole.number);
    }
  }

  const blockers: string[] = [];
  if (input.holes.length === 0) {
    blockers.push("This round has no holes.");
  }
  for (const hole of missing) {
    blockers.push(`Hole ${hole} has no score.`);
  }
  for (const hole of invalid) {
    blockers.push(`Hole ${hole} needs a number from 1 to 20, or X.`);
  }

  const ready = blockers.length === 0;
  const label = ready
    ? "Ready to export"
    : input.holes.length === 0
      ? "No holes in this round"
      : missing.length > 0 && invalid.length === 0
        ? `Fill ${missing.length} ${missing.length === 1 ? "hole" : "holes"}`
        : invalid.length > 0 && missing.length === 0
          ? `Fix ${invalid.length} ${invalid.length === 1 ? "hole" : "holes"}`
          : `Fill ${missing.length}, fix ${invalid.length}`;

  return {
    ready,
    filled,
    missing,
    invalid,
    blockers,
    warnings: [...(input.warnings ?? [])],
    label,
  };
}
