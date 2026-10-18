import { describe, expect, it } from "vitest";
import { paginate } from "@/lib/data/paging";
import { resolvePage, sortStable } from "./usePagedList";

interface Row {
  id: string;
  name: string;
}

const row = (id: string, name: string): Row => ({ id, name });

describe("resolvePage", () => {
  it("keeps the reader on the page they chose while the filter is unchanged", () => {
    expect(resolvePage({ page: 3, key: "all" }, "all")).toBe(3);
  });

  it("returns to page 1 as soon as the filter changes, without an extra render", () => {
    expect(resolvePage({ page: 3, key: "all" }, "needs_review")).toBe(1);
    expect(resolvePage({ page: 3, key: "query=a" }, "query=ab")).toBe(1);
  });

  it("never reads past the end after a filter shrinks the list", () => {
    // The state still says page 4, but the new key makes the safe answer page 1, and paginate()
    // clamps that to the last real page if the filtered list is shorter still.
    const filtered = [row("a", "Ana"), row("b", "Ben")];
    const page = paginate(filtered, resolvePage({ page: 4, key: "all" }, "ready"), 50);
    expect(page.page).toBe(1);
    expect(page.items.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("sortStable", () => {
  it("breaks ties on the id, so equal rows keep a fixed order", () => {
    const rows = [row("c", "Ana"), row("a", "Ana"), row("b", "Ana")];
    expect(sortStable(rows, (a, b) => a.name.localeCompare(b.name)).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("orders by the comparator first", () => {
    const rows = [row("a", "Zoe"), row("b", "Ana")];
    expect(sortStable(rows, (a, b) => a.name.localeCompare(b.name)).map((r) => r.name)).toEqual([
      "Ana",
      "Zoe",
    ]);
  });

  it("gives the same order however the rows arrived, so a tie cannot make a row jump pages", () => {
    // Two rows tie on name after an edit. The id decides, so the order is the same whichever way
    // the underlying list happens to be built.
    const byName = (x: Row, y: Row) => x.name.localeCompare(y.name);
    const tied = [row("b", "Same"), row("a", "Same")];
    expect(sortStable(tied, byName).map((r) => r.id)).toEqual(["a", "b"]);
    expect(sortStable([...tied].reverse(), byName).map((r) => r.id)).toEqual(["a", "b"]);

    // A tie that lands on a page boundary is stable too: the same rows give the same page.
    const rows = [row("p1", "Alpha"), row("p2", "Same"), row("p3", "Same")];
    const first = sortStable(rows, byName).map((r) => r.id);
    const second = sortStable([...rows].reverse(), byName).map((r) => r.id);
    expect(first).toEqual(second);
    expect(paginate(sortStable(rows, byName), 1, 2).items.map((r) => r.id)).toEqual(["p1", "p2"]);
  });

  it("does not mutate the array it is given", () => {
    const rows = [row("b", "B"), row("a", "A")];
    sortStable(rows, (a, b) => a.name.localeCompare(b.name));
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });
});
