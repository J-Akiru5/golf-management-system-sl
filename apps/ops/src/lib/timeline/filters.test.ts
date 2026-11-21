import { describe, expect, it } from "vitest";
import {
  ALL_KINDS_FILTER,
  filterItems,
  isFilterEmpty,
  peopleIn,
  personOptions,
  UNASSIGNED,
} from "./filters";
import type { TimelineItem } from "./types";

function item(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: "item-1",
    kind: "card",
    title: "Item",
    detail: null,
    start: "2026-11-10",
    end: "2026-11-12",
    prepStart: null,
    milestone: false,
    href: null,
    people: [],
    basis: null,
    ...overrides,
  };
}

const items: TimelineItem[] = [
  item({ id: "a", kind: "card", people: ["user-mara"] }),
  item({ id: "b", kind: "task", people: ["user-joel"] }),
  item({ id: "c", kind: "tournament" }),
  item({ id: "d", kind: "card", people: ["user-mara", "user-joel"] }),
];

describe("filterItems", () => {
  it("shows everything when no kind is chosen and no person is picked", () => {
    expect(filterItems(items, ALL_KINDS_FILTER)).toHaveLength(4);
    expect(isFilterEmpty(ALL_KINDS_FILTER)).toBe(true);
  });

  it("keeps only the chosen kinds", () => {
    expect(filterItems(items, { kinds: ["card"], person: null }).map((entry) => entry.id)).toEqual([
      "a",
      "d",
    ]);
  });

  it("keeps a person's items, including shared ones", () => {
    expect(filterItems(items, { kinds: [], person: "user-joel" }).map((entry) => entry.id)).toEqual(
      ["b", "d"],
    );
  });

  it("keeps only the items with nobody on them", () => {
    expect(filterItems(items, { kinds: [], person: UNASSIGNED }).map((entry) => entry.id)).toEqual([
      "c",
    ]);
  });

  it("combines both filters", () => {
    expect(
      filterItems(items, { kinds: ["task"], person: "user-mara" }).map((entry) => entry.id),
    ).toEqual([]);
  });

  it("reports a filter once either half is set", () => {
    expect(isFilterEmpty({ kinds: ["card"], person: null })).toBe(false);
    expect(isFilterEmpty({ kinds: [], person: "user-mara" })).toBe(false);
  });
});

describe("peopleIn and personOptions", () => {
  it("lists each person once, sorted", () => {
    expect(peopleIn(items)).toEqual(["user-joel", "user-mara"]);
  });

  it("names people from the member list and adds the unassigned group", () => {
    const names = new Map([
      ["user-mara", "Mara Santos"],
      ["user-joel", "Joel Reyes"],
    ]);

    expect(personOptions(items, names)).toEqual([
      { id: "user-joel", label: "Joel Reyes" },
      { id: "user-mara", label: "Mara Santos" },
      { id: UNASSIGNED, label: "Unassigned" },
    ]);
  });

  it("leaves out a person the member list cannot name, rather than showing an id", () => {
    expect(personOptions(items, new Map([["user-mara", "Mara Santos"]]))).toEqual([
      { id: "user-mara", label: "Mara Santos" },
      { id: UNASSIGNED, label: "Unassigned" },
    ]);
  });

  it("does not offer the unassigned group when every item has a person", () => {
    expect(
      personOptions([item({ people: ["user-mara"] })], new Map([["user-mara", "Mara"]])),
    ).toEqual([{ id: "user-mara", label: "Mara" }]);
  });
});
