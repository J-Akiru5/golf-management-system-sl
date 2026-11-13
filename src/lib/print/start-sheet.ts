export type PrintStartFormat = "shotgun" | "two_tee";

export interface SortableStartGroup {
  number: number;
  startHole: number;
  time: string;
}

export interface StartGroupSection<T extends SortableStartGroup> {
  key: string;
  /** The time displayed for the section. Groups that start together share it. */
  time: string;
  groups: T[];
}

/** Returns a new array in play order. The input is never mutated. */
export function sortStartGroups<T extends SortableStartGroup>(
  groups: readonly T[],
  _startFormat: PrintStartFormat,
): T[] {
  return groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => {
      const first = a.group;
      const second = b.group;
      return (
        first.time.localeCompare(second.time) ||
        first.startHole - second.startHole ||
        first.number - second.number ||
        a.index - b.index
      );
    })
    .map(({ group }) => group);
}

/** One start wave inside a session: the groups that tee off together, labelled "Flight A", "B"... */
export interface StartFlight<T extends SortableStartGroup> {
  /** "A", "B"... in tee-off order. Past Z the count is written instead of inventing letters. */
  letter: string;
  /** The label printed on the sheet, e.g. "Flight A". */
  name: string;
  /** The wave's tee-off time, "HH:MM". */
  time: string;
  /** In hole order, then group number. */
  groups: T[];
}

/** One sheet of paper: every morning wave, or every afternoon wave, of a day. */
export interface StartSession<T extends SortableStartGroup> {
  key: "am" | "pm";
  label: "AM" | "PM";
  flights: StartFlight<T>[];
}

/** The clock time the morning ends and the afternoon begins. Presentation only. */
export const SESSION_NOON = "12:00";

/**
 * Splits a day's groups into its morning and afternoon sessions, and each session into flights. A
 * flight is one start wave: the groups that share a tee-off time. The first wave of a session is
 * Flight A, the next Flight B, and so on. A session with no groups is left out. Pure; the input is
 * never mutated.
 */
export function groupSessions<T extends SortableStartGroup>(
  groups: readonly T[],
  startFormat: PrintStartFormat,
  noon: string = SESSION_NOON,
): StartSession<T>[] {
  const sessions: StartSession<T>[] = [];
  for (const [key, label, inSession] of [
    ["am", "AM", (time: string) => time < noon],
    ["pm", "PM", (time: string) => time >= noon],
  ] as const) {
    const flights = groupStartGroups(
      groups.filter((group) => inSession(group.time)),
      startFormat,
    ).map((section, index): StartFlight<T> => {
      const letter = index < 26 ? String.fromCharCode(65 + index) : `#${index + 1}`;
      return { letter, name: `Flight ${letter}`, time: section.time, groups: section.groups };
    });
    if (flights.length > 0) sessions.push({ key, label, flights });
  }
  return sessions;
}

/** Groups starts by the time they tee off. A session can have more than one start time. */
export function groupStartGroups<T extends SortableStartGroup>(
  groups: readonly T[],
  startFormat: PrintStartFormat,
): StartGroupSection<T>[] {
  const sections = new Map<string, StartGroupSection<T>>();

  for (const group of sortStartGroups(groups, startFormat)) {
    const key = `time:${group.time}`;
    const section = sections.get(key);

    if (section) {
      section.groups.push(group);
    } else {
      sections.set(key, { key, time: group.time, groups: [group] });
    }
  }

  return [...sections.values()];
}
