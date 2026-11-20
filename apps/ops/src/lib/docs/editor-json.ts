import type { EditorJson } from "@/lib/db/types";

/** The shape the editor reads and writes. Loose on purpose; the editor owns its own schema. */
export function isEditorJson(value: unknown): value is EditorJson {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.type === "string" && record.type.length > 0;
}

/**
 * A deep copy made of plain objects and arrays.
 *
 * Tiptap returns node attributes as objects with no prototype. That is valid JSON, but React's
 * server action encoding does not accept it as a plain object and replaces it with a reference, so
 * the value has to be rebuilt before it is sent to a server action.
 */
export function toPlainJson<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => toPlainJson(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      copy[key] = toPlainJson(item);
    }
    return copy as unknown as T;
  }
  return value;
}
