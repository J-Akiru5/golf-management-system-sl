import type { DrawGroup } from "@/lib/draw/validate";
import { groupRowLabels, pairingsColumns } from "@/lib/print/pairings";
import { UNCLASSIFIED_LABEL } from "@/lib/routing";
import {
  buildPairingSections,
  type PairingCategorization,
  type PairingFlight,
} from "./pairing-sections";

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
  /** How to group the sections. Defaults to class, the older order. */
  categorization?: PairingCategorization;
  /** The flight for a group when flight grouping is chosen. */
  flightOf?: (group: DrawGroup) => PairingFlight | null;
}

/**
 * Builds the compact table view of the draw, in the same section order the draw page uses.
 * Pure: no I/O, no mutation of the input groups.
 */
export function buildDrawTable(input: BuildDrawTableInput): DrawTableSection[] {
  const { groups, startFormat, playerName, flightName, isUnclassified } = input;
  const noun = startFormat === "shotgun" ? "HOLE" : "TEE";

  // Group by start time and the chosen category, then sort inside a flight by hole. The class stays
  // on the row as a sub-value when flight grouping is chosen.
  const sections = buildPairingSections({
    groups,
    categorization: input.categorization ?? "class",
    classNameOf: (g) => (isUnclassified(g) ? UNCLASSIFIED_LABEL : flightName(g.flightId)),
    flightOf: input.flightOf ?? (() => null),
  });

  const result: DrawTableSection[] = [];
  for (const section of sections) {
    const columns = pairingsColumns(
      section.groups.map((g) => g.playerIds.length),
      4,
    );
    const labels = groupRowLabels(section.groups, noun);
    const tableGroups: DrawTableGroup[] = section.groups.map((g, index) => {
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
    result.push({
      key: section.key,
      heading: section.heading,
      groups: tableGroups,
      columns,
    });
  }

  return result;
}
