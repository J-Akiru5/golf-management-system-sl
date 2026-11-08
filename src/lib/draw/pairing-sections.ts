import { fmtTime } from "@/lib/format";
import { UNCLASSIFIED_LABEL } from "@/lib/routing";
import type { DrawGroup } from "./validate";

/**
 * How the draw board groups its cards (issue 205).
 *
 * `flight` is the default: Flight A, then B, then C, in start order, and inside a flight the holes
 * run in order 1..N. The class stays on each card as a sub-value. `class` is the older class-first
 * order, kept as a toggle. Pure: no I/O, no mutation of the input groups.
 */
export type PairingCategorization = "flight" | "class";

/** The flight a group was drawn into: its start time, letter and session. */
export interface PairingFlight {
  /** The flight's start time, "HH:MM". */
  time: string;
  /** The flight letter inside its session: "A" is the first group on the hole. */
  letter: string;
  /** "AM" or "PM" when the draw knows sessions, otherwise null. */
  session: string | null;
}

export interface BuildPairingSectionsInput {
  groups: readonly DrawGroup[];
  categorization: PairingCategorization;
  /** The class name shown as the sub-value, or UNCLASSIFIED_LABEL. */
  classNameOf: (group: DrawGroup) => string;
  /** The flight the group was drawn into, or null when it is not in the flight queue. */
  flightOf: (group: DrawGroup) => PairingFlight | null;
}

export interface PairingSection {
  /** Stable key, unique across sessions and flights. */
  key: string;
  /** Section heading, for example "6:30 AM · Flight A" or "6:30 AM · Class A". */
  heading: string;
  groups: DrawGroup[];
}

const UNSCHEDULED_KEY = "not-in-flight-queue";

/** Sort a flight section by its session, start time and letter. */
function compareFlightSections(a: PairingSection, b: PairingSection): number {
  if (a.key === UNSCHEDULED_KEY || b.key === UNSCHEDULED_KEY) {
    return a.key === UNSCHEDULED_KEY ? (b.key === UNSCHEDULED_KEY ? 0 : 1) : -1;
  }
  return a.key.localeCompare(b.key);
}

/**
 * Groups the draw into sections for the chosen categorization.
 *
 * Class mode keeps the old first-appearance order: one section per start time and class, with group
 * order untouched. Flight mode makes one section per session, start time and flight letter, sorts
 * the sections by start, and sorts each section's groups by hole and then group number. A group the
 * queue cannot place (an invalid start hole) still appears, in a final "not in the flight queue"
 * section, rather than disappearing.
 */
export function buildPairingSections({
  groups,
  categorization,
  classNameOf,
  flightOf,
}: BuildPairingSectionsInput): PairingSection[] {
  const sections = new Map<string, PairingSection>();

  for (const group of groups) {
    if (categorization === "class") {
      const className = classNameOf(group);
      const key =
        className === UNCLASSIFIED_LABEL
          ? UNCLASSIFIED_LABEL
          : `${fmtTime(group.time)} · ${className}`;
      const section = sections.get(key) ?? { key, heading: key, groups: [] };
      section.groups.push(group);
      sections.set(key, section);
      continue;
    }

    const flight = flightOf(group);
    const key = flight
      ? `${flight.session ?? "all"}:${flight.time}:${flight.letter}`
      : UNSCHEDULED_KEY;
    const heading = flight
      ? `${fmtTime(flight.time)} · Flight ${flight.letter}`
      : "Not in the flight queue";
    const section = sections.get(key) ?? { key, heading, groups: [] };
    section.groups.push(group);
    sections.set(key, section);
  }

  const result = [...sections.values()];
  if (categorization === "class") return result;

  for (const section of result) {
    section.groups.sort((a, b) => a.startHole - b.startHole || a.number - b.number);
  }
  return result.sort(compareFlightSections);
}
