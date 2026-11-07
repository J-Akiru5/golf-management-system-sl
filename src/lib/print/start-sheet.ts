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
