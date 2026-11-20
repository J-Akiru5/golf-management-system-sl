import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, EditorJson } from "@/lib/db/types";
import { parseSeedContent } from "./seed";

/**
 * Server-only helpers for importing the first document. The converted content stays outside the
 * repository: the seed folder is git-ignored, and the owner points `OPS_DOC_SEED_ID` at the one
 * document the file belongs to. Without that id nothing is imported, so no other document is ever
 * given content it did not have.
 *
 * Read from `process.env` here rather than `lib/env.ts` because that file belongs to FOUNDATION;
 * the names are documented in `apps/ops/seed/README.md`.
 */

const SEED_ID = "OPS_DOC_SEED_ID";
const SEED_FILE = "OPS_DOC_SEED_FILE";

export function seedDocumentId(): string | null {
  const id = (process.env[SEED_ID] ?? "").trim();
  return id.length > 0 ? id : null;
}

function seedFilePath(): string {
  const configured = (process.env[SEED_FILE] ?? "").trim();
  if (configured)
    return resolve(configured.startsWith("~") ? join(homedir(), configured.slice(1)) : configured);
  return join(process.cwd(), "seed", "out", "doc.json");
}

/**
 * The content to import for this document, or null. Null covers every case where seeding must not
 * happen: another document, no id configured, no file, or a file that is not a Tiptap document.
 */
export function readSeedContent(docId: string): EditorJson | null {
  const configuredId = seedDocumentId();
  if (!configuredId || configuredId !== docId) return null;

  let raw: string;
  try {
    // The file is optional and lives outside the bundle, so the build must not trace it.
    raw = readFileSync(/* turbopackIgnore: true */ seedFilePath(), "utf8");
  } catch {
    return null;
  }
  return parseSeedContent(raw);
}

/** Is there already live state for this document? Throws rather than guessing. */
export async function hasDocState(
  client: SupabaseClient<Database>,
  docId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("ws_doc_states")
    .select("doc_id")
    .eq("doc_id", docId)
    .maybeSingle();
  if (error) throw new Error(`Could not read the document state: ${error.message}`);
  return data !== null;
}
