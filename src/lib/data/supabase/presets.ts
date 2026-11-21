import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PRESETS_UNAVAILABLE,
  readPresetRow,
  readSettings,
  type SavedPreset,
  settingsJson,
  type TournamentSettings,
} from "@/lib/data/presets";
import type { Database, Json } from "@/lib/supabase/types";

/**
 * The desk's tournament presets.
 *
 * A preset is a saved standard: tees, categories, classes and the rules an event runs on. Saving and
 * applying go through `save_tournament_preset` and `apply_tournament_preset`, so the same checks the
 * screen runs are repeated by the database. Renaming and deleting are direct writes under the
 * table's row level security: members read the list, an owner or organizer writes it.
 *
 * The migration (20261123000400) is not applied on every project yet. A missing table or function is
 * reported as "available after the next database update" and nothing else on the screen changes.
 */

/** True when the error is the presets migration not being applied yet. */
export function presetsUnavailable(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST202" || error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return (
    /tournament_presets|preset_settings_problem|save_tournament_preset|apply_tournament_preset|seed_preset_from_tournament/i.test(
      message,
    ) && /does not exist|could not find|schema cache|not find the/i.test(message)
  );
}

/** The preset list as the card shows it. */
export interface PresetList {
  presets: SavedPreset[];
  /** Presets whose stored rules no longer pass validation, named so the card can say which. */
  problems: { name: string; problems: string[] }[];
  /** True when the presets migration has not reached this project. */
  unavailable: boolean;
}

/** Reads a preset list payload. Rows are judged by the same reader the rest of the desk uses. */
export function parsePresetList(rows: unknown): PresetList {
  const presets: SavedPreset[] = [];
  const problems: { name: string; problems: string[] }[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const read = readPresetRow(row);
    if (read.ok) {
      presets.push(read.preset);
      continue;
    }
    const name =
      typeof row === "object" && row !== null && !Array.isArray(row)
        ? String((row as Record<string, unknown>).name ?? "A preset")
        : "A preset";
    problems.push({ name, problems: read.problems });
  }
  presets.sort((a, b) => a.name.localeCompare(b.name));
  return { presets, problems, unavailable: false };
}

/** What applying a preset reports back, in plain words the card can show. */
export interface PresetApplyResult {
  revision: number | null;
  applied: { tees: number; categories: number; flights: number; days: number };
  /** The preset's playing days this event does not have. The event's dates are never changed. */
  ignoredDays: number[];
  notes: string[];
}

/** Reads the reply of `apply_tournament_preset`. A count that is absent reads as zero. */
export function parseApplyResult(
  value: unknown,
  fallbackRevision: number | null,
): PresetApplyResult {
  const row =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const applied =
    typeof row.applied === "object" && row.applied !== null
      ? (row.applied as Record<string, unknown>)
      : {};
  const count = (key: string): number => {
    const raw = applied[key];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  };
  return {
    revision: typeof row.revision === "number" ? row.revision : fallbackRevision,
    applied: {
      tees: count("tees"),
      categories: count("categories"),
      flights: count("flights"),
      days: count("days"),
    },
    ignoredDays: Array.isArray(row.ignoredDays)
      ? row.ignoredDays.filter((day): day is number => typeof day === "number")
      : [],
    notes: Array.isArray(row.notes)
      ? row.notes.filter((note): note is string => typeof note === "string")
      : [],
  };
}

/** Lists the club's presets. A missing migration answers with an empty list and `unavailable`. */
export async function loadPresets(
  client: SupabaseClient<Database>,
  clubId: string,
): Promise<PresetList> {
  const { data, error } = await client
    .from("tournament_presets")
    .select("id, name, description, settings, created_at, updated_at")
    .eq("club_id", clubId)
    .order("name");
  if (error) {
    if (presetsUnavailable(error)) return { presets: [], problems: [], unavailable: true };
    throw new Error(`Could not load the presets: ${error.message}`);
  }
  return parsePresetList(data);
}

/**
 * Saves the settings as a new preset. The database repeats the rule check and refuses a name that is
 * already used, so a refusal arrives as a plain message and is thrown unchanged.
 */
export async function savePreset(
  client: SupabaseClient<Database>,
  clubId: string,
  name: string,
  description: string | null,
  settings: TournamentSettings,
): Promise<SavedPreset> {
  const read = readSettings(settingsJson(settings));
  if (!read.ok) throw new Error(read.problems[0] ?? "Those settings cannot be saved as a preset.");
  const { data, error } = await client.rpc("save_tournament_preset", {
    p_club: clubId,
    p_name: name,
    p_description: description,
    p_settings: settingsJson(read.settings) as Json,
  });
  if (error) {
    if (presetsUnavailable(error)) throw new Error(PRESETS_UNAVAILABLE);
    throw new Error(error.message);
  }
  const saved = readPresetRow(data);
  if (!saved.ok)
    throw new Error(saved.problems[0] ?? "The preset was saved but could not be read.");
  return saved.preset;
}

/**
 * Copies a preset into an event. The database checks the role, the club and the preset's own rules,
 * refuses when an entry still uses a category that would have to be deleted, and returns what it
 * applied.
 */
export async function applyPreset(
  client: SupabaseClient<Database>,
  tournamentId: string,
  presetId: string,
): Promise<PresetApplyResult> {
  const { data, error } = await client.rpc("apply_tournament_preset", {
    p_tournament: tournamentId,
    p_preset: presetId,
  });
  if (error) {
    if (presetsUnavailable(error)) throw new Error(PRESETS_UNAVAILABLE);
    throw new Error(error.message);
  }
  return parseApplyResult(data, null);
}

/** Renames a preset, or changes its description. Row level security allows an owner or organizer. */
export async function renamePreset(
  client: SupabaseClient<Database>,
  presetId: string,
  name: string,
  description: string | null,
): Promise<void> {
  const { error } = await client
    .from("tournament_presets")
    .update({ name: name.trim(), description })
    .eq("id", presetId);
  if (error) {
    if (presetsUnavailable(error)) throw new Error(PRESETS_UNAVAILABLE);
    throw new Error(error.message);
  }
}

/** Deletes a preset. An event that already copied it keeps its own settings. */
export async function deletePreset(
  client: SupabaseClient<Database>,
  presetId: string,
): Promise<void> {
  const { error } = await client.from("tournament_presets").delete().eq("id", presetId);
  if (error) {
    if (presetsUnavailable(error)) throw new Error(PRESETS_UNAVAILABLE);
    throw new Error(error.message);
  }
}
