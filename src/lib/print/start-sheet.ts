export type PrintStartFormat = "shotgun" | "two_tee";

export interface SortableStartGroup {
  number: number;
  startHole: number;
  wave: string | null;
  time: string;
}

export interface StartGroupSection<T extends SortableStartGroup> {
  key: string;
  wave: string | null;
  /** The time displayed for the section. Shotgun groups in a wave share a start time. */
  time: string;
  groups: T[];
}

/** Returns a new array in play order. The input is never mutated. */
export function sortStartGroups<T extends SortableStartGroup>(
  groups: readonly T[],
  startFormat: PrintStartFormat,
): T[] {
  return groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => {
      const first = a.group;
      const second = b.group;
      const order =
        startFormat === "shotgun"
          ? (first.wave ?? "").localeCompare(second.wave ?? "") ||
            first.startHole - second.startHole ||
            first.time.localeCompare(second.time)
          : first.time.localeCompare(second.time) || first.startHole - second.startHole;
      return order || first.number - second.number || a.index - b.index;
    })
    .map(({ group }) => group);
}

/** Groups shotgun starts by wave and two-tee starts by their shared tee-off time. */
export function groupStartGroups<T extends SortableStartGroup>(
  groups: readonly T[],
  startFormat: PrintStartFormat,
): StartGroupSection<T>[] {
  const sections = new Map<string, StartGroupSection<T>>();

  for (const group of sortStartGroups(groups, startFormat)) {
    const wave = startFormat === "shotgun" ? group.wave : null;
    const key = startFormat === "shotgun" ? `wave:${wave ?? "unassigned"}` : `time:${group.time}`;
    const section = sections.get(key);

    if (section) {
      section.groups.push(group);
    } else {
      sections.set(key, { key, wave, time: group.time, groups: [group] });
    }
  }

  return [...sections.values()];
}
