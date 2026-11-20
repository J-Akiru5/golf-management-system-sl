import { describe, expect, it } from "vitest";
import { columnDroppableId, resolveDrop, sortItems } from "./target";

type Item = { id: string; columnId: string; position: number };

const ITEMS: Item[] = [
  { id: "a", columnId: "todo", position: 1000 },
  { id: "b", columnId: "todo", position: 2000 },
  { id: "c", columnId: "todo", position: 3000 },
  { id: "x", columnId: "doing", position: 1000 },
  { id: "y", columnId: "doing", position: 2000 },
];

function drop(activeId: string, overId: string | null, items: Item[] = ITEMS) {
  return resolveDrop({ activeId, overId, items });
}

describe("sortItems", () => {
  it("sorts by position then id without mutating the input", () => {
    const sorted = sortItems([
      { id: "b", columnId: "todo", position: 2 },
      { id: "a", columnId: "todo", position: 1 },
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("resolveDrop", () => {
  it("appends when a card is dropped on a column", () => {
    expect(drop("a", columnDroppableId("doing"))).toEqual({
      id: "a",
      toColumnId: "doing",
      beforeId: "y",
      afterId: null,
    });
  });

  it("places a card above the card it was dropped on", () => {
    expect(drop("c", "x")).toEqual({
      id: "c",
      toColumnId: "doing",
      beforeId: null,
      afterId: "x",
    });
  });

  it("places a card between two cards it was dropped onto", () => {
    expect(drop("a", "y")).toEqual({
      id: "a",
      toColumnId: "doing",
      beforeId: "x",
      afterId: "y",
    });
  });

  it("reorders inside one column", () => {
    expect(drop("c", "a")).toEqual({
      id: "c",
      toColumnId: "todo",
      beforeId: null,
      afterId: "a",
    });
  });

  it("ignores a drop on itself", () => {
    expect(drop("a", "a")).toBeNull();
  });

  it("ignores a drop that would not change the order", () => {
    // b is already between a and c, and it is dropped on c.
    expect(drop("b", "c")).toBeNull();
    // a is already the first card and it is dropped on b.
    expect(drop("a", "b")).toBeNull();
    // c is already last in its column and it is dropped on the column.
    expect(drop("c", columnDroppableId("todo"))).toBeNull();
  });

  it("ignores a drop with no target or an unknown card", () => {
    expect(drop("a", null)).toBeNull();
    expect(drop("a", "missing")).toBeNull();
    expect(drop("missing", "a")).toBeNull();
  });

  it("appends to an empty column", () => {
    expect(drop("a", columnDroppableId("done"))).toEqual({
      id: "a",
      toColumnId: "done",
      beforeId: null,
      afterId: null,
    });
  });
});
