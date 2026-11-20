import type { EditorJson } from "@/lib/db/types";
import { isEditorJson } from "./editor-json";

/**
 * Seeding the first document.
 *
 * The SQL the converter writes can create the document row, but it cannot create Yjs state. So the
 * first editor to open a document with no state row imports the converted `doc.json` once. The
 * decision is pure and tested; the claim is an insert on the state table's primary key, so only one
 * client can win it.
 */

export type SeedReason = "no_seed" | "state_exists" | "not_empty" | "claimed_elsewhere";

export type SeedDecision = { seed: true } | { seed: false; reason: SeedReason };

export function decideSeed(input: {
  demo: boolean;
  hasSeed: boolean;
  stateExists: boolean;
  contentEmpty: boolean;
}): SeedDecision {
  if (!input.hasSeed) return { seed: false, reason: "no_seed" };
  if (!input.demo && input.stateExists) return { seed: false, reason: "state_exists" };
  if (!input.contentEmpty) return { seed: false, reason: "not_empty" };
  return { seed: true };
}

/** A converted file is a Tiptap document: an object with `type: "doc"` and a content array. */
export function parseSeedContent(raw: string): EditorJson | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isEditorJson(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.type !== "doc") return null;
  if (!Array.isArray(record.content)) return null;
  return record as EditorJson;
}
