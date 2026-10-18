import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, isPaged, pageLabel, paginate } from "./paging";

const rows = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("paginate", () => {
  it("uses 50 rows per page by default", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(50);
    expect(paginate(rows(126), 1).items).toHaveLength(50);
  });

  it("counts pages and reports the rows on show", () => {
    const p = paginate(rows(126), 2);
    expect(p).toMatchObject({ page: 2, pageCount: 3, from: 51, to: 100, total: 126 });
    expect(p.items[0]).toBe(51);
    expect(p.hasPrev).toBe(true);
    expect(p.hasNext).toBe(true);
  });

  it("gives a short last page", () => {
    const p = paginate(rows(126), 3);
    expect(p.items).toHaveLength(26);
    expect(p.to).toBe(126);
    expect(p.hasNext).toBe(false);
  });

  it("clamps a page that no longer exists, so a filter cannot strand you past the end", () => {
    expect(paginate(rows(10), 9).page).toBe(1);
    expect(paginate(rows(126), 99).page).toBe(3);
    expect(paginate(rows(126), 0).page).toBe(1);
  });

  it("handles an empty list without pretending there is a page of rows", () => {
    const p = paginate([], 1);
    expect(p).toMatchObject({ items: [], page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
    expect(pageLabel(p)).toBe("No rows");
    expect(isPaged(p)).toBe(false);
  });

  it("does not show a pager for a list that fits on one page", () => {
    expect(isPaged(paginate(rows(50), 1))).toBe(false);
    expect(isPaged(paginate(rows(51), 1))).toBe(true);
  });

  it("labels the range the way the desk reads it", () => {
    expect(pageLabel(paginate(rows(126), 1))).toBe("1–50 of 126");
    expect(pageLabel(paginate(rows(126), 3))).toBe("101–126 of 126");
  });
});
