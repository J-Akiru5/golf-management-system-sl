import { describe, expect, it } from "vitest";
import type { EditorJson } from "@/lib/db/types";
import { previewBlocks, summarizeContent } from "./preview";

const doc: EditorJson = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Costs" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Green fees and " },
        { type: "text", text: "caddies", marks: [{ type: "bold" }] },
        { type: "text", text: " for the day." },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Green fee" }] }],
        },
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Caddie fee" }] }],
        },
      ],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableHeader",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }],
            },
            {
              type: "tableHeader",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Cost" }] }],
            },
          ],
        },
      ],
    },
  ],
};

describe("previewBlocks", () => {
  it("reads headings, paragraphs, list items and table rows in order", () => {
    expect(previewBlocks(doc)).toEqual([
      { kind: "heading", level: 2, text: "Costs" },
      { kind: "paragraph", text: "Green fees and caddies for the day." },
      { kind: "list-item", text: "Green fee" },
      { kind: "list-item", text: "Caddie fee" },
      { kind: "paragraph", text: "Item | Cost" },
    ]);
  });

  it("stops at the limit", () => {
    expect(previewBlocks(doc, 2)).toHaveLength(2);
  });

  it("returns nothing for an empty document", () => {
    expect(previewBlocks({ type: "doc", content: [] })).toEqual([]);
    expect(previewBlocks({ type: "doc" })).toEqual([]);
  });
});

describe("summarizeContent", () => {
  it("joins the first blocks and truncates with three dots", () => {
    expect(summarizeContent(doc, 20)).toBe("Costs Green fees...");
    expect(summarizeContent(doc)).toContain("Caddie fee");
  });

  it("is empty when there are no words", () => {
    expect(summarizeContent({ type: "doc", content: [] })).toBe("");
  });
});
