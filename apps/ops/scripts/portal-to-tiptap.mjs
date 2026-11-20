#!/usr/bin/env node
/**
 * Convert a static HTML page into a Tiptap document and a SQL insert for `ws_docs`.
 *
 *   node scripts/portal-to-tiptap.mjs <input.html> [outdir]
 *
 * The default outdir is `seed/out`, which is git-ignored. The source page and the converted files
 * stay out of the repository: this script never copies the page into it.
 *
 * What is kept: headings, paragraphs, ordered and unordered lists, tables, bold and italic, in the
 * order they appear. Diagrams, images and scripted widgets become a short paragraph that says what
 * was left out, so the reader knows something is missing rather than silently losing it.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/** Tags that only wrap other content. The walker goes through them in place. */
const CONTAINER_TAGS = new Set([
  "#root",
  "body",
  "html",
  "main",
  "section",
  "article",
  "header",
  "footer",
  "nav",
  "aside",
  "div",
  "figure",
  "dl",
]);

/** Dropped without a note: they carry no readable content and no heading or prose. */
const SILENT_TAGS = new Set(["head", "title", "meta", "link", "base", "noscript", "template"]);

const INLINE_TAGS = new Set([
  "a",
  "b",
  "br",
  "code",
  "em",
  "i",
  "mark",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
]);

const IMPLICIT_CLOSE = {
  p: ["p"],
  li: ["li"],
  tr: ["tr"],
  td: ["td", "th"],
  th: ["td", "th"],
  dt: ["dt", "dd"],
  dd: ["dt", "dd"],
  option: ["option"],
};

const OMITTED = {
  svg: "Diagram omitted",
  img: "Image omitted",
  canvas: "Widget omitted",
  video: "Widget omitted",
  audio: "Widget omitted",
  iframe: "Widget omitted",
  object: "Widget omitted",
  embed: "Widget omitted",
  button: "Widget omitted",
  input: "Widget omitted",
  select: "Widget omitted",
  textarea: "Widget omitted",
};

export function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, code) => safeCodePoint(Number(code), _))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => safeCodePoint(Number.parseInt(code, 16), _));
}

function safeCodePoint(code, fallback) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

function findTagEnd(html, start) {
  let quote = null;
  for (let index = start + 1; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") return index;
  }
  return -1;
}

function parseTag(raw) {
  const trimmed = raw.trimEnd();
  const selfClosing = trimmed.endsWith("/");
  const body = selfClosing ? trimmed.slice(0, -1) : trimmed;
  const name = body.match(/^\s*([a-zA-Z][a-zA-Z0-9:-]*)/);
  if (!name) return { tag: "", attrs: {}, selfClosing };
  const rest = body.slice(name[0].length);
  const attrs = {};
  const pattern = /([:@a-zA-Z_][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`=]+)))?/g;
  let match = pattern.exec(rest);
  while (match) {
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[match[1].toLowerCase()] = decodeEntities(value);
    match = pattern.exec(rest);
  }
  return { tag: name[1].toLowerCase(), attrs, selfClosing };
}

/**
 * A small, tolerant HTML tree. Script and style content never enters the tree, so nothing from a
 * page's behaviour can reach the document.
 */
export function parseHtml(html) {
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const lower = html.toLowerCase();
  let index = 0;

  const current = () => stack[stack.length - 1] ?? root;

  function addText(raw) {
    if (!raw) return;
    current().children.push({ tag: "#text", text: decodeEntities(raw) });
  }

  function closeTag(tag) {
    for (let depth = stack.length - 1; depth > 0; depth -= 1) {
      if (stack[depth].tag === tag) {
        stack.length = depth;
        return;
      }
    }
  }

  while (index < html.length) {
    const open = html.indexOf("<", index);
    if (open === -1) {
      addText(html.slice(index));
      break;
    }
    if (open > index) addText(html.slice(index, open));

    if (html.startsWith("<!--", open)) {
      const end = html.indexOf("-->", open + 4);
      index = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith("<!", open)) {
      const end = html.indexOf(">", open);
      index = end === -1 ? html.length : end + 1;
      continue;
    }

    const close = findTagEnd(html, open);
    if (close === -1) {
      addText(html.slice(open));
      break;
    }
    const raw = html.slice(open + 1, close);
    index = close + 1;

    if (raw.startsWith("/")) {
      closeTag(raw.slice(1).trim().toLowerCase());
      continue;
    }

    const { tag, attrs, selfClosing } = parseTag(raw);
    if (!tag) continue;

    if (tag === "script" || tag === "style") {
      const end = lower.indexOf(`</${tag}`, index);
      if (end === -1) {
        index = html.length;
      } else {
        const endOfTag = html.indexOf(">", end);
        index = endOfTag === -1 ? html.length : endOfTag + 1;
      }
      continue;
    }

    const implicit = IMPLICIT_CLOSE[tag];
    if (implicit) {
      while (stack.length > 1 && implicit.includes(current().tag)) stack.pop();
    }

    const node = { tag, attrs, children: [] };
    current().children.push(node);
    if (!selfClosing && !VOID_TAGS.has(tag)) stack.push(node);
  }

  return root;
}

function findFirst(node, tag) {
  if (node.tag === tag) return node;
  for (const child of node.children ?? []) {
    const found = findFirst(child, tag);
    if (found) return found;
  }
  return null;
}

function collapse(text) {
  return text.replace(/\s+/g, " ");
}

function textContent(node) {
  if (node.tag === "#text") return node.text;
  if (node.tag === "br") return " ";
  return (node.children ?? []).map(textContent).join("");
}

function altText(node) {
  const attrs = node.attrs ?? {};
  for (const key of ["aria-label", "alt", "title", "data-title", "name"]) {
    const value = attrs[key];
    if (typeof value === "string" && value.trim()) return collapse(value).trim();
  }
  return null;
}

function widgetLabel(node) {
  const own = collapse(textContent(node)).trim();
  if (own) return own;
  const alt = altText(node);
  if (alt) return alt;
  const placeholder = node.attrs?.placeholder;
  if (typeof placeholder === "string" && placeholder.trim()) return collapse(placeholder).trim();
  return null;
}

function omittedParagraph(node) {
  const kind = OMITTED[node.tag];
  if (!kind) return null;
  const label = kind === "Widget omitted" ? widgetLabel(node) : altText(node);
  // A source that marks an element decorative is telling us it carries no meaning. Skip it rather
  // than fill the document with notes about icons.
  const attrs = node.attrs ?? {};
  const decorative =
    (attrs["aria-hidden"] ?? "").toLowerCase() === "true" ||
    (attrs.role ?? "").toLowerCase() === "presentation";
  if (!label && decorative) return null;
  return {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: `${kind}: ${label ?? "no description in the source"}.`,
      },
    ],
  };
}

function marksKey(marks) {
  return marks.map((mark) => mark.type).join("+");
}

function collectInline(nodes, marks, out) {
  for (const node of nodes) {
    if (node.tag === "#text") {
      const text = collapse(node.text);
      if (!text) continue;
      out.push({ type: "text", text, marks });
      continue;
    }
    if (node.tag === "br") {
      out.push({ type: "hardBreak" });
      continue;
    }
    if (node.tag === "img" || node.tag === "svg") {
      const omitted = omittedParagraph(node);
      if (omitted) {
        const text = omitted.content[0].text;
        out.push({ type: "text", text: ` ${text} `, marks });
      }
      continue;
    }
    if (node.tag === "strong" || node.tag === "b") {
      collectInline(node.children ?? [], [...marks, { type: "bold" }], out);
      continue;
    }
    if (node.tag === "em" || node.tag === "i") {
      collectInline(node.children ?? [], [...marks, { type: "italic" }], out);
      continue;
    }
    // Any other inline wrapper keeps its text and drops its own styling.
    collectInline(node.children ?? [], marks, out);
  }
}

/** Trim the edges, drop empty text, and merge text that carries the same marks. */
function normalizeInline(nodes) {
  const kept = [];
  for (const node of nodes) {
    if (node.type === "text") {
      const text = collapse(node.text);
      if (!text) continue;
      const previous = kept[kept.length - 1];
      if (
        previous?.type === "text" &&
        marksKey(previous.marks ?? []) === marksKey(node.marks ?? [])
      ) {
        previous.text += text;
      } else {
        kept.push({ type: "text", text, marks: node.marks ?? [] });
      }
    } else {
      kept.push(node);
    }
  }

  const first = kept[0];
  if (first?.type === "text") first.text = first.text.replace(/^\s+/, "");
  const last = kept[kept.length - 1];
  if (last?.type === "text") last.text = last.text.replace(/\s+$/, "");

  const tidy = kept.filter((node) => node.type !== "text" || node.text.length > 0);
  return tidy.map((node) => {
    if (node.type !== "text") return node;
    return (node.marks ?? []).length > 0
      ? { type: "text", text: node.text, marks: node.marks }
      : { type: "text", text: node.text };
  });
}

function paragraphFromInline(nodes) {
  const content = normalizeInline(nodes);
  return content.length > 0 ? { type: "paragraph", content } : null;
}

function headingBlock(node) {
  const inline = [];
  collectInline(node.children ?? [], [], inline);
  const content = normalizeInline(inline);
  if (content.length === 0) return null;
  const level = Number.parseInt(node.tag.slice(1), 10);
  if (level <= 3) {
    return { type: "heading", attrs: { level }, content };
  }
  // The editor's heading levels stop at 3; a deeper heading becomes a bold paragraph.
  return {
    type: "paragraph",
    content: content.map((child) =>
      child.type === "text"
        ? { ...child, marks: [...(child.marks ?? []), { type: "bold" }] }
        : child,
    ),
  };
}

function listBlock(node) {
  const items = [];
  for (const child of node.children ?? []) {
    if (child.tag !== "li") continue;
    const parts = [];
    let inline = [];
    const flush = () => {
      const paragraph = paragraphFromInline(inline);
      if (paragraph) parts.push(paragraph);
      inline = [];
    };
    for (const grandchild of child.children ?? []) {
      if (grandchild.tag === "#text" || INLINE_TAGS.has(grandchild.tag)) {
        collectInline([grandchild], [], inline);
        continue;
      }
      if (grandchild.tag === "ul" || grandchild.tag === "ol") {
        flush();
        parts.push(listBlock(grandchild));
        continue;
      }
      flush();
      const block = blockFor(grandchild);
      if (block) parts.push(block);
    }
    flush();
    if (parts[0]?.type !== "paragraph") parts.unshift({ type: "paragraph" });
    items.push({ type: "listItem", content: parts });
  }

  if (items.length === 0) return null;
  return { type: node.tag === "ol" ? "orderedList" : "bulletList", content: items };
}

function tableBlock(node) {
  const rows = [];
  const addRow = (row) => {
    const cells = (row.children ?? [])
      .filter((cell) => cell.tag === "td" || cell.tag === "th")
      .map((cell) => ({
        header: cell.tag === "th",
        text: collapse(textContent(cell)).trim(),
      }));
    if (cells.length === 0) return;
    rows.push({
      type: "tableRow",
      content: cells.map((cell) => ({
        type: cell.header ? "tableHeader" : "tableCell",
        content: [
          cell.text.length > 0
            ? { type: "paragraph", content: [{ type: "text", text: cell.text }] }
            : { type: "paragraph" },
        ],
      })),
    });
  };

  for (const child of node.children ?? []) {
    if (child.tag === "tr") {
      addRow(child);
    } else if (child.tag === "thead" || child.tag === "tbody" || child.tag === "tfoot") {
      for (const row of child.children ?? []) if (row.tag === "tr") addRow(row);
    }
  }

  return rows.length > 0 ? { type: "table", content: rows } : null;
}

function codeBlock(node) {
  const text = (node.children ?? [])
    .map(textContent)
    .join("")
    .replace(/\r\n/g, "\n")
    .replace(/^\n+/, "")
    .replace(/\s+$/, "");
  return text ? { type: "codeBlock", content: [{ type: "text", text }] } : null;
}

/** One block from one element. Containers are handled by convertBlocks, not here. */
function blockFor(node) {
  if (node.tag === "#text") {
    return paragraphFromInline([{ type: "text", text: node.text, marks: [] }]);
  }
  if (SILENT_TAGS.has(node.tag)) return null;
  if (/^h[1-6]$/.test(node.tag)) return headingBlock(node);
  if (node.tag === "p") {
    const inline = [];
    collectInline(node.children ?? [], [], inline);
    return paragraphFromInline(inline);
  }
  if (node.tag === "ul" || node.tag === "ol") return listBlock(node);
  if (node.tag === "table") return tableBlock(node);
  if (node.tag === "pre") return codeBlock(node);
  if (node.tag === "hr") return { type: "horizontalRule" };
  if (node.tag === "blockquote") {
    const content = convertBlocks(node.children ?? []);
    return content.length > 0 ? { type: "blockquote", content } : null;
  }
  if (node.tag === "dt" || node.tag === "figcaption") {
    const inline = [];
    collectInline(node.children ?? [], [], inline);
    const paragraph = paragraphFromInline(inline);
    if (!paragraph) return null;
    if (node.tag === "dt") {
      paragraph.content = paragraph.content.map((child) =>
        child.type === "text"
          ? { ...child, marks: [...(child.marks ?? []), { type: "bold" }] }
          : child,
      );
    }
    return paragraph;
  }
  if (node.tag === "dd") {
    const inline = [];
    collectInline(node.children ?? [], [], inline);
    return paragraphFromInline(inline);
  }
  if (OMITTED[node.tag]) return omittedParagraph(node);
  const converted = convertBlocks(node.children ?? []);
  return converted.length > 0 ? converted : null;
}

/** An ordered run of blocks for a list of sibling nodes. Inline runs become paragraphs. */
function convertBlocks(nodes, out = []) {
  let inline = [];
  const flush = () => {
    const paragraph = paragraphFromInline(inline);
    if (paragraph) out.push(paragraph);
    inline = [];
  };

  for (const node of nodes) {
    if (node.tag === "#text" || INLINE_TAGS.has(node.tag)) {
      collectInline([node], [], inline);
      continue;
    }
    flush();
    if (CONTAINER_TAGS.has(node.tag)) {
      convertBlocks(node.children ?? [], out);
      continue;
    }
    const block = blockFor(node);
    if (Array.isArray(block)) out.push(...block);
    else if (block) out.push(block);
  }

  flush();
  return out;
}

/** The page title: its <title>, else its first h1, else the file name the caller supplies. */
export function pageTitle(tree, fallback) {
  const title = findFirst(tree, "title");
  const fromTitle = title ? collapse(textContent(title)).trim() : "";
  if (fromTitle) return fromTitle;
  const heading = findFirst(tree, "h1");
  const fromHeading = heading ? collapse(textContent(heading)).trim() : "";
  if (fromHeading) return fromHeading;
  return fallback;
}

export function convertPage(html, options = {}) {
  const tree = parseHtml(html);
  const body = findFirst(tree, "body") ?? tree;
  const content = convertBlocks(body.children ?? []);
  const title = pageTitle(tree, options.fallbackTitle ?? "Untitled document");
  if (title.length === 0)
    throw new Error("The page has no title and no file name to fall back on.");
  if (title.length > 200) {
    throw new Error(
      `The page title is ${title.length} characters, over the 200 character limit. Shorten it in doc.sql.`,
    );
  }
  return { title, doc: { type: "doc", content } };
}

export function toSql({ title, id }) {
  const safeTitle = title.replace(/'/g, "''");
  return [
    "-- Generated by scripts/portal-to-tiptap.mjs. Review the title, then run this in the",
    "-- Supabase SQL editor for the workspace project. This creates the document row only:",
    "-- the body is imported by the first editor that opens the document (see seed/README.md).",
    `insert into public.ws_docs (id, title)`,
    `values ('${id}', '${safeTitle}')`,
    `on conflict (id) do nothing;`,
    "",
  ].join("\n");
}

function main(argv) {
  const [input, outdirArg] = argv;
  if (!input) {
    console.error("Usage: node scripts/portal-to-tiptap.mjs <input.html> [outdir]");
    process.exitCode = 1;
    return;
  }

  const outdir = outdirArg ? resolve(outdirArg) : resolve(process.cwd(), "seed", "out");
  const html = readFileSync(resolve(input), "utf8");
  const fallbackTitle = basename(input, extname(input)) || "Untitled document";
  const { title, doc } = convertPage(html, { fallbackTitle });
  const id = randomUUID();

  mkdirSync(outdir, { recursive: true });
  writeFileSync(join(outdir, "doc.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  writeFileSync(join(outdir, "doc.sql"), toSql({ title, id }), "utf8");

  console.log(`Wrote ${join(outdir, "doc.json")} and ${join(outdir, "doc.sql")}.`);
  console.log(`Title: ${title}`);
  console.log(`Document id: ${id}`);
  console.log(
    "Set OPS_DOC_SEED_ID to that id where the app runs, so the first editor imports doc.json.",
  );
  console.log(`${doc.content.length} top level blocks.`);
}

const invoked = process.argv[1] ? resolve(process.argv[1]).toLowerCase() : "";
const self = fileURLToPath(import.meta.url).toLowerCase();
if (invoked && invoked === self) main(process.argv.slice(2));
