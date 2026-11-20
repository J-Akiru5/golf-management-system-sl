import type { EditorJson } from "@/lib/db/types";

/** The shape the editor reads and writes. Loose on purpose; the editor owns its own schema. */
export function isEditorJson(value: unknown): value is EditorJson {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.type === "string" && record.type.length > 0;
}
