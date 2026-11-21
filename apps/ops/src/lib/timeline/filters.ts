import type { TimelineItem, TimelineKind } from "./types";

/**
 * The Timeline filters: by kind and by person.
 *
 * Pure, so the page can call them on every render and the tests can pin the awkward cases. An empty
 * kind list means every kind, which is what the chips do when the last one is switched off.
 */

/** A person id, or this word for the items that have nobody on them. */
export const UNASSIGNED = "unassigned";

export type TimelineFilter = {
  kinds: ReadonlyArray<TimelineKind>;
  /** Null means everyone. `UNASSIGNED` means the items with no person. */
  person: string | null;
};

export const ALL_KINDS_FILTER: TimelineFilter = { kinds: [], person: null };

export function filterItems(
  items: ReadonlyArray<TimelineItem>,
  filter: TimelineFilter,
): TimelineItem[] {
  const kinds = filter.kinds.length === 0 ? null : new Set(filter.kinds);

  return items.filter((item) => {
    if (kinds !== null && !kinds.has(item.kind)) return false;

    if (filter.person === null) return true;
    if (filter.person === UNASSIGNED) return item.people.length === 0;
    return item.people.includes(filter.person);
  });
}

/** Every person id that appears on an item, sorted so the picker is stable. */
export function peopleIn(items: ReadonlyArray<TimelineItem>): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    for (const person of item.people) seen.add(person);
  }
  return [...seen].sort();
}

export type PersonOption = { id: string; label: string };

/**
 * The person picker's options: everyone on an item, named from the member list, plus the
 * unassigned group when there is one. A person id with no member row is left out rather than shown
 * as a raw id.
 */
export function personOptions(
  items: ReadonlyArray<TimelineItem>,
  memberNames: ReadonlyMap<string, string>,
): PersonOption[] {
  const options: PersonOption[] = [];

  for (const id of peopleIn(items)) {
    const name = memberNames.get(id);
    if (name !== undefined && name.trim() !== "") options.push({ id, label: name });
  }

  options.sort((a, b) => a.label.localeCompare(b.label));

  if (items.some((item) => item.people.length === 0)) {
    options.push({ id: UNASSIGNED, label: "Unassigned" });
  }

  return options;
}

/** True when the filter would hide nothing, so the view can say "no filter". */
export function isFilterEmpty(filter: TimelineFilter): boolean {
  return filter.kinds.length === 0 && filter.person === null;
}
