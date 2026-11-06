import { describe, expect, it } from "vitest";
import { pageWindow } from "./pagination";

const items = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("pageWindow", () => {
  it("slices the first page and reports the range", () => {
    const w = pageWindow(items(60), 0, 25);
    expect(w.items[0]).toBe(1);
    expect(w.items).toHaveLength(25);
    expect(w).toMatchObject({ page: 0, pageCount: 3, from: 1, to: 25, total: 60 });
  });

  it("gives the last page only what is left", () => {
    const w = pageWindow(items(60), 2, 25);
    expect(w.items).toHaveLength(10);
    expect(w).toMatchObject({ from: 51, to: 60 });
  });

  it("clamps a page that no longer exists after the checks change", () => {
    const w = pageWindow(items(12), 5, 25);
    expect(w).toMatchObject({ page: 0, pageCount: 1, from: 1, to: 12 });
  });

  it("handles an empty list", () => {
    expect(pageWindow([], 3)).toMatchObject({ page: 0, pageCount: 1, from: 0, to: 0, total: 0 });
  });
});
