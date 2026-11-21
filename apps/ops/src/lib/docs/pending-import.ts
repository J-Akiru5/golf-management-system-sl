import type { EditorJson } from "@/lib/db/types";

/**
 * The handover between the import dialog and the editor.
 *
 * The dialog creates the document, puts the converted content in this tab's session storage under
 * the new document's id, and opens the document. The editor's existing seed path reads that entry,
 * writes it into the empty live document once, saves the first version and clears the entry.
 *
 * Session storage is per tab and per origin: the content never leaves the browser, is not shared
 * with another member, and disappears when the tab closes. A converter is never run with data the
 * member did not pick themselves.
 */

const PREFIX = "teeline:doc-import:";

/** The same limit the snapshots repository enforces (`SNAPSHOT_NAME_MAX` in ./repo). */
const VERSION_NAME_MAX = 120;

export type PendingImport = {
  /** A Tiptap document: `{ type: "doc", content: [...] }`. */
  content: EditorJson;
  /** The name of the first saved version. */
  versionName: string;
};

export function pendingImportKey(docId: string): string {
  return `${PREFIX}${docId}`;
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Parse and validate a stored entry. Anything unexpected is treated as no entry. */
export function parsePendingImport(raw: string): PendingImport | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const content = record.content;
  if (typeof content !== "object" || content === null) return null;

  const doc = content as Record<string, unknown>;
  if (doc.type !== "doc" || !Array.isArray(doc.content)) return null;

  const versionName = typeof record.versionName === "string" ? record.versionName.trim() : "";
  if (versionName.length === 0 || versionName.length > VERSION_NAME_MAX) return null;

  return { content: content as EditorJson, versionName };
}

/**
 * Keep the converted content for one new document. Returns false when the browser refuses to store
 * it, which is the dialog's signal to remove the document it just created.
 */
export function savePendingImport(docId: string, value: PendingImport): boolean {
  const storage = browserStorage();
  if (!storage) return false;
  try {
    storage.setItem(pendingImportKey(docId), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** The content waiting for this document, or null when there is none. */
export function readPendingImport(docId: string): PendingImport | null {
  const storage = browserStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(pendingImportKey(docId));
    return raw === null ? null : parsePendingImport(raw);
  } catch {
    return null;
  }
}

/** Drop the entry. Called once the content is in the document, or when it cannot be. */
export function clearPendingImport(docId: string): void {
  const storage = browserStorage();
  if (!storage) return;
  try {
    storage.removeItem(pendingImportKey(docId));
  } catch {
    // Nothing to do: an entry that cannot be removed is still only this tab's, and it is checked
    // against the document's live state before it is ever used.
  }
}
