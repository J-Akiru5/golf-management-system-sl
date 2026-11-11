import { describe, expect, it } from "vitest";
import { bulkConfirmCopy } from "./bulk-confirm";

describe("the bulk confirm button and its note", () => {
  it("names the filter rather than the page, and the real count", () => {
    const { label } = bulkConfirmCopy({ count: 12, filtered: true, pageCount: 3 });
    expect(label).toBe("Confirm 12 entries in this filter");
    // "shown" is the wording that made the button look like it acted on the visible page only.
    expect(label).not.toContain("shown");
  });

  it("names the whole event when no search narrows the list", () => {
    expect(bulkConfirmCopy({ count: 1, filtered: false, pageCount: 1 }).label).toBe(
      "Confirm 1 entry in this event",
    );
  });

  it("says the batch spans every page of the filter", () => {
    const { note } = bulkConfirmCopy({ count: 12, filtered: true, pageCount: 3 });
    expect(note).toContain("this filter");
    expect(note).toContain("across all 3 pages");
    expect(note).toContain("not only the rows on this page");
  });

  it("says there is no undo, before the tap", () => {
    const { note } = bulkConfirmCopy({ count: 12, filtered: false, pageCount: 1 });
    expect(note).toContain("cannot be undone");
    expect(note).toContain("this event");
  });
});
