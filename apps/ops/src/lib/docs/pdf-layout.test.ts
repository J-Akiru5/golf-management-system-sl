import { describe, expect, it } from "vitest";
import { type PdfTextItem, pdfPagesToDocument } from "./pdf-layout";

function item(
  str: string,
  x: number,
  y: number,
  options: { height?: number; fontName?: string; hasEOL?: boolean } = {},
): PdfTextItem {
  return {
    str,
    x,
    y,
    height: options.height ?? 12,
    fontName: options.fontName ?? "Body",
    hasEOL: options.hasEOL ?? false,
  };
}

/** One page of body text at one size, with the baseline falling by 14 points per line. */
function bodyPage(lines: string[], size = 12): PdfTextItem[] {
  return lines.map((line, index) => item(line, 72, 700 - index * 14, { height: size }));
}

describe("grouping lines and paragraphs", () => {
  it("joins items on the same baseline and splits paragraphs on a large gap", () => {
    const page = [
      item("First", 72, 700),
      item("line", 105, 700),
      item("continues", 72, 686),
      item("here", 130, 686),
      item("New", 72, 660),
      item("paragraph", 104, 660),
    ];

    const { html } = pdfPagesToDocument([page]);

    expect(html).toContain("<p>First line continues here</p>");
    expect(html).toContain("<p>New paragraph</p>");
  });

  it("treats baselines within the small tolerance as one line", () => {
    const page = [item("One", 72, 700), item("line", 110, 700.8)];

    const { html } = pdfPagesToDocument([page]);

    expect(html).toContain("<p>One line</p>");
  });
});

describe("headings by size", () => {
  it("makes the largest text an h2 and a smaller heading an h3", () => {
    const page = [
      item("Report title", 72, 740, { height: 18 }),
      item("Details", 72, 720, { height: 14 }),
      item("The body text runs on for a while.", 72, 700, { height: 10 }),
      item("It carries most of the words on the page.", 72, 686, { height: 10 }),
    ];

    const { html, heading } = pdfPagesToDocument([page]);

    expect(html).toContain("<h2>Report title</h2>");
    expect(html).toContain("<h3>Details</h3>");
    expect(html).toContain(
      "<p>The body text runs on for a while. It carries most of the words on the page.</p>",
    );
    expect(heading).toBe("Report title");
  });

  it("does not make body text a heading when every line is the same size", () => {
    const { html } = pdfPagesToDocument([bodyPage(["First", "Second", "Third"])]);

    expect(html).not.toContain("<h2>");
    expect(html).not.toContain("<h3>");
  });
});

describe("lists", () => {
  it("turns bullet lines into a bullet list and numbered lines into an ordered list", () => {
    const page = [
      item("• First point", 72, 700),
      item("• Second point", 72, 686),
      item("1. First step", 72, 660),
      item("2) Second step", 72, 646),
    ];

    const { html } = pdfPagesToDocument([page]);

    expect(html).toContain("<ul><li><p>First point</p></li><li><p>Second point</p></li></ul>");
    expect(html).toContain("<ol><li><p>First step</p></li><li><p>Second step</p></li></ol>");
    expect(html).not.toContain("• First");
  });

  it("accepts a dash or a star as a bullet marker", () => {
    const page = [item("- Dashed", 72, 700), item("* Starred", 72, 686)];

    const { html } = pdfPagesToDocument([page]);

    expect(html).toContain("<ul><li><p>Dashed</p></li><li><p>Starred</p></li></ul>");
  });
});

describe("a column table", () => {
  it("builds a table when three or more lines share the same two columns", () => {
    const page = [
      item("Item", 72, 700),
      item("Cost", 200, 700),
      item("Green fee", 72, 680),
      item("One thousand", 200, 680),
      item("Caddie", 72, 660),
      item("Two hundred", 200, 660),
    ];

    const { html } = pdfPagesToDocument([page]);

    expect(html).toContain("<table>");
    expect(html).toContain("<tr><td><p>Item</p></td><td><p>Cost</p></td></tr>");
    expect(html).toContain("<tr><td><p>Green fee</p></td><td><p>One thousand</p></td></tr>");
    expect(html).toContain("<tr><td><p>Caddie</p></td><td><p>Two hundred</p></td></tr>");
  });

  it("keeps paragraphs when the columns drift and the table is not certain", () => {
    const page = [
      item("First", 72, 700),
      item("column", 200, 700),
      item("Second", 102, 680),
      item("column", 230, 680),
      item("Third", 132, 660),
      item("column", 260, 660),
    ];

    const { html } = pdfPagesToDocument([page]);

    expect(html).not.toContain("<table>");
    expect(html).toContain("<p>First column</p>");
    expect(html).toContain("<p>Second column</p>");
    expect(html).toContain("<p>Third column</p>");
  });

  it("keeps two aligned lines as paragraphs, because a table needs three", () => {
    const page = [
      item("One", 72, 700),
      item("Two", 200, 700),
      item("Three", 72, 680),
      item("Four", 200, 680),
    ];

    const { html } = pdfPagesToDocument([page]);

    expect(html).not.toContain("<table>");
  });
});

describe("hyphenated line breaks", () => {
  it("joins a word split across two lines", () => {
    const page = [item("analy-", 72, 700), item("tics report", 72, 686)];

    const { html } = pdfPagesToDocument([page]);

    expect(html).toContain("<p>analytics report</p>");
    expect(html).not.toContain("analy-");
  });
});

describe("repeated headers and footers", () => {
  it("drops a header, a footer and page numbers that repeat across pages", () => {
    const pages = [
      [
        item("Analytics report", 72, 760, { height: 10 }),
        item("Body one", 72, 700),
        item("Foot", 72, 30, { height: 10 }),
        item("1", 300, 20, { height: 10 }),
      ],
      [
        item("Analytics report", 72, 760, { height: 10 }),
        item("Body two", 72, 700),
        item("Foot", 72, 30, { height: 10 }),
        item("2", 300, 20, { height: 10 }),
      ],
    ];

    const { html } = pdfPagesToDocument(pages);

    expect(html).not.toContain("Analytics report");
    expect(html).not.toContain("Foot");
    expect(html).not.toContain("<p>1</p>");
    expect(html).not.toContain("<p>2</p>");
    expect(html).toContain("<p>Body one</p>");
    expect(html).toContain("<p>Body two</p>");
  });

  it("keeps a line that only appears on one page", () => {
    const pages = [
      [item("Only on page one", 72, 760, { height: 10 }), item("Body one", 72, 700)],
      [item("A different header", 72, 760, { height: 10 }), item("Body two", 72, 700)],
    ];

    const { html } = pdfPagesToDocument(pages);

    expect(html).toContain("Only on page one");
    expect(html).toContain("A different header");
  });
});

describe("escaping and empty input", () => {
  it("escapes every piece of text", () => {
    const page = [item("<script>alert(1)</script> & more", 72, 700)];

    const { html } = pdfPagesToDocument([page]);

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; more");
    expect(html).not.toContain("<script>");
  });

  it("returns empty HTML for no pages or a page with no text", () => {
    expect(pdfPagesToDocument([])).toEqual({ html: "", heading: null });
    expect(pdfPagesToDocument([[]])).toEqual({ html: "", heading: null });
    expect(pdfPagesToDocument([[item("   ", 72, 700)]])).toEqual({ html: "", heading: null });
  });
});

describe("the rule between pages", () => {
  it("draws a rule only when the next page starts with a heading", () => {
    const first = bodyPage(["Intro text"]);
    const second = [
      item("Next", 72, 700, { height: 18 }),
      item("Body text here", 72, 680, { height: 12 }),
    ];

    const { html } = pdfPagesToDocument([first, second]);

    expect(html).toContain("<p>Intro text</p>\n<hr>\n<h2>Next</h2>");
  });

  it("draws no rule when the next page starts with a paragraph", () => {
    const first = bodyPage(["Intro text"]);
    const second = bodyPage(["More text"]);

    const { html } = pdfPagesToDocument([first, second]);

    expect(html).not.toContain("<hr>");
    expect(html).toContain("<p>Intro text</p>");
    expect(html).toContain("<p>More text</p>");
  });
});
