import { describe, expect, it } from "vitest";
import {
  ALL_MONTHS,
  ALL_OWNERS,
  type BoardFilter,
  filterCards,
  filterIsActive,
  hasUndatedCards,
  matchesFilter,
  monthFilterFromValue,
  monthsIn,
  monthValueForFilter,
  NO_MONTH,
  ownerFilterFromValue,
  ownerValueForFilter,
  quotedTotals,
  UNASSIGNED_OWNER,
} from "./filters";
import type { BoardCard } from "./repo";

function card(overrides: Partial<BoardCard>): BoardCard {
  return {
    id: "card-1",
    tournament_id: null,
    title: "Card",
    club_name: "Club",
    stage: "inquiry",
    position: 1000,
    start_date: null,
    end_date: null,
    expected_players: null,
    pricing_model: null,
    quoted_amount: null,
    currency: "PHP",
    owner_id: null,
    notes: null,
    created_by: "user-1",
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

const cards: BoardCard[] = [
  card({
    id: "a",
    owner_id: "mara",
    start_date: "2026-12-01",
    quoted_amount: 100,
    currency: "PHP",
  }),
  card({ id: "b", owner_id: null, start_date: "2026-12-20", quoted_amount: 50, currency: "PHP" }),
  card({ id: "c", owner_id: "joel", start_date: "2027-01-05", quoted_amount: 25, currency: "USD" }),
  card({ id: "d", owner_id: "mara", start_date: null, quoted_amount: null, currency: "PHP" }),
];

describe("filterCards", () => {
  it("shows everything when no filter is set", () => {
    expect(filterCards(cards, {}).map((entry) => entry.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("filters by owner", () => {
    expect(filterCards(cards, { ownerId: "mara" }).map((entry) => entry.id)).toEqual(["a", "d"]);
  });

  it("filters unassigned cards", () => {
    expect(filterCards(cards, { ownerId: null }).map((entry) => entry.id)).toEqual(["b"]);
  });

  it("filters by month of the start date", () => {
    expect(filterCards(cards, { month: "2026-12" }).map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("filters cards with no date", () => {
    expect(filterCards(cards, { month: null }).map((entry) => entry.id)).toEqual(["d"]);
  });

  it("combines both filters", () => {
    expect(
      filterCards(cards, { ownerId: "mara", month: "2026-12" }).map((entry) => entry.id),
    ).toEqual(["a"]);
  });

  it("treats an empty string as no filter", () => {
    const filter: BoardFilter = { ownerId: undefined, month: undefined };
    expect(matchesFilter(cards[0] as BoardCard, filter)).toBe(true);
  });
});

describe("select values", () => {
  it("round-trips the owner value", () => {
    expect(ownerFilterFromValue(ALL_OWNERS)).toBeUndefined();
    expect(ownerFilterFromValue(UNASSIGNED_OWNER)).toBeNull();
    expect(ownerFilterFromValue("mara")).toBe("mara");
    expect(ownerValueForFilter(undefined)).toBe(ALL_OWNERS);
    expect(ownerValueForFilter(null)).toBe(UNASSIGNED_OWNER);
    expect(ownerValueForFilter("mara")).toBe("mara");
  });

  it("round-trips the month value", () => {
    expect(monthFilterFromValue(ALL_MONTHS)).toBeUndefined();
    expect(monthFilterFromValue(NO_MONTH)).toBeNull();
    expect(monthFilterFromValue("2026-12")).toBe("2026-12");
    expect(monthValueForFilter(undefined)).toBe(ALL_MONTHS);
    expect(monthValueForFilter(null)).toBe(NO_MONTH);
    expect(monthValueForFilter("2026-12")).toBe("2026-12");
  });

  it("knows when a filter is active", () => {
    expect(filterIsActive({})).toBe(false);
    expect(filterIsActive({ ownerId: null })).toBe(true);
    expect(filterIsActive({ month: "2026-12" })).toBe(true);
  });
});

describe("monthsIn", () => {
  it("lists the months present, oldest first, and ignores missing dates", () => {
    expect(monthsIn(cards)).toEqual(["2026-12", "2027-01"]);
  });

  it("knows when some cards have no date", () => {
    expect(hasUndatedCards(cards)).toBe(true);
    expect(hasUndatedCards([cards[0] as BoardCard])).toBe(false);
  });
});

describe("quotedTotals", () => {
  it("adds per currency and never across currencies", () => {
    expect(quotedTotals(cards)).toEqual([
      { currency: "PHP", total: 150 },
      { currency: "USD", total: 25 },
    ]);
  });

  it("returns nothing when no card has a quoted amount", () => {
    expect(quotedTotals([card({})])).toEqual([]);
  });
});
