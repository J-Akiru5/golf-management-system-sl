import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportRecord } from "@/lib/ngap";
import type { Database, TableRow } from "@/lib/supabase/types";

type HandicapRecordRow = TableRow<"handicap_records">;

export interface EffectiveHandicap {
  index: number | null;
  effectiveDate: string;
}

/** Combines stored history with this import; NH rows can override older numeric history. */
export function effectiveIndexesFromImport(
  latestStored: Map<string, EffectiveHandicap>,
  records: ImportRecord[],
  cutoffDate: string,
): Map<string, EffectiveHandicap> {
  const latestImported = new Map<string, ImportRecord>();
  for (const record of records) {
    if (!record.playerId || record.effectiveDate > cutoffDate) continue;
    const previous = latestImported.get(record.playerId);
    if (!previous || record.effectiveDate >= previous.effectiveDate) {
      latestImported.set(record.playerId, record);
    }
  }

  const result = new Map<string, EffectiveHandicap>();
  for (const [playerId, imported] of latestImported) {
    const stored = latestStored.get(playerId);
    result.set(
      playerId,
      stored && stored.effectiveDate > imported.effectiveDate
        ? stored
        : { index: imported.index, effectiveDate: imported.effectiveDate },
    );
  }
  return result;
}

export async function upsertImportedHandicapRecords(
  client: SupabaseClient<Database>,
  clubId: string,
  records: ImportRecord[],
): Promise<void> {
  const rows = records.flatMap((record) =>
    record.playerId && record.index !== null
      ? [
          {
            club_id: clubId,
            player_id: record.playerId,
            handicap_index: record.index,
            effective_date: record.effectiveDate,
            source: "ngap_import" as const,
          },
        ]
      : [],
  );
  if (!rows.length) return;

  const { data, error } = await client
    .from("handicap_records")
    .upsert(rows, { onConflict: "player_id,effective_date" })
    .select("id");
  if (error) throw new Error(`Could not save imported handicap records: ${error.message}`);
  if (data.length !== rows.length) {
    throw new Error("Not all imported handicap records were saved for this club.");
  }
}

export async function countImportedHandicapRecords(
  client: SupabaseClient<Database>,
  clubId: string,
  playerIds: string[],
  cutoffDate: string,
): Promise<number> {
  if (!playerIds.length) return 0;
  const { count, error } = await client
    .from("handicap_records")
    .select("id", { count: "exact", head: true })
    .eq("club_id", clubId)
    .eq("source", "ngap_import")
    .in("player_id", playerIds)
    .lte("effective_date", cutoffDate);
  if (error) throw new Error(`Could not count imported handicap records: ${error.message}`);
  return count ?? 0;
}

export async function loadLatestHandicapRecordsAtCutoff(
  client: SupabaseClient<Database>,
  clubId: string,
  playerIds: string[],
  cutoffDate: string,
): Promise<Map<string, EffectiveHandicap>> {
  if (!playerIds.length) return new Map();
  const { data, error } = await client
    .from("handicap_records")
    .select("player_id, handicap_index, effective_date")
    .eq("club_id", clubId)
    .in("player_id", playerIds)
    .lte("effective_date", cutoffDate)
    .order("effective_date", { ascending: false });
  if (error) throw new Error(`Could not load handicap history: ${error.message}`);

  const latest = new Map<string, EffectiveHandicap>();
  for (const row of data as Pick<
    HandicapRecordRow,
    "player_id" | "handicap_index" | "effective_date"
  >[]) {
    if (!latest.has(row.player_id)) {
      latest.set(row.player_id, {
        index: Number(row.handicap_index),
        effectiveDate: row.effective_date,
      });
    }
  }
  return latest;
}
