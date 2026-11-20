import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../../../scripts/portal-to-tiptap.mjs", import.meta.url));

type JsonNode = {
  type: string;
  text?: string;
  marks?: { type: string }[];
  attrs?: { level?: number };
  content?: JsonNode[];
};

const FIXTURE = `<!doctype html>
<html lang="en">
  <head>
    <title>Owner's cost notes</title>
    <style>.cost { color: gold; }</style>
    <script>window.secret = "not for the document";</script>
  </head>
  <body>
    <header><svg aria-label="TeeLine Golf"><path d="M0 0"></path></svg></header>
    <h1>Cost notes</h1>
    <p>Green fees and <strong>caddies</strong> plus <em>transport</em>.</p>
    <ul>
      <li>Green fee</li>
      <li>Caddie fee<ul><li>Morning</li></ul></li>
    </ul>
    <ol>
      <li>Quote</li>
      <li>Confirm</li>
    </ol>
    <table>
      <thead><tr><th>Item</th><th>Cost</th></tr></thead>
      <tbody><tr><td>Green fee</td><td>1,500</td></tr></tbody>
    </table>
    <figure>
      <img src="tee-sheet.png" alt="Tee sheet layout">
      <figcaption>The tee sheet</figcaption>
    </figure>
    <button>Toggle theme</button>
    <svg aria-hidden="true"><path d="M1 1"></path></svg>
    <h4>Deep heading</h4>
    <div>Loose text in a div</div>
  </body>
</html>`;

function run(fixture: string) {
  const dir = mkdtempSync(join(tmpdir(), "portal-to-tiptap-"));
  const input = join(dir, "fixture.html");
  const out = join(dir, "out");
  writeFileSync(input, fixture, "utf8");
  execFileSync(process.execPath, [SCRIPT, input, out], { stdio: "pipe" });
  const doc = JSON.parse(readFileSync(join(out, "doc.json"), "utf8")) as JsonNode;
  const sql = readFileSync(join(out, "doc.sql"), "utf8");
  return { doc, sql };
}

function textOf(node: JsonNode): string {
  if (node.text) return node.text;
  return (node.content ?? []).map(textOf).join("");
}

describe("portal-to-tiptap", () => {
  const { doc, sql } = run(FIXTURE);
  const blocks = doc.content ?? [];

  it("writes a Tiptap document in the source order", () => {
    expect(doc.type).toBe("doc");
    expect(blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "heading",
      "paragraph",
      "bulletList",
      "orderedList",
      "table",
      "paragraph",
      "paragraph",
      "paragraph",
      "paragraph",
      "paragraph",
    ]);
    expect(textOf(blocks[1] as JsonNode)).toBe("Cost notes");
    expect((blocks[1] as JsonNode).attrs?.level).toBe(1);
  });

  it("keeps bold and italic", () => {
    const paragraph = blocks[2];
    if (!paragraph) throw new Error("paragraph missing");
    const marks = (paragraph.content ?? []).map((node) => ({
      text: node.text,
      marks: (node.marks ?? []).map((mark) => mark.type),
    }));
    expect(marks).toContainEqual({ text: "caddies", marks: ["bold"] });
    expect(marks).toContainEqual({ text: "transport", marks: ["italic"] });
    expect(textOf(paragraph)).toBe("Green fees and caddies plus transport.");
  });

  it("keeps lists, including a nested one", () => {
    const bullet = blocks[3];
    const ordered = blocks[4];
    expect(bullet?.type).toBe("bulletList");
    expect(bullet?.content).toHaveLength(2);
    const second = bullet?.content?.[1];
    expect(second?.content?.some((child) => child.type === "bulletList")).toBe(true);
    expect(ordered?.type).toBe("orderedList");
    expect((ordered?.content ?? []).map(textOf)).toEqual(["Quote", "Confirm"]);
  });

  it("keeps a table with its header row", () => {
    const table = blocks[5];
    expect(table?.type).toBe("table");
    expect(table?.content?.map((row) => row.type)).toEqual(["tableRow", "tableRow"]);
    const header = table?.content?.[0]?.content ?? [];
    expect(header.map((cell) => cell.type)).toEqual(["tableHeader", "tableHeader"]);
    expect(header.map(textOf)).toEqual(["Item", "Cost"]);
    const body = table?.content?.[1]?.content ?? [];
    expect(body.map((cell) => cell.type)).toEqual(["tableCell", "tableCell"]);
    expect(body.map(textOf)).toEqual(["Green fee", "1,500"]);
  });

  it("says what it left out instead of dropping it silently", () => {
    expect(textOf(blocks[0] as JsonNode)).toBe("Diagram omitted: TeeLine Golf.");
    expect(textOf(blocks[6] as JsonNode)).toBe("Image omitted: Tee sheet layout.");
    expect(textOf(blocks[7] as JsonNode)).toBe("The tee sheet");
    expect(textOf(blocks[8] as JsonNode)).toBe("Widget omitted: Toggle theme.");
  });

  it("turns a deep heading into a bold paragraph", () => {
    expect(blocks[9]?.type).toBe("paragraph");
    expect((blocks[9]?.content ?? []).map((mark) => mark.marks?.[0]?.type)).toEqual(["bold"]);
  });

  it("strips scripts and styles", () => {
    const text = JSON.stringify(doc);
    expect(text).not.toContain("window.secret");
    expect(text).not.toContain("not for the document");
    expect(text).not.toContain("color: gold");
    expect(text).not.toContain('"script"');
    expect(text).not.toContain('"style"');
    expect(text).not.toContain('"svg"');
    expect(text).not.toContain('"img"');
  });

  it("writes an insert for ws_docs with the page title and an escaped quote", () => {
    expect(sql).toContain("insert into public.ws_docs (id, title)");
    expect(sql).toContain("'Owner''s cost notes'");
    expect(sql).toContain("on conflict (id) do nothing;");
    expect(sql).toMatch(/values \('[0-9a-f-]{36}', /);
  });

  it("falls back to the file name when the page has no title", () => {
    const bare = run("<html><body><p>Only words</p></body></html>");
    expect(bare.sql).toContain("'fixture'");
    expect(bare.doc.content?.map(textOf)).toEqual(["Only words"]);
  });

  it("refuses a title over the database limit", () => {
    const longTitle = `<html><head><title>${"x".repeat(201)}</title></head><body></body></html>`;
    expect(() => run(longTitle)).toThrow();
  });
});
