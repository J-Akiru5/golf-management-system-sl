import { describe, expect, it } from "vitest";
import { orderTeeCards, type TeeCardOrderFields } from "./tee-card-order";

interface TestCard extends TeeCardOrderFields {
  key: string;
}

function card(
  key: string,
  teeTime: string | null,
  session: "AM" | "PM" | null,
  startHole: number | null,
  ...names: string[]
): TestCard {
  return { key, teeTime, session, startHole, players: names.map((name) => ({ name })) };
}

/** The card keys in the order the helper returned them. */
function keys(cards: readonly TestCard[]): string[] {
  return orderTeeCards(cards).map((item) => item.key);
}

describe("orderTeeCards", () => {
  it("puts the morning before the afternoon, whatever order the cards arrive in", () => {
    const cards = [
      card("pm-early", "12:30", "PM", 2, "Cruz, Ana"),
      card("am-late", "07:10", "AM", 2, "Reyes, Ben"),
      card("pm-late", "13:00", "PM", 8, "Santos, Cid"),
      card("am-early", "06:30", "AM", 5, "Dela Cruz, Jun"),
    ];
    expect(keys(cards)).toEqual(["am-early", "am-late", "pm-early", "pm-late"]);
  });

  it("orders a shotgun by starting hole, not by the first player's name", () => {
    const cards = [
      card("hole-14", "06:30", "AM", 14, "Abad, Lito"),
      card("hole-2", "06:30", "AM", 2, "Zamora, Pat"),
      card("hole-8", "06:30", "AM", 8, "Bautista, Mia"),
      card("hole-5", "06:30", "AM", 5, "Cruz, Ana"),
    ];
    expect(keys(cards)).toEqual(["hole-2", "hole-5", "hole-8", "hole-14"]);
  });

  it("reads hours and minutes as a clock when the times differ", () => {
    const cards = [
      card("later", "10:05", "AM", 1, "Cruz, Ana"),
      card("earliest", "09:55", "AM", 9, "Reyes, Ben"),
      card("middle", "10:00", "AM", 4, "Santos, Cid"),
    ];
    expect(keys(cards)).toEqual(["earliest", "middle", "later"]);
  });

  it("accepts a stored time with seconds", () => {
    const cards = [
      card("with-seconds", "06:30:00", "AM", 2, "Cruz, Ana"),
      card("plain", "06:30", "AM", 3, "Reyes, Ben"),
    ];
    expect(keys(cards)).toEqual(["with-seconds", "plain"]);
  });

  it("puts a card without a starting hole after the cards that have one", () => {
    const cards = [
      card("no-hole", "06:30", "AM", null, "Abad, Lito"),
      card("hole-3", "06:30", "AM", 3, "Zamora, Pat"),
      card("hole-1", "06:30", "AM", 1, "Bautista, Mia"),
    ];
    expect(keys(cards)).toEqual(["hole-1", "hole-3", "no-hole"]);
  });

  it("puts a start that is not confirmed yet after every confirmed card", () => {
    const cards = [
      card("unconfirmed", null, null, null, "Abad, Lito"),
      card("pm", "12:30", "PM", 18, "Zamora, Pat"),
      card("am", "06:30", "AM", 7, "Bautista, Mia"),
    ];
    expect(keys(cards)).toEqual(["am", "pm", "unconfirmed"]);
  });

  it("puts a time it cannot read after the readable times", () => {
    const cards = [
      card("unreadable", "not a time", "AM", 2, "Abad, Lito"),
      card("readable", "06:30", "AM", 9, "Zamora, Pat"),
    ];
    expect(keys(cards)).toEqual(["readable", "unreadable"]);
  });

  it("breaks a full tie by the first player's name", () => {
    const cards = [
      card("zamora", "06:30", "AM", 4, "Zamora, Pat", "Abad, Lito"),
      card("abad", "06:30", "AM", 4, "Abad, Lito", "Zamora, Pat"),
      card("bautista", "06:30", "AM", 4, "Bautista, Mia"),
    ];
    expect(keys(cards)).toEqual(["abad", "bautista", "zamora"]);
  });

  it("keeps the existing order when even the first name ties", () => {
    const cards = [
      card("first", "06:30", "AM", 4, "Cruz, Ana"),
      card("second", "06:30", "AM", 4, "Cruz, Ana"),
    ];
    expect(keys(cards)).toEqual(["first", "second"]);
  });

  it("returns a new array and leaves the input alone", () => {
    const cards = [
      card("hole-8", "06:30", "AM", 8, "Abad, Lito"),
      card("hole-2", "06:30", "AM", 2, "Zamora, Pat"),
    ];
    const ordered = orderTeeCards(cards);
    expect(ordered.map((item) => item.key)).toEqual(["hole-2", "hole-8"]);
    expect(cards.map((item) => item.key)).toEqual(["hole-8", "hole-2"]);
    expect(ordered).not.toBe(cards);
  });

  it("keeps the players inside a card in their existing order", () => {
    const cards = [card("a", "06:30", "AM", 2, "Zamora, Pat", "Abad, Lito", "Cruz, Ana")];
    expect(orderTeeCards(cards)[0]?.players.map((player) => player.name)).toEqual([
      "Zamora, Pat",
      "Abad, Lito",
      "Cruz, Ana",
    ]);
  });

  it("has nothing to order on an empty board", () => {
    expect(orderTeeCards([])).toEqual([]);
  });
});
