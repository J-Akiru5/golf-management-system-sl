import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { HelpAudience } from "./types";

/**
 * Which guides a person has already dismissed.
 *
 * Two stores, one answer: `help_seen` in the database (migration 20261028000000, applied by the
 * owner) and `localStorage` in this browser. The local copy is always written, so the welcome never
 * comes back on this device even when the migration is not applied yet or the write is refused. The
 * database copy is what makes "once per member" true across devices.
 */

export const HELP_SEEN_STORAGE_KEY = "teeline-help-seen";

/** The id of the first-run panel for an audience. */
export function welcomeId(audience: HelpAudience): string {
  return `welcome.${audience}`;
}

/** Reads a stored list, tolerating anything: this is a convenience, never a source of truth. */
export function parseSeen(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id !== "");
  } catch {
    return [];
  }
}

/** Two stores, one list: sorted and free of duplicates, so a test can compare it exactly. */
export function mergeSeen(...lists: string[][]): string[] {
  return [...new Set(lists.flat())].sort();
}

function readLocal(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return parseSeen(window.localStorage.getItem(HELP_SEEN_STORAGE_KEY));
  } catch {
    // A browser with storage switched off still gets the help; it just asks again next time.
    return [];
  }
}

function writeLocal(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HELP_SEEN_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Same as above: the welcome simply shows again.
  }
}

async function remoteSeen(client: SupabaseClient<Database> | null): Promise<string[]> {
  if (!client) return [];
  const { data, error } = await client.from("help_seen").select("guide_id");
  // A missing table (migration not applied) or any other refusal is not an error the desk should
  // see: the browser's own record already answers the question.
  if (error) return [];
  return (data ?? []).map((row) => row.guide_id);
}

/** Everything this person has dismissed, from both stores. */
export async function loadHelpSeen(client: SupabaseClient<Database> | null): Promise<Set<string>> {
  const local = readLocal();
  const remote = await remoteSeen(client);
  const all = mergeSeen(local, remote);
  if (remote.length > 0) writeLocal(all);
  return new Set(all);
}

/** Records a dismissal. The local write happens first, so it survives a refused remote write. */
export async function markHelpSeen(
  client: SupabaseClient<Database> | null,
  guideId: string,
): Promise<void> {
  writeLocal(mergeSeen(readLocal(), [guideId]));
  if (!client) return;
  // `user_id` defaults to auth.uid() in the table, so the client never names a person.
  await client.from("help_seen").upsert({ guide_id: guideId }, { onConflict: "user_id,guide_id" });
}
