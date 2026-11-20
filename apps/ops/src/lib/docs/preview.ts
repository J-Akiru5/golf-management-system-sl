import type { EditorJson } from "@/lib/db/types";

/**
 * A read-only preview of a saved version, for the history sheet. The preview is plain text in a few
 * blocks: it never re-renders the document, so a snapshot with odd content cannot change the page.
 */

export type PreviewBlock = {
  kind: "heading" | "paragraph" | "list-item";
  text: string;
  level?: number;
};

const MAX_DEPTH = 8;

function textOf(node: unknown): string {
  if (typeof node !== "object" || node === null) return "";
  const record = node as Record<string, unknown>;
  if (record.type === "text" && typeof record.text === "string") return record.text;
  if (record.type === "hardBreak") return " ";
  const children = record.content;
  if (!Array.isArray(children)) return "";
  return children.map(textOf).join(" ");
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function pushBlock(blocks: PreviewBlock[], block: PreviewBlock): void {
  const text = clean(block.text);
  if (!text) return;
  blocks.push({ ...block, text });
}

function walk(node: unknown, blocks: PreviewBlock[], depth: number, limit: number): void {
  if (depth > MAX_DEPTH || blocks.length >= limit) return;
  if (typeof node !== "object" || node === null) return;
  const record = node as Record<string, unknown>;
  if (record.type === "heading") {
    const level =
      typeof record.attrs === "object" && record.attrs !== null
        ? (record.attrs as Record<string, unknown>).level
        : undefined;
    pushBlock(blocks, {
      kind: "heading",
      text: textOf(record),
      ...(typeof level === "number" ? { level } : {}),
    });
    return;
  }
  if (record.type === "paragraph" || record.type === "codeBlock") {
    pushBlock(blocks, { kind: "paragraph", text: textOf(record) });
    return;
  }
  if (record.type === "listItem") {
    const nested = Array.isArray(record.content) ? record.content : [];
    for (const child of nested) {
      if (
        typeof child === "object" &&
        child !== null &&
        (child as Record<string, unknown>).type === "paragraph"
      ) {
        pushBlock(blocks, { kind: "list-item", text: textOf(child) });
      } else {
        walk(child, blocks, depth + 1, limit);
      }
    }
    return;
  }
  if (record.type === "table") {
    const rows = Array.isArray(record.content) ? record.content : [];
    for (const row of rows) {
      if (blocks.length >= limit) return;
      const cells =
        typeof row === "object" &&
        row !== null &&
        Array.isArray((row as Record<string, unknown>).content)
          ? ((row as Record<string, unknown>).content as unknown[])
          : [];
      pushBlock(blocks, { kind: "paragraph", text: cells.map(textOf).join(" | ") });
    }
    return;
  }
  if (Array.isArray(record.content)) {
    for (const child of record.content) walk(child, blocks, depth + 1, limit);
  }
}

export function previewBlocks(json: EditorJson, limit = 24): PreviewBlock[] {
  const blocks: PreviewBlock[] = [];
  walk(json, blocks, 0, limit);
  return blocks;
}

/** One line for a list or a card. Empty when the document has no words. */
export function summarizeContent(json: EditorJson, maxChars = 180): string {
  const text = previewBlocks(json, 6)
    .map((block) => block.text)
    .join(" ");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}
