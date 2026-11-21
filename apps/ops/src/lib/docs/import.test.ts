// @vitest-environment jsdom

import { generateJSON } from "@tiptap/core";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import {
  checkImportFile,
  convertDocument,
  IMPORT_MAX_BYTES,
  importKindFor,
  importVersionName,
  safeHref,
  titleFromFileName,
} from "./import";

/** The same extensions the editor opens documents with (see doc-editor.tsx). */
const EDITOR_EXTENSIONS = [
  StarterKit.configure({ undoRedo: false, heading: { levels: [1, 2, 3] } }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
];

function convert(name: string, text: string, kind: "html" | "markdown" | "text") {
  return convertDocument({ name, kind, text });
}

describe("the file check", () => {
  it("maps each accepted extension to its converter", () => {
    expect(importKindFor("notes.html")).toBe("html");
    expect(importKindFor("notes.HTM")).toBe("html");
    expect(importKindFor("notes.md")).toBe("markdown");
    expect(importKindFor("notes.markdown")).toBe("markdown");
    expect(importKindFor("notes.txt")).toBe("text");
    expect(importKindFor("notes.pdf")).toBeNull();
    expect(importKindFor("notes")).toBeNull();
  });

  it("refuses a file that is not one of the three kinds", () => {
    const result = checkImportFile({ name: "deck.pdf", size: 400 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(".html");
  });

  it("refuses an empty file", () => {
    const result = checkImportFile({ name: "notes.md", size: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("empty");
  });

  it("accepts a file at the limit and refuses one byte more", () => {
    expect(checkImportFile({ name: "notes.md", size: IMPORT_MAX_BYTES })).toEqual({
      ok: true,
      kind: "markdown",
    });

    const tooBig = checkImportFile({ name: "notes.md", size: IMPORT_MAX_BYTES + 1 });
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.error).toContain("2 MB");
  });
});

describe("the HTML converter", () => {
  it("keeps the element types the editor understands", () => {
    const { html, title } = convert(
      "club-notes.html",
      `<!doctype html><html><head><title>Not the title</title></head><body>
        <h1>Club notes</h1>
        <h2>Fees</h2>
        <h4>Deep heading</h4>
        <p>Plain <strong>bold</strong> and <em>italic</em> and <code>inline</code>.</p>
        <ul><li><p>First</p></li><li><p>Second</p></li></ul>
        <ol start="3"><li><p>Third</p></li></ol>
        <table>
          <caption>Membership</caption>
          <thead><tr><th>Item</th><th>Cost</th></tr></thead>
          <tbody><tr><td>Green fee</td><td>One thousand</td></tr></tbody>
        </table>
        <blockquote><p>Quoted line</p></blockquote>
        <pre><code>const a = 1;
const b = 2;</code></pre>
        <hr>
        <p><a href="https://example.test/page">A link</a></p>
        <p><b>Bold tag</b> and <i>italic tag</i></p>
      </body></html>`,
      "html",
    );

    expect(title).toBe("Club notes");
    expect(html).toContain("<h1>Club notes</h1>");
    expect(html).toContain("<h2>Fees</h2>");
    expect(html).toContain("<h3>Deep heading</h3>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<code>inline</code>");
    expect(html).toContain("<ul>");
    expect(html).toContain('<ol start="3">');
    expect(html).toContain("<table>");
    expect(html).toContain("<th>");
    expect(html).toContain("<td>");
    expect(html).toContain("<blockquote><p>Quoted line</p></blockquote>");
    expect(html).toContain("<pre><code>const a = 1;\nconst b = 2;</code></pre>");
    expect(html).toContain("<hr>");
    expect(html).toContain('<a href="https://example.test/page">A link</a>');
    expect(html).toContain("<strong>Bold tag</strong>");
    expect(html).toContain("<em>italic tag</em>");

    // A caption is not part of the editor's table, so it becomes the paragraph above it.
    expect(html).toContain("<p>Membership</p><table>");
  });

  it("removes every dangerous element with its contents", () => {
    const { html } = convert(
      "page.html",
      `<body>
        <h1>Safe title</h1>
        <script>alert("script ran")</script>
        <style>.x { color: red }</style>
        <link rel="stylesheet" href="https://example.test/a.css">
        <meta http-equiv="refresh" content="0">
        <iframe src="https://example.test/frame"></iframe>
        <object data="movie.swf"></object>
        <embed src="movie.swf">
        <form action="https://example.test/post"><p>Inside the form</p><input value="x"></form>
        <button>Press me</button>
        <svg><text>Drawing</text></svg>
        <noscript>Turn JavaScript on</noscript>
        <p>Safe text</p>
      </body>`,
      "html",
    );

    for (const gone of [
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "form",
      "button",
      "svg",
      "noscript",
      "<link",
      "<meta",
      "<input",
      "alert",
      "Turn JavaScript on",
      "Inside the form",
      "Drawing",
    ]) {
      expect(html).not.toContain(gone);
    }
    expect(html).toContain("<p>Safe text</p>");
  });

  it("strips event handlers, styles, ids and unknown attributes", () => {
    const { html } = convert(
      "attrs.html",
      `<body><p id="p1" class="lead" style="color:red" onclick="alert(1)">Text</p>
       <a href="https://example.test" onmouseover="alert(2)" target="_blank">Link</a></body>`,
      "html",
    );

    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onmouseover");
    expect(html).not.toContain("style=");
    expect(html).not.toContain("class=");
    expect(html).not.toContain("id=");
    expect(html).not.toContain("_blank");
    expect(html).toContain("<p>Text</p>");
    expect(html).toContain('<a href="https://example.test">Link</a>');
  });

  it("removes javascript, data and other unsafe links but keeps the words", () => {
    const { html } = convert(
      "links.html",
      `<body>
        <p><a href="javascript:alert(1)">First</a></p>
        <p><a href="java\nscript:alert(2)">Second</a></p>
        <p><a href="data:text/html,something">Third</a></p>
        <p><a href="#details">Jump</a> and <a href="mailto:someone@example.test">Write</a></p>
      </body>`,
      "html",
    );

    expect(html).not.toContain("javascript");
    expect(html).not.toContain("data:");
    expect(html).toContain("First");
    expect(html).toContain("Second");
    expect(html).toContain("Third");
    expect(html).toContain('<a href="#details">Jump</a>');
    expect(html).toContain('<a href="mailto:someone@example.test">Write</a>');
  });

  it("unwraps unknown elements to their text and keeps block boundaries", () => {
    const { html } = convert(
      "divs.html",
      `<body><div>Alpha</div><section>Beta <span>inside</span></section><p>Gamma</p></body>`,
      "html",
    );

    expect(html).toContain("<p>Alpha</p>");
    expect(html).toContain("<p>Beta inside</p>");
    expect(html).toContain("<p>Gamma</p>");
    expect(html).not.toContain("<div");
    expect(html).not.toContain("<span");
    expect(html).not.toContain("<section");
  });

  it("collapses empty nodes and whitespace", () => {
    const { html } = convert(
      "empty.html",
      `<body><p></p><p>   </p><p><br></p><h2> </h2><p>   Kept    text   </p></body>`,
      "html",
    );

    expect(html).not.toContain("<h2");
    expect(html.match(/<p>/g)?.length).toBe(1);
    expect(html).toContain("<p>Kept text</p>");
  });

  it("keeps table cells and their spans but drops stray table content", () => {
    const { html } = convert(
      "table.html",
      `<body><table><tr><td colspan="2">Wide</td><td rowspan="9">Tall</td></tr>
       <tr><td>One</td><td>Two</td><td>Three</td></tr></table></body>`,
      "html",
    );

    expect(html).toContain('colspan="2"');
    expect(html).toContain('rowspan="9"');
    expect(html).toContain("<td><p>One</p></td>");
  });

  it("drops a table with no rows and gives an empty cell a block", () => {
    const { html } = convert(
      "layout-table.html",
      "<body><table></table><table><tr><td></td></tr></table><p>After</p></body>",
      "html",
    );

    expect(html.match(/<table>/g)?.length).toBe(1);
    expect(html).toContain("<td><p></p></td>");
    expect(html).toContain("<p>After</p>");

    const json = generateJSON(html, EDITOR_EXTENSIONS) as { content?: Array<{ type: string }> };
    expect((json.content ?? []).map((node) => node.type)).toEqual(["table", "paragraph"]);
  });
});

describe("the Markdown converter", () => {
  it("converts headings, clamping them to the levels the editor keeps", () => {
    const { html, title } = convert(
      "notes.md",
      "# The title\n\n## Section\n\n###### Deep\n\nText",
      "markdown",
    );

    expect(title).toBe("The title");
    expect(html).toContain("<h1>The title</h1>");
    expect(html).toContain("<h2>Section</h2>");
    expect(html).toContain("<h3>Deep</h3>");
  });

  it("converts paragraphs, bold, italic, inline code and links", () => {
    const { html } = convert(
      "inline.md",
      "A **bold** word, an *italic* word, `some code` and a [link](https://example.test/page).",
      "markdown",
    );

    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<code>some code</code>");
    expect(html).toContain('<a href="https://example.test/page">link</a>');
  });

  it("keeps code spans and code blocks apart from the rest of the line", () => {
    const { html } = convert(
      "code.md",
      "Use `**not bold**` here.\n\n```\nconst tag = '<div>';\n```",
      "markdown",
    );

    expect(html).toContain("<code>**not bold**</code>");
    expect(html).toContain("<pre><code>const tag = '&lt;div&gt;';</code></pre>");
  });

  it("builds bullet and numbered lists, nested two levels", () => {
    const { html } = convert(
      "lists.md",
      "- One\n- Two\n  - Nested\n- Three\n\n1. First\n2. Second",
      "markdown",
    );

    expect(html).toContain("<ul><li><p>One</p></li>");
    expect(html).toContain("<li><p>Two</p><ul><li><p>Nested</p></li></ul></li>");
    expect(html).toContain("<li><p>Three</p></li></ul>");
    expect(html).toContain("<ol><li><p>First</p></li><li><p>Second</p></li></ol>");
  });

  it("converts blockquotes and horizontal rules", () => {
    const { html } = convert("quote.md", "> Quoted line\n\n---\n\nAfter", "markdown");

    expect(html).toContain("<blockquote><p>Quoted line</p></blockquote>");
    expect(html).toContain("<hr>");
    expect(html).toContain("<p>After</p>");
  });

  it("converts a pipe table with a header row", () => {
    const { html } = convert(
      "table.md",
      "| Item | Cost |\n| --- | --- |\n| Green fee | One thousand |\n| Caddie | Two hundred |",
      "markdown",
    );

    expect(html).toContain("<table><thead><tr>");
    expect(html).toContain("<th><p>Item</p></th>");
    expect(html).toContain("<th><p>Cost</p></th>");
    expect(html).toContain("<td><p>Green fee</p></td>");
    expect(html).toContain("<td><p>Two hundred</p></td>");
  });

  it("escapes HTML in the source instead of running it", () => {
    const { html } = convert("escape.md", "<script>alert(1)</script>", "markdown");

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("keeps the words of a link whose target is not safe", () => {
    const { html } = convert("bad-link.md", "[Do not run this](javascript:alert(1))", "markdown");

    expect(html).not.toContain("javascript");
    expect(html).toContain("Do not run this");
  });
});

describe("the plain text converter", () => {
  it("makes one paragraph per blank-line-separated block", () => {
    const { html } = convert(
      "notes.txt",
      "First line\nSecond line\n\nNext block\n\n\nLast",
      "text",
    );

    expect(html).toContain("<p>First line<br>Second line</p>");
    expect(html).toContain("<p>Next block</p>");
    expect(html).toContain("<p>Last</p>");
  });

  it("escapes HTML in the text", () => {
    const { html } = convert("notes.txt", "<b>Not bold</b>", "text");
    expect(html).toContain("&lt;b&gt;Not bold&lt;/b&gt;");
  });
});

describe("the suggested title", () => {
  it("uses the first h1 of an HTML file", () => {
    expect(convert("page.html", "<body><h1>From the heading</h1></body>", "html").title).toBe(
      "From the heading",
    );
  });

  it("falls back to the file name without its extension", () => {
    expect(convert("club-notes.html", "<body><h2>Not an h1</h2></body>", "html").title).toBe(
      "club-notes",
    );
    expect(convert("notes.txt", "No heading here", "text").title).toBe("notes");
    expect(titleFromFileName("folder/Meeting notes.md")).toBe("Meeting notes");
  });

  it("uses a level-one Markdown heading and ignores deeper ones", () => {
    expect(convert("notes.md", "# From Markdown\n\nText", "markdown").title).toBe("From Markdown");
    expect(convert("notes.md", "## Deeper only\n\nText", "markdown").title).toBe("notes");
  });

  it("does not take a heading from inside a code block", () => {
    expect(convert("notes.md", "```\n# Not a heading\n```\n\n# Real", "markdown").title).toBe(
      "Real",
    );
  });
});

describe("the converted HTML in the editor's schema", () => {
  it("parses into the node types the editor draws", () => {
    const { html } = convert(
      "all.md",
      "# Title\n\nA **bold** paragraph with a [link](https://example.test).\n\n- One\n- Two\n\n> Quoted\n\n---\n\n```\ncode\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |",
      "markdown",
    );

    const json = generateJSON(html, EDITOR_EXTENSIONS) as {
      type: string;
      content?: Array<{
        type: string;
        content?: Array<{ type: string; marks?: Array<{ type: string }> }>;
      }>;
    };

    expect(json.type).toBe("doc");
    const types = (json.content ?? []).map((node) => node.type);
    expect(types).toContain("heading");
    expect(types).toContain("paragraph");
    expect(types).toContain("bulletList");
    expect(types).toContain("blockquote");
    expect(types).toContain("horizontalRule");
    expect(types).toContain("codeBlock");
    expect(types).toContain("table");

    const paragraph = (json.content ?? []).find((node) => node.type === "paragraph");
    const marks = (paragraph?.content ?? []).flatMap((node) => node.marks ?? []);
    const markTypes = marks.map((mark) => mark.type);
    expect(markTypes).toContain("bold");
    expect(markTypes).toContain("link");
  });
});

describe("safe links", () => {
  it("keeps ordinary targets and refuses anything that can run code", () => {
    expect(safeHref("https://example.test/a")).toBe("https://example.test/a");
    expect(safeHref("/docs/1")).toBe("/docs/1");
    expect(safeHref("#part")).toBe("#part");
    expect(safeHref("mailto:someone@example.test")).toBe("mailto:someone@example.test");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("java\nscript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
});

describe("the version name", () => {
  it("names the first version after the file, within the snapshot limit", () => {
    expect(importVersionName("club-notes.md")).toBe("Imported from club-notes.md");
    expect(importVersionName(`${"a".repeat(300)}.md`).length).toBeLessThanOrEqual(120);
  });
});
