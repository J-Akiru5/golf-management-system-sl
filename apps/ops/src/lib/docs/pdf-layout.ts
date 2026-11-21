/**
 * Turning the text items pdf.js reports into the editor HTML the other importers return.
 *
 * This file is pure: it takes plain items (`str`, `x`, `y`, `height`, `fontName`, `hasEOL`) per page
 * and never touches pdf.js, the DOM or the network. The extraction itself lives in ./import.
 *
 * The layout rules are deliberately conservative. A run only becomes a table when at least three
 * lines share the same number of items in the same columns; anything uncertain stays a paragraph.
 * Cells are never invented, and every piece of text is escaped.
 */

export type PdfTextItem = {
  /** The text of one run as pdf.js reports it. */
  str: string;
  /** The left edge of the run. */
  x: number;
  /** The baseline. PDF coordinates grow upwards, so a larger value is higher on the page. */
  y: number;
  /** The run's font size in points. */
  height: number;
  fontName: string;
  hasEOL: boolean;
};

/** The same shape the HTML, Markdown and text converters return. */
export type PdfConvertedContent = { html: string; heading: string | null };

type Line = {
  /** The baseline of the first item in the line. */
  y: number;
  /** The middle font size, in points. */
  size: number;
  /** Left to right. */
  items: PdfTextItem[];
  text: string;
};

/** Baselines within this many points are the same line. */
const LINE_TOLERANCE = 2;

/** A baseline gap larger than this many line heights starts a new paragraph. */
const PARAGRAPH_GAP = 1.5;

/** A line this much larger than the body text is a heading. */
const HEADING_SCALE = 1.15;

const BULLET = /^[\u2022\-–*]\s+(.*)$/;
const NUMBERED = /^\d{1,3}[.)]\s+(.*)$/;

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

function escapeText(text: string): string {
  return text.replace(/[&<>]/g, (char) => ESCAPES[char] ?? char);
}

function collapse(text: string): string {
  return text.replace(/[\t\n\r\f\u00a0\u200b ]+/g, " ").trim();
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** How wide a run probably is, from its font size. Only used to decide whether a space belongs. */
function estimatedWidth(item: PdfTextItem): number {
  return item.str.length * item.height * 0.5;
}

function gapBefore(previous: PdfTextItem, next: PdfTextItem): number {
  return next.x - (previous.x + estimatedWidth(previous));
}

/** One line's text. Items are joined directly when they touch, and with a space when they do not. */
function lineText(items: readonly PdfTextItem[]): string {
  let text = "";
  let previous: PdfTextItem | null = null;
  for (const item of items) {
    if (item.str.length === 0) continue;
    if (previous !== null) {
      const endsWithSpace = /\s$/.test(text);
      const startsWithSpace = /^\s/.test(item.str);
      if (!endsWithSpace && !startsWithSpace && gapBefore(previous, item) > item.height * 0.2) {
        text += " ";
      }
    }
    text += item.str;
    previous = item;
  }
  return collapse(text);
}

/** Group the items of one page into lines. Items at the same baseline belong together. */
function groupIntoLines(items: readonly PdfTextItem[]): Line[] {
  const usable = items.filter((item) => item.str.trim().length > 0);
  const sorted = [...usable].sort((left, right) => right.y - left.y || left.x - right.x);

  const groups: PdfTextItem[][] = [];
  let current: PdfTextItem[] | null = null;
  let currentY = 0;

  for (const item of sorted) {
    const tolerance = Math.max(LINE_TOLERANCE, item.height * 0.4);
    if (current !== null && Math.abs(currentY - item.y) <= tolerance) {
      current.push(item);
      continue;
    }
    current = [item];
    currentY = item.y;
    groups.push(current);
  }

  return groups.map((group) => {
    const byX = [...group].sort((left, right) => left.x - right.x);
    const first = byX[0];
    return {
      y: first?.y ?? 0,
      size: median(byX.map((item) => item.height)),
      items: byX,
      text: lineText(byX),
    };
  });
}

/**
 * The size most lines on a page use. A long title on its own must not become the body size, so the
 * count is by line; when two sizes are equally common the smaller one wins, because headings are
 * larger than the text around them.
 */
function bodySize(lines: readonly Line[]): number {
  const counts = new Map<number, number>();
  for (const line of lines) {
    const key = Math.round(line.size * 2) / 2;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let size = 0;
  let best = -1;
  for (const [key, count] of counts) {
    if (count > best || (count === best && size > 0 && key < size)) {
      size = key;
      best = count;
    }
  }
  return size > 0 ? size : 10;
}

function headingLevel(line: Line, body: number, largest: number): 2 | 3 | null {
  if (line.size <= body * HEADING_SCALE) return null;
  return line.size >= largest - 0.5 ? 2 : 3;
}

function looksLikeListItem(text: string): { ordered: boolean; text: string } | null {
  const bullet = BULLET.exec(text);
  if (bullet) return { ordered: false, text: collapse(bullet[1] ?? "") };
  const numbered = NUMBERED.exec(text);
  if (numbered) return { ordered: true, text: collapse(numbered[1] ?? "") };
  return null;
}

/** Join lines into a paragraph, repairing a word hyphenated across a line break. */
function joinLines(parts: readonly string[]): string {
  let joined = "";
  for (const part of parts) {
    const text = part.trim();
    if (text.length === 0) continue;
    if (joined.length === 0) {
      joined = text;
      continue;
    }
    if (/[A-Za-z]-$/.test(joined) && /^[a-z]/.test(text)) {
      joined = joined.slice(0, -1) + text;
    } else {
      joined = `${joined} ${text}`;
    }
  }
  return collapse(joined);
}

function breaksParagraph(previous: Line, current: Line): boolean {
  const baselineGap = previous.y - current.y;
  const expected = Math.max(previous.size, current.size, 1) * PARAGRAPH_GAP;
  return baselineGap > expected;
}

type TableRun = { rows: PdfTextItem[][]; end: number };

function columnsAlign(items: readonly PdfTextItem[], columns: readonly number[]): boolean {
  const tolerance = Math.max(LINE_TOLERANCE, ...items.map((item) => item.height)) * 0.5;
  return items.every((item, position) => {
    const column = columns[position];
    return column !== undefined && Math.abs(item.x - column) <= tolerance;
  });
}

/**
 * A table is three or more lines with the same number of items in the same columns. Anything else,
 * including a run whose columns drift, is left to the paragraph path.
 */
function tableRun(lines: readonly Line[], start: number): TableRun | null {
  const first = lines[start];
  if (!first || first.items.length < 2) return null;

  const columns = first.items.map((item) => item.x);
  const rows: PdfTextItem[][] = [first.items];
  let index = start + 1;

  while (index < lines.length) {
    const line = lines[index];
    if (!line || line.items.length !== columns.length) break;
    if (!columnsAlign(line.items, columns)) break;
    rows.push(line.items);
    index++;
  }

  return rows.length >= 3 ? { rows, end: index } : null;
}

function renderTable(rows: readonly PdfTextItem[][]): string {
  const body = rows
    .map((row) => {
      const cells = row.map((cell) => `<td><p>${escapeText(collapse(cell.str))}</p></td>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table><tbody>${body}</tbody></table>`;
}

type PageBlocks = { blocks: string[]; heading: string | null };

function pageBlocks(lines: readonly Line[]): PageBlocks {
  const body = bodySize(lines);
  const largest = lines.reduce((max, line) => Math.max(max, line.size), 0);

  const blocks: string[] = [];
  let heading: string | null = null;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line) {
      index++;
      continue;
    }

    const table = tableRun(lines, index);
    if (table !== null) {
      blocks.push(renderTable(table.rows));
      index = table.end;
      continue;
    }

    const level = headingLevel(line, body, largest);
    if (level !== null) {
      if (heading === null) heading = line.text;
      blocks.push(`<h${level}>${escapeText(line.text)}</h${level}>`);
      index++;
      continue;
    }

    const list = looksLikeListItem(line.text);
    if (list !== null) {
      const items: string[] = [];
      const ordered = list.ordered;
      while (index < lines.length) {
        const next = lines[index];
        if (!next) break;
        const marker = looksLikeListItem(next.text);
        if (marker === null || marker.ordered !== ordered) break;
        items.push(`<li><p>${escapeText(marker.text)}</p></li>`);
        index++;
      }
      const tag = ordered ? "ol" : "ul";
      blocks.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    const parts = [line.text];
    let previous = line;
    index++;
    while (index < lines.length) {
      const next = lines[index];
      if (!next) break;
      if (tableRun(lines, index) !== null) break;
      if (headingLevel(next, body, largest) !== null) break;
      if (looksLikeListItem(next.text) !== null) break;
      if (breaksParagraph(previous, next)) break;
      parts.push(next.text);
      previous = next;
      index++;
    }
    blocks.push(`<p>${escapeText(joinLines(parts))}</p>`);
  }

  return { blocks, heading };
}

/** A key that ignores the digits, so "Page 1", "Page 2" and "1", "2" match each other. */
function repeatedKey(text: string): string {
  return collapse(text).replace(/\d+/g, "#").toLowerCase();
}

/**
 * Lines that appear in the same edge position on most pages. They are page headers, footers or
 * numbers, not content. Only the top and bottom two lines of a page are considered.
 */
function repeatedLineKeys(pages: readonly Line[][]): Set<string> {
  if (pages.length < 2) return new Set();

  const appearances = new Map<string, number>();
  for (const lines of pages) {
    const candidates = new Set<string>();
    const edge = [...lines.slice(0, 2), ...lines.slice(-2)];
    for (const line of edge) {
      const key = repeatedKey(line.text);
      if (key.length > 0) candidates.add(key);
    }
    for (const key of candidates) {
      appearances.set(key, (appearances.get(key) ?? 0) + 1);
    }
  }

  const most = pages.length / 2;
  const repeated = new Set<string>();
  for (const [key, count] of appearances) {
    if (count > most) repeated.add(key);
  }
  return repeated;
}

function isHeadingBlock(block: string): boolean {
  return block.startsWith("<h2>") || block.startsWith("<h3>");
}

/**
 * Turn every page's items into one editor document. A page break only draws a rule when the next
 * page starts with a heading, so ordinary text does not collect a line at every page boundary.
 */
export function pdfPagesToDocument(
  pages: readonly (readonly PdfTextItem[])[],
): PdfConvertedContent {
  const grouped = pages.map((items) => groupIntoLines(items));
  const repeated = repeatedLineKeys(grouped);

  const rendered = grouped.map((lines) =>
    pageBlocks(lines.filter((line) => !repeated.has(repeatedKey(line.text)))),
  );

  const blocks: string[] = [];
  let heading: string | null = null;

  for (const page of rendered) {
    if (page.blocks.length === 0) continue;
    if (heading === null && page.heading !== null) heading = page.heading;
    const first = page.blocks[0];
    if (blocks.length > 0 && first !== undefined && isHeadingBlock(first)) blocks.push("<hr>");
    blocks.push(...page.blocks);
  }

  return { html: blocks.join("\n"), heading };
}
