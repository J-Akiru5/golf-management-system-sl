import type { DrawGroup } from "@/lib/draw/validate";
import { fmtTime } from "@/lib/format";
import { groupRowLabels, pairingsColumns } from "@/lib/print/pairings";
import { UNCLASSIFIED_LABEL } from "@/lib/routing";

/** One name slot in a table row: a player, or an empty cell for a short group. */
export type DrawTableCell = { playerId: string; name: string } | null;

export interface DrawTableGroup {
  /** Group number on the draw board. */
  number: number;
  /** Hole or tee label for the row, e.g. HOLE 3 or HOLE 3B. */
  label: string;
  /** Flight or class name shown in the table. */
  flightName: string;
  locked: boolean;
  /** One cell per player column, in playing order. */
  cells: DrawTableCell[];
}

export interface DrawTableSection {
  /** Stable key for the section (same value the draw page uses). */
  key: string;
  /** Section heading, e.g. "07:00 · Men's A" or "Unclassified". */
  heading: string;
  groups: DrawTableGroup[];
  /** Number of player columns in this section (2..4). */
  columns: number;
}

export interface BuildDrawTableInput {
  groups: readonly DrawGroup[];
  startFormat: "shotgun" | "two_tee";
  playerName: (id: string) => string;
  flightName: (flightId: string | null) => string;
  isUnclassified: (group: DrawGroup) => boolean;
}

/**
 * Builds the compact table view of the draw, in the same section order the draw page uses.
 * Pure: no I/O, no mutation of the input groups.
 */
export function buildDrawTable(input: BuildDrawTableInput): DrawTableSection[] {
  const { groups, startFormat, playerName, flightName, isUnclassified } = input;
  const noun = startFormat === "shotgun" ? "HOLE" : "TEE";

  // Group by start time + class, keeping the order groups first appear (matches the draw page).
  const sections = new Map<string, DrawGroup[]>();
  for (const g of groups) {
    const key = isUnclassified(g)
      ? UNCLASSIFIED_LABEL
      : `${fmtTime(g.time)} · ${flightName(g.flightId)}`;
    const existing = sections.get(key);
    if (existing) {
      existing.push(g);
    } else {
      sections.set(key, [g]);
    }
  }

  const result: DrawTableSection[] = [];
  for (const [key, sectionGroups] of sections) {
    const columns = pairingsColumns(
      sectionGroups.map((g) => g.playerIds.length),
      4,
    );
    const labels = groupRowLabels(sectionGroups, noun);
    const tableGroups: DrawTableGroup[] = sectionGroups.map((g, index) => {
      const cells: DrawTableCell[] = Array.from({ length: columns }, (_, col) => {
        const playerId = g.playerIds[col];
        if (playerId === undefined) return null;
        return { playerId, name: playerName(playerId) };
      });
      return {
        number: g.number,
        label: labels[index] ?? `${noun} ${g.startHole}`,
        flightName: isUnclassified(g) ? UNCLASSIFIED_LABEL : flightName(g.flightId),
        locked: g.locked,
        cells,
      };
    });
    result.push({ key, heading: key, groups: tableGroups, columns });
  }

  return result;
}
