import { describe, expect, it } from "vitest";
import { DEFAULT_RESULT_LIMIT, filterOptions } from "./combobox";

const players = [
  { id: "1", label: "Allan Magalanes", hint: "NGAP 1001" },
  { id: "2", label: "Benjie Peña", hint: "NGAP 2002" },
  { id: "3", label: "Carlos Reyes", hint: "NGAP 3003" },
  { id: "4", label: "Allan Cruz", hint: "NGAP 4004" },
];

describe("filterOptions", () => {
  it("returns everything, capped, when nothing is typed", () => {
    const empty = filterOptions(players, "   ");
    expect(empty.total).toBe(4);
    expect(empty.results).toHaveLength(4);
    expect(filterOptions(players, "", 2).results).toHaveLength(2);
  });

  it("puts a name that starts with the query above one that only contains it", () => {
    const { results } = filterOptions(players, "allan");
    expect(results.map((player) => player.id)).toEqual(["1", "4"]);
  });

  it("ignores case and accents", () => {
    expect(filterOptions(players, "PENA").results.map((player) => player.id)).toEqual(["2"]);
    expect(filterOptions(players, "peña").results.map((player) => player.id)).toEqual(["2"]);
  });

  it("finds a player by the secondary line", () => {
    expect(filterOptions(players, "3003").results.map((player) => player.id)).toEqual(["3"]);
  });

  it("reports the full match count while limiting the rows drawn", () => {
    const { results, total } = filterOptions(players, "a", 2);
    expect(total).toBe(4);
    expect(results).toHaveLength(2);
  });

  it("returns no rows for a query that matches nothing", () => {
    expect(filterOptions(players, "zzz")).toEqual({ results: [], total: 0 });
  });

  it("keeps a sane limit", () => {
    expect(DEFAULT_RESULT_LIMIT).toBe(50);
    expect(filterOptions(players, "", 0).results).toHaveLength(1);
  });
});
