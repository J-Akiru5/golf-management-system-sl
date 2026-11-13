/**
 * The connected scan inbox repository.
 *
 * The migration that creates `public.scorecard_scans` and its seven functions is written but NOT
 * APPLIED. The owner approves that file by name before it is applied. Nothing in this file has run
 * against a real project, and the generated types were extended by hand to match the migration
 * because they cannot be regenerated yet.
 *
 * Writes go through the guarded functions only; the table is read with `select("*")`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ScanInboxRepository,
  ScanInboxRow,
  ScanInboxScoringSource,
  ScanInboxView,
  ScanUploadAdded,
  ScanUploadFile,
  ScanUploadSkipped,
} from "@/lib/data/scan-inbox";
import {
  inboxRowFor,
  markerPoolMissing,
  readingHoleJson,
  roundPlayersFor,
} from "@/lib/data/scan-inbox";
import { createSupabaseScoringRepository } from "@/lib/data/supabase/scoring";
import {
  applyScanEvent,
  type MarkerPoolPlayer,
  markerCandidates,
  planBatchUpload,
  type ScanReading,
  type ScanReadingHole,
  type ScanRecord,
  type ScanState,
  suggestForScan,
} from "@/lib/scoring/inbox";
import type { Database, Json } from "@/lib/supabase/generated-types";
import type { Database as AppDatabase } from "@/lib/supabase/types";

type Db = Database["public"];
type ScanRow = Db["Tables"]["scorecard_scans"]["Row"];

export interface SupabaseScanInboxOptions {
  client: SupabaseClient<AppDatabase>;
  /**
   * Where the round and its players come from. Defaults to the connected scoring repository, so
   * the inbox reuses the scoring view rather than reading the players again.
   */
  scoring?: ScanInboxScoringSource;
  /**
   * Group, team and place in the group, when the caller has the draw. A marker is only filled in
   * when the order is known, so leaving this out fills nothing rather than guessing.
   */
  markerPool?: (
    tournamentId: string,
    dayNumber: number,
  ) => readonly MarkerPoolPlayer[] | Promise<readonly MarkerPoolPlayer[]>;
}

function readingHolesFrom(value: Json | null): ScanReadingHole[] {
  if (!Array.isArray(value)) return [];
  const holes: ScanReadingHole[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, Json | undefined>;
    const hole = record.hole;
    if (typeof hole !== "number" || !Number.isFinite(hole)) continue;
    const strokes = record.strokes;
    const confidence = record.confidence;
    holes.push({
      hole,
      strokes: typeof strokes === "number" && Number.isFinite(strokes) ? strokes : null,
      ...(record.picked_up === true ? { pickedUp: true } : {}),
      confidence: typeof confidence === "number" && Number.isFinite(confidence) ? confidence : null,
    });
  }
  return holes;
}

function readingFromRow(row: ScanRow): ScanReading | null {
  const hasReading =
    row.read_at !== null ||
    row.reader_engine !== null ||
    row.reader_engine_version !== null ||
    row.reader_name !== null ||
    row.reader_holes !== null ||
    row.reader_raw !== null ||
    row.reader_written_total !== null;
  if (!hasReading) return null;

  return {
    engine: row.reader_engine ?? "",
    engineVersion: row.reader_engine_version ?? "",
    name: row.reader_name,
    writtenTotal: row.reader_written_total,
    holes: readingHolesFrom(row.reader_holes),
    readAt: row.read_at ?? "",
  };
}

/** A stored row as the inbox record. Every value that is not set is null, never undefined. */
export function scanRecordFromRow(row: ScanRow): ScanRecord {
  const hasSetAside =
    row.set_aside_reason !== null || row.set_aside_by !== null || row.set_aside_at !== null;
  return {
    id: row.id,
    roundId: row.round_id,
    state: row.state as ScanState,
    image: {
      path: row.storage_path,
      sha256: row.sha256,
      mime: row.mime_type,
      bytes: row.byte_size,
    },
    reading: readingFromRow(row),
    suggestions: [],
    playerId: row.player_id,
    markerId: row.marker_id,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
    scorecardId: row.scorecard_id,
    setAside: hasSetAside
      ? {
          reason: row.set_aside_reason ?? "",
          by: row.set_aside_by ?? "",
          at: row.set_aside_at ?? "",
        }
      : null,
  };
}

function skippedFromPlan(
  duplicates: readonly { name: string; sha256: string; message: string }[],
  invalid: readonly { name: string; sha256: string; message: string }[],
): ScanUploadSkipped[] {
  return [
    ...duplicates.map((duplicate) => ({
      path: duplicate.name,
      sha256: duplicate.sha256,
      reason: duplicate.message,
    })),
    ...invalid.map((item) => ({
      path: item.name,
      sha256: item.sha256,
      reason: item.message,
    })),
  ];
}

/**
 * The connected scan inbox. It calls the seven functions from the unapplied migration by name and
 * checks each move with `applyScanEvent` first, so a refused move reads the same here and in the
 * demo.
 */
export function createSupabaseScanInboxRepository(
  options: SupabaseScanInboxOptions,
): ScanInboxRepository {
  const db = options.client as unknown as SupabaseClient<Database>;
  const scoring = options.scoring ?? createSupabaseScoringRepository({ client: options.client });

  async function roundFor(tournamentId: string, day?: number | null) {
    const view = await scoring.loadRound(tournamentId, day);
    if (!view) throw new Error("No scoring round is configured for this tournament.");
    return view;
  }

  async function loadRows(roundId: string): Promise<ScanRow[]> {
    const { data, error } = await db
      .from("scorecard_scans")
      .select("*")
      .eq("round_id", roundId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Could not load the scan inbox: ${error.message}`);
    return data ?? [];
  }

  async function viewFor(tournamentId: string, day?: number | null): Promise<ScanInboxView> {
    const view = await roundFor(tournamentId, day);
    const rows = await loadRows(view.roundId);
    const inboxRows: ScanInboxRow[] = rows.map((row) => inboxRowFor(scanRecordFromRow(row), view));
    return {
      roundId: view.roundId,
      tournamentId,
      dayNumber: view.dayNumber,
      rows: inboxRows,
    };
  }

  async function requireScan(tournamentId: string, scanId: string, day?: number | null) {
    const view = await roundFor(tournamentId, day);
    const rows = await loadRows(view.roundId);
    const row = rows.find((candidate) => candidate.id === scanId);
    if (!row) throw new Error("Scan not found.");
    return { view, scan: scanRecordFromRow(row) };
  }

  async function matchScan(
    tournamentId: string,
    scanId: string,
    playerId: string | null,
    day?: number | null,
  ): Promise<ScanInboxView> {
    const { scan } = await requireScan(tournamentId, scanId, day);
    const check = applyScanEvent(scan, { type: "match", playerId });
    if (!check.ok) throw new Error(check.message);

    const { error } = await db.rpc("match_scorecard_scan", {
      p_player: playerId,
      p_scan: scanId,
    } as unknown as Db["Functions"]["match_scorecard_scan"]["Args"]);
    if (error) throw new Error(`Could not match the scan: ${error.message}`);
    return viewFor(tournamentId, day);
  }

  return {
    async list(tournamentId, day) {
      return viewFor(tournamentId, day);
    },

    async upload(tournamentId, files, day) {
      const view = await roundFor(tournamentId, day);
      const rows = await loadRows(view.roundId);
      const plan = planBatchUpload(
        files.map((file) => ({ name: file.path, sha256: file.sha256 })),
        rows.map((row) => row.sha256),
      );
      const fileByPath = new Map<string, ScanUploadFile>(files.map((file) => [file.path, file]));

      const added: ScanUploadAdded[] = [];
      for (const planned of plan.toCreate) {
        const file = fileByPath.get(planned.name);
        if (!file) continue;
        const { data, error } = await db.rpc("create_scorecard_scan", {
          p_bytes: file.bytes,
          p_mime: file.mime,
          p_round: view.roundId,
          p_sha256: file.sha256,
          p_storage_path: file.path,
        } as unknown as Db["Functions"]["create_scorecard_scan"]["Args"]);
        if (error) throw new Error(`Could not create the scan: ${error.message}`);
        if (typeof data !== "string") {
          throw new Error("The scan was not created: the database returned no id.");
        }
        added.push({
          path: file.path,
          sha256: file.sha256.trim().toLowerCase(),
          scanId: data,
        });
      }

      return {
        view: await viewFor(tournamentId, day),
        added,
        skipped: skippedFromPlan(plan.duplicates, plan.invalid),
      };
    },

    async recordReading(tournamentId, scanId, reading, day) {
      const { view, scan } = await requireScan(tournamentId, scanId, day);
      const check = applyScanEvent(scan, { type: "record_reading", reading });
      if (!check.ok) throw new Error(check.message);

      const candidates = suggestForScan(reading, roundPlayersFor(view), { limit: 4 });
      const { error } = await db.rpc("record_scan_reading", {
        p_candidates: candidates as unknown as Json,
        p_engine: reading.engine,
        p_engine_version: reading.engineVersion,
        p_holes: reading.holes.map(readingHoleJson) as unknown as Json,
        p_name: reading.name,
        p_raw: null,
        p_scan: scanId,
        p_written_total: reading.writtenTotal,
      } as unknown as Db["Functions"]["record_scan_reading"]["Args"]);
      if (error) throw new Error(`Could not record the reading: ${error.message}`);
      return viewFor(tournamentId, day);
    },

    async match(tournamentId, scanId, playerId, day) {
      return matchScan(tournamentId, scanId, playerId, day);
    },

    async clearMatch(tournamentId, scanId, day) {
      return matchScan(tournamentId, scanId, null, day);
    },

    async confirm(tournamentId, scanId, markerId, day) {
      const { scan } = await requireScan(tournamentId, scanId, day);
      const check = applyScanEvent(scan, {
        type: "confirm",
        markerId,
        // The check only needs the shape; the database writes the real member and time.
        by: "desk",
        at: "",
      });
      if (!check.ok) throw new Error(check.message);

      const { error } = await db.rpc("confirm_scorecard_scan", {
        p_marker: markerId,
        p_scan: scanId,
      });
      if (error) throw new Error(`Could not confirm the scan: ${error.message}`);
      return viewFor(tournamentId, day);
    },

    async setAside(tournamentId, scanId, reason, day) {
      const { scan } = await requireScan(tournamentId, scanId, day);
      const check = applyScanEvent(scan, {
        type: "set_aside",
        reason,
        by: "desk",
        at: "",
      });
      if (!check.ok) throw new Error(check.message);

      const { error } = await db.rpc("set_aside_scorecard_scan", {
        p_reason: reason,
        p_scan: scanId,
      });
      if (error) throw new Error(`Could not set the scan aside: ${error.message}`);
      return viewFor(tournamentId, day);
    },

    async restore(tournamentId, scanId, day) {
      const { scan } = await requireScan(tournamentId, scanId, day);
      const check = applyScanEvent(scan, { type: "restore" });
      if (!check.ok) throw new Error(check.message);

      const { error } = await db.rpc("restore_scorecard_scan", { p_scan: scanId });
      if (error) throw new Error(`Could not restore the scan: ${error.message}`);
      return viewFor(tournamentId, day);
    },

    async attachCard(tournamentId, scanId, cardId, day) {
      const { scan } = await requireScan(tournamentId, scanId, day);
      const check = applyScanEvent(scan, {
        type: "attach_card",
        scorecardId: cardId,
        playerId: scan.playerId ?? "",
      });
      if (!check.ok) throw new Error(check.message);

      const { error } = await db.rpc("attach_scan_card", {
        p_card: cardId,
        p_scan: scanId,
      });
      if (error) throw new Error(`Could not attach the card: ${error.message}`);
      return viewFor(tournamentId, day);
    },

    async assignMarker(tournamentId, scanId, day) {
      const { view, scan } = await requireScan(tournamentId, scanId, day);
      if (scan.playerId === null) {
        return {
          candidates: [],
          assignedMarkerId: null,
          reason: "player_not_found",
          message: "Pick the player on the card before choosing a marker.",
        };
      }
      if (!options.markerPool) return markerPoolMissing();
      const players = await options.markerPool(tournamentId, view.dayNumber);
      return markerCandidates(scan.playerId, players);
    },
  };
}
