/**
 * Importing a document from a file a member picks.
 *
 * The whole conversion runs in the browser: the file is read as text, turned into HTML that the
 * editor's own extensions accept (StarterKit and Table), and only then is a document created. The
 * source file is never uploaded and its content never enters the repository.
 *
 * The HTML path parses with `DOMParser` in an inert document, so nothing in the file can run. What
 * survives is a small whitelist: headings (levels 1 to 3, the levels the editor keeps), paragraphs,
 * lists, tables, blockquote, code, strong, em, links and rules. Everything else is unwrapped to its
 * text. Scripts, styles, frames, forms and other widgets are removed with their contents, together
 * with every attribute except a safe link target and a table cell's span.
 */

/** The largest file the dialog accepts. A longer document than this is better split. */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

/** The `accept` attribute for the file control. Kept in step with `importKindFor`. */
export const IMPORT_ACCEPT = ".html,.htm,.md,.markdown,.txt";

/** The same limit the documents repository enforces (`TITLE_MAX` in ./repo). */
const TITLE_MAX = 200;

/** The same limit the snapshots repository enforces (`SNAPSHOT_NAME_MAX` in ./repo). */
const VERSION_NAME_MAX = 120;

export type ImportKind = "html" | "markdown" | "text";

export type ImportFileInfo = { name: string; size: number };

export type ImportCheck = { ok: true; kind: ImportKind } | { ok: false; error: string };

/** What a converter produces: the editor HTML and the level-one heading it found, if any. */
export type ConvertedContent = { html: string; heading: string | null };

/** What the dialog needs: the editor HTML and the title to suggest. */
export type ConvertedImport = { html: string; title: string };

const KIND_BY_EXTENSION: Record<string, ImportKind> = {
  html: "html",
  htm: "html",
  md: "markdown",
  markdown: "markdown",
  txt: "text",
};

/** The converter for a file name, or null when the extension is not one we accept. */
export function importKindFor(name: string): ImportKind | null {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return null;
  return KIND_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? null;
}

/** The size and extension check. Everything the dialog needs to refuse a file before reading it. */
export function checkImportFile(file: ImportFileInfo): ImportCheck {
  const kind = importKindFor(file.name);
  if (kind === null) {
    return {
      ok: false,
      error: "Choose an HTML, Markdown or text file: .html, .htm, .md, .markdown or .txt.",
    };
  }
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > IMPORT_MAX_BYTES) {
    return { ok: false, error: "That file is larger than 2 MB. Split it into smaller files." };
  }
  return { ok: true, kind };
}

/** The file name without its folder or extension. The last resort for a title. */
export function titleFromFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const clean = collapseWhitespace(stem);
  return clean.length > 0 ? clampTitle(clean) : "Imported document";
}

/** The name of the first saved version of an imported document. */
export function importVersionName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const name = `Imported from ${base}`.trim();
  return name.length <= VERSION_NAME_MAX ? name : name.slice(0, VERSION_NAME_MAX);
}

/** One heading's text, or null when it holds nothing readable. */
function cleanHeading(text: string): string | null {
  const clean = collapseWhitespace(text);
  return clean.length > 0 ? clean : null;
}

function clampTitle(title: string): string {
  const clean = collapseWhitespace(title);
  if (clean.length === 0) return "Imported document";
  return clean.length <= TITLE_MAX ? clean : clean.slice(0, TITLE_MAX).trim();
}

function collapseWhitespace(text: string): string {
  return text.replace(/[\t\n\r\f\u00a0 ]+/g, " ").trim();
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape text so it is content, not markup. Used for attribute values. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/** Escape text content. Quotes are left alone: only a tag or a reference could be markup. */
function escapeText(text: string): string {
  return text.replace(/[&<>]/g, (char) => ESCAPES[char] ?? char);
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

const SAFE_PROTOCOLS = ["http:", "https:", "mailto:", "tel:"];

/**
 * A link target that cannot run code. Relative links and anchors are kept; anything with a scheme
 * other than http, https, mailto or tel is refused, including the `java\nscript:` spelling.
 */
export function safeHref(raw: string | null): string | null {
  if (raw === null) return null;
  const value = raw.trim();
  if (value.length === 0) return null;
  const lowered = value.toLowerCase().replace(/[\u0000-\u0020]+/g, "");
  const scheme = /^[a-z][a-z0-9+.-]*:/.exec(lowered);
  if (scheme === null) return value;
  return SAFE_PROTOCOLS.includes(scheme[0]) ? value : null;
}

/* HTML --------------------------------------------------------------------------------------- */

/** Removed whole: behaviour, styling, frames, forms and embedded widgets. */
const REMOVED = new Set([
  "script",
  "style",
  "link",
  "meta",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "param",
  "form",
  "input",
  "button",
  "select",
  "option",
  "textarea",
  "svg",
  "canvas",
  "video",
  "audio",
  "source",
  "track",
  "noscript",
  "template",
  "base",
  "head",
  "title",
]);

/** Blocks the editor keeps. `li` is handled by its list, `hr` stands alone. */
const KEPT_BLOCKS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "blockquote",
  "pre",
  "hr",
]);

/** Marks and inline nodes the editor keeps. */
const KEPT_INLINE = new Set(["strong", "em", "code", "a", "br"]);

const KEPT = new Set([...KEPT_BLOCKS, ...KEPT_INLINE]);

/** Tags laid out as blocks. Used to decide what a paragraph boundary is. */
const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "center",
  "dd",
  "details",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "html",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

/** Parents that hold blocks, so loose text inside them needs a paragraph of its own. */
const LOOSE_CONTAINERS = new Set([
  "body",
  "blockquote",
  "details",
  "div",
  "fieldset",
  "figure",
  "footer",
  "header",
  "html",
  "li",
  "main",
  "nav",
  "section",
  "aside",
  "article",
  "summary",
  "td",
  "th",
]);

function parseHtml(html: string): Document {
  if (typeof DOMParser === "undefined") {
    throw new Error("This browser cannot read HTML files.");
  }
  return new DOMParser().parseFromString(html, "text/html");
}

function renameElement(el: Element, tag: string, doc: Document): void {
  const replacement = doc.createElement(tag);
  while (el.firstChild) replacement.appendChild(el.firstChild);
  el.replaceWith(replacement);
}

/** Keep only the attributes a clean element needs. Everything else, handlers included, goes. */
function stripAttributes(el: Element, tag: string): void {
  for (const attribute of Array.from(el.attributes)) {
    const name = attribute.name.toLowerCase();
    const keep =
      (tag === "a" && name === "href") ||
      ((tag === "td" || tag === "th") && (name === "colspan" || name === "rowspan")) ||
      (tag === "ol" && name === "start");
    if (!keep) el.removeAttribute(attribute.name);
  }

  if (tag === "a") {
    const href = safeHref(el.getAttribute("href"));
    if (href === null) el.removeAttribute("href");
    else el.setAttribute("href", href);
  }

  if (tag === "td" || tag === "th") {
    for (const name of ["colspan", "rowspan"]) {
      const value = el.getAttribute(name);
      if (value === null) continue;
      if (/^\d{1,3}$/.test(value)) el.setAttribute(name, value);
      else el.removeAttribute(name);
    }
  }

  if (tag === "ol") {
    const start = el.getAttribute("start");
    if (start === null) return;
    if (/^\d{1,6}$/.test(start)) el.setAttribute("start", start);
    else el.removeAttribute("start");
  }
}

/** A table caption reads better as the paragraph above its table than as lost text. */
function promoteCaption(caption: Element, doc: Document): void {
  const table = caption.closest("table");
  if (table === null) {
    caption.replaceWith(...Array.from(caption.childNodes));
    return;
  }
  const paragraph = doc.createElement("p");
  while (caption.firstChild) paragraph.appendChild(caption.firstChild);
  table.before(paragraph);
  caption.remove();
}

/**
 * Replace an element with its contents. A block-level container inside a block context has its
 * loose inline runs wrapped in paragraphs, so text from two divs does not run together.
 */
function unwrap(el: Element, doc: Document): void {
  const parent = el.parentElement;
  if (parent === null) {
    el.remove();
    return;
  }

  const isBlock = BLOCK_TAGS.has(el.tagName.toLowerCase());
  if (!isBlock || !LOOSE_CONTAINERS.has(parent.tagName.toLowerCase())) {
    el.replaceWith(...Array.from(el.childNodes));
    return;
  }

  const fragment = doc.createDocumentFragment();
  let run: Node[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const paragraph = doc.createElement("p");
    for (const node of run) paragraph.appendChild(node);
    run = [];
    if ((paragraph.textContent ?? "").trim().length > 0) fragment.appendChild(paragraph);
  };

  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 1 && BLOCK_TAGS.has((child as Element).tagName.toLowerCase())) {
      flush();
      fragment.appendChild(child);
    } else {
      run.push(child);
    }
  }
  flush();
  el.replaceWith(fragment);
}

/** Sanitise in place: drop what is dangerous, keep what the editor knows, unwrap the rest. */
function sanitizeChildren(parent: Element, doc: Document, preserveWhitespace: boolean): void {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 3) {
      if (preserveWhitespace) continue;
      const text = (node.nodeValue ?? "").replace(/[\t\n\r\f\u00a0 ]+/g, " ");
      if (text.trim().length === 0) node.remove();
      else node.nodeValue = text;
      continue;
    }

    if (node.nodeType !== 1) {
      node.remove();
      continue;
    }

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (REMOVED.has(tag)) {
      el.remove();
      continue;
    }
    if (tag === "br" || tag === "hr") {
      stripAttributes(el, tag);
      continue;
    }
    if (tag === "img" || tag === "picture") {
      el.remove();
      continue;
    }

    stripAttributes(el, tag);
    sanitizeChildren(el, doc, preserveWhitespace || tag === "pre");

    if (tag === "b") {
      renameElement(el, "strong", doc);
      continue;
    }
    if (tag === "i") {
      renameElement(el, "em", doc);
      continue;
    }
    if (tag === "caption") {
      promoteCaption(el, doc);
      continue;
    }

    if (!KEPT.has(tag)) {
      unwrap(el, doc);
      continue;
    }
    if (tag === "a" && !el.hasAttribute("href")) {
      unwrap(el, doc);
    }
  }
}

/** Put loose inline content into the wrapper its parent needs. */
function wrapLoose(parent: Element, doc: Document, wrapper: "p" | "li"): void {
  const fragment = doc.createDocumentFragment();
  let run: Node[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const element = doc.createElement(wrapper);
    for (const node of run) element.appendChild(node);
    run = [];
    if ((element.textContent ?? "").trim().length > 0) fragment.appendChild(element);
  };

  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === 1 && BLOCK_TAGS.has((child as Element).tagName.toLowerCase())) {
      flush();
      fragment.appendChild(child);
    } else {
      run.push(child);
    }
  }
  flush();
  parent.replaceChildren(fragment);
}

const EMPTY_REMOVABLE = [
  "p",
  "h1",
  "h2",
  "h3",
  "li",
  "blockquote",
  "pre",
  "strong",
  "em",
  "code",
  "a",
  "ul",
  "ol",
  "tr",
  "thead",
  "tbody",
  "tfoot",
];

function isEmptyNode(el: Element): boolean {
  if ((el.textContent ?? "").trim().length > 0) return false;
  return el.querySelector("hr, table, td, th") === null;
}

/** Trim the whitespace at the two ends of a block without touching the inside of a `pre`. */
function trimEdges(el: Element): void {
  if (el.tagName.toLowerCase() === "pre") return;
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, 4);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    nodes.push(node as Text);
  }
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (first) {
    first.nodeValue = (first.nodeValue ?? "").replace(/^\s+/, "");
    if (first.nodeValue === "") first.remove();
  }
  if (last && last.parentNode !== null) {
    last.nodeValue = (last.nodeValue ?? "").replace(/\s+$/, "");
    if (last.nodeValue === "") last.remove();
  }
}

function normalizeDocument(body: Element, doc: Document): void {
  // The editor keeps heading levels 1 to 3 (see doc-editor.tsx), so deeper ones become h3.
  for (const heading of Array.from(body.querySelectorAll("h4, h5, h6"))) {
    const replacement = doc.createElement("h3");
    while (heading.firstChild) replacement.appendChild(heading.firstChild);
    heading.replaceWith(replacement);
  }

  // Loose text becomes a paragraph, and loose list content becomes an item.
  wrapLoose(body, doc, "p");
  for (const parent of Array.from(body.querySelectorAll("*"))) {
    const tag = parent.tagName.toLowerCase();
    if (tag === "ul" || tag === "ol") wrapLoose(parent, doc, "li");
    else if (LOOSE_CONTAINERS.has(tag)) wrapLoose(parent, doc, "p");
  }

  // Table structure: rows hold cells, and a table container holds rows only.
  for (const container of Array.from(body.querySelectorAll("table, thead, tbody, tfoot"))) {
    const isTable = container.tagName.toLowerCase() === "table";
    for (const child of Array.from(container.childNodes)) {
      if (child.nodeType !== 1) {
        child.remove();
        continue;
      }
      const tag = (child as Element).tagName.toLowerCase();
      if (tag === "tr") continue;
      if (isTable && (tag === "thead" || tag === "tbody" || tag === "tfoot")) continue;
      (child as Element).remove();
    }
  }
  for (const row of Array.from(body.querySelectorAll("tr"))) {
    for (const child of Array.from(row.childNodes)) {
      if (child.nodeType !== 1) {
        child.remove();
        continue;
      }
      const tag = (child as Element).tagName.toLowerCase();
      if (tag !== "td" && tag !== "th") (child as Element).remove();
    }
  }

  // A code block is plain text, kept exactly as written.
  for (const pre of Array.from(body.querySelectorAll("pre"))) {
    const text = (pre.textContent ?? "").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
    const code = doc.createElement("code");
    code.appendChild(doc.createTextNode(text));
    pre.replaceChildren(code);
  }

  // Collapse empty nodes, deepest first so an empty parent follows its children.
  const selector = EMPTY_REMOVABLE.join(",");
  for (const el of Array.from(body.querySelectorAll(selector)).reverse()) {
    if (isEmptyNode(el)) el.remove();
  }

  for (const el of Array.from(
    body.querySelectorAll("p, h1, h2, h3, li, blockquote, td, th, a, strong, em, code"),
  )) {
    trimEdges(el);
  }
}

/** Convert an HTML file into clean editor HTML and the heading it starts with. */
export function htmlToDocument(input: string): ConvertedContent {
  const doc = parseHtml(input);
  const body = doc.body;
  if (!body) return { html: "", heading: null };

  sanitizeChildren(body, doc, false);
  normalizeDocument(body, doc);

  const heading = cleanHeading(body.querySelector("h1")?.textContent ?? "");
  return { html: body.innerHTML.trim(), heading };
}

/* Markdown ----------------------------------------------------------------------------------- */

const FENCE = /^[ \t]*(```|~~~)(.*)$/;
const HEADING = /^[ \t]*(#{1,6})[ \t]+(.*?)[ \t]*$/;
const RULE = /^[ \t]*((\*[ \t]*){3,}|(-[ \t]*){3,}|(_[ \t]*){3,})$/;
const QUOTE = /^[ \t]*>[ \t]?(.*)$/;
const BULLET = /^([ \t]*)[-*+][ \t]+(.*)$/;
const ORDERED = /^([ \t]*)\d{1,9}[.)][ \t]+(.*)$/;
const TABLE_SEPARATOR = /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/;

type ListMarker = { indent: number; ordered: boolean; text: string };
type ListItem = { text: string; children: ListBlock[] };
type ListBlock = { ordered: boolean; items: ListItem[] };

function linesOf(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

function indentWidth(prefix: string): number {
  return prefix.replace(/\t/g, "  ").length;
}

function listMarker(line: string): ListMarker | null {
  const bullet = BULLET.exec(line);
  if (bullet) {
    return { indent: indentWidth(bullet[1] ?? ""), ordered: false, text: bullet[2] ?? "" };
  }
  const ordered = ORDERED.exec(line);
  if (ordered) {
    return { indent: indentWidth(ordered[1] ?? ""), ordered: true, text: ordered[2] ?? "" };
  }
  return null;
}

function isTableStart(lines: string[], index: number): boolean {
  const header = lines[index] ?? "";
  if (!header.includes("|")) return false;
  return TABLE_SEPARATOR.test(lines[index + 1] ?? "");
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    listMarker(line) !== null ||
    isTableStart(lines, index)
  );
}

function readCodeBlock(lines: string[], start: number, out: string[]): number {
  const opener = lines[start]?.trim().slice(0, 3) ?? "```";
  const body: string[] = [];
  let index = start + 1;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    index++;
    if (line.trim().startsWith(opener)) break;
    body.push(line);
  }
  out.push(`<pre><code>${escapeText(body.join("\n"))}</code></pre>`);
  return index;
}

function readBlockquote(lines: string[], start: number, out: string[]): number {
  const inner: string[] = [];
  let index = start;
  let match = QUOTE.exec(lines[index] ?? "");
  while (match !== null) {
    inner.push(match[1] ?? "");
    index++;
    match = QUOTE.exec(lines[index] ?? "");
  }
  out.push(`<blockquote>${markdownBlocks(inner).join("\n")}</blockquote>`);
  return index;
}

function readTable(lines: string[], start: number, out: string[]): number {
  const header = splitRow(lines[start] ?? "");
  const rows: string[][] = [];
  let index = start + 2;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "" || !line.includes("|")) break;
    rows.push(splitRow(line));
    index++;
  }

  const columns = Math.max(header.length, ...rows.map((row) => row.length), 1);
  const pad = (cells: string[]): string[] =>
    Array.from({ length: columns }, (_value, position) => cells[position] ?? "");

  const head = pad(header)
    .map((cell) => `<th><p>${inlineMarkdown(cell)}</p></th>`)
    .join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${pad(row)
          .map((cell) => `<td><p>${inlineMarkdown(cell)}</p></td>`)
          .join("")}</tr>`,
    )
    .join("");

  out.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
  return index;
}

function renderList(block: ListBlock): string {
  const tag = block.ordered ? "ol" : "ul";
  const items = block.items
    .map((item) => {
      const nested = item.children.map(renderList).join("");
      return `<li><p>${inlineMarkdown(item.text)}</p>${nested}</li>`;
    })
    .join("");
  return `<${tag}>${items}</${tag}>`;
}

/** Lists nest two levels; a deeper item joins the deepest item's text. */
function readList(lines: string[], start: number, out: string[]): number {
  const first = listMarker(lines[start] ?? "");
  if (first === null) return start + 1;

  const root: ListBlock = { ordered: first.ordered, items: [] };
  const stack: Array<{ indent: number; block: ListBlock }> = [
    { indent: first.indent, block: root },
  ];
  let index = start;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const marker = listMarker(line);

    if (marker === null) {
      if (line.trim() === "" && listMarker(lines[index + 1] ?? "") !== null) {
        index++;
        continue;
      }
      const frame = stack[stack.length - 1];
      const current = frame?.block.items[frame.block.items.length - 1];
      if (current && line.trim().length > 0 && /^[ \t]/.test(line)) {
        current.text = `${current.text} ${line.trim()}`.trim();
        index++;
        continue;
      }
      break;
    }

    if (marker.indent === first.indent && marker.ordered !== first.ordered) break;

    while (stack.length > 1 && marker.indent < (stack[stack.length - 1]?.indent ?? 0)) {
      stack.pop();
    }

    const top = stack[stack.length - 1];
    if (top === undefined) break;

    if (marker.indent > top.indent) {
      const parent = top.block.items[top.block.items.length - 1];
      if (parent === undefined) break;
      if (stack.length >= 3) {
        parent.text = `${parent.text} ${marker.text}`.trim();
        index++;
        continue;
      }
      const nested: ListBlock = { ordered: marker.ordered, items: [] };
      parent.children.push(nested);
      stack.push({ indent: marker.indent, block: nested });
    }

    const frame = stack[stack.length - 1];
    if (frame === undefined) break;
    frame.block.items.push({ text: marker.text, children: [] });
    index++;
  }

  out.push(renderList(root));
  return index;
}

function readParagraph(lines: string[], start: number, out: string[]): number {
  const parts: string[] = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") break;
    if (parts.length > 0 && startsBlock(lines, index)) break;
    parts.push(line.trim());
    index++;
  }
  out.push(`<p>${inlineMarkdown(parts.join(" "))}</p>`);
  return index;
}

function markdownBlocks(lines: string[]): string[] {
  const out: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index++;
      continue;
    }
    if (FENCE.test(line)) {
      index = readCodeBlock(lines, index, out);
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      // The editor keeps headings 1 to 3, so deeper ones become h3.
      const level = Math.min(3, (heading[1] ?? "#").length);
      out.push(`<h${level}>${inlineMarkdown(heading[2] ?? "")}</h${level}>`);
      index++;
      continue;
    }
    if (RULE.test(line)) {
      out.push("<hr>");
      index++;
      continue;
    }
    if (QUOTE.test(line)) {
      index = readBlockquote(lines, index, out);
      continue;
    }
    if (isTableStart(lines, index)) {
      index = readTable(lines, index, out);
      continue;
    }
    if (listMarker(line) !== null) {
      index = readList(lines, index, out);
      continue;
    }
    index = readParagraph(lines, index, out);
  }
  return out;
}

/**
 * Inline Markdown on text that has already been escaped: code spans, links, bold and italic.
 * Emphasis is deliberately simple; anything it does not recognise stays as written.
 */
export function inlineMarkdown(text: string): string {
  const codeSpans: string[] = [];
  let out = escapeText(text).replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(`<code>${code}</code>`);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });

  out = out.replace(/\[([^\]]*)\]\(\s*([^)\s]+)\s*\)/g, (whole, label: string, href: string) => {
    const safe = safeHref(unescapeHtml(href));
    if (safe === null) return label;
    return `<a href="${escapeHtml(safe)}">${label}</a>`;
  });

  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^\w_])_([^_\n]+)_(?![\w_])/g, "$1<em>$2</em>");

  return out.replace(/\u0000(\d+)\u0000/g, (_match, position: string) => {
    return codeSpans[Number(position)] ?? "";
  });
}

function firstMarkdownHeading(markdown: string): string | null {
  let fenced = false;
  for (const line of linesOf(markdown)) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = HEADING.exec(line);
    if (match && (match[1] ?? "").length === 1) {
      const heading = cleanHeading(match[2] ?? "");
      if (heading !== null) return heading;
    }
  }
  return null;
}

/** Convert a Markdown file into editor HTML and the level-one heading it starts with. */
export function markdownToDocument(markdown: string): ConvertedContent {
  const html = markdownBlocks(linesOf(markdown)).join("\n");
  return { html, heading: firstMarkdownHeading(markdown) };
}

/* Plain text --------------------------------------------------------------------------------- */

/** One paragraph per blank-line-separated block. A single newline stays a line break. */
export function textToDocument(text: string): ConvertedContent {
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) continue;
    out.push(`<p>${lines.map((line) => escapeText(line)).join("<br>")}</p>`);
  }
  return { html: out.join("\n"), heading: null };
}

/* Entry point -------------------------------------------------------------------------------- */

/**
 * Convert a picked file into editor HTML and the title to suggest for the document. The title is
 * the first heading when the file has one, otherwise the file name without its extension.
 */
export function convertDocument(input: {
  name: string;
  kind: ImportKind;
  text: string;
}): ConvertedImport {
  const converted =
    input.kind === "html"
      ? htmlToDocument(input.text)
      : input.kind === "markdown"
        ? markdownToDocument(input.text)
        : textToDocument(input.text);

  const title = clampTitle(converted.heading ?? titleFromFileName(input.name));
  return { html: converted.html, title };
}
