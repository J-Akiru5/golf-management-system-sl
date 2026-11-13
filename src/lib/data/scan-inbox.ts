/**
 * The scan inbox data layer: photographed cards that are not scorecards yet.
 *
 * The rules live in `src/lib/scoring/inbox`. This file adds the repository the future screens call,
 * an in-memory demo that applies the same `applyScanEvent` state machine, and the view shapes.
 * Nothing here approves a card or turns a scan into one; `attachCard` only links a card the desk
 * already created.
 */

import type { ScoringRepository, ScoringRoundView } from "@/lib/data/scoring";
import {
  applyScanEvent,
  type MarkerCandidates,
  type MarkerPoolPlayer,
  markerCandidates,
  planBatchUpload,
  type ScanReadiness,
  type ScanReading,
  type ScanReadingHole,
  type ScanRecord,
  type ScanSuggestion,
  scanReadiness,
  suggestForScan,
} from "@/lib/scoring/inbox";
import type { RoundPlayer } from "@/lib/scoring/match";

/** The part of the scoring repository this layer reads the round's players from. */
export type ScanInboxScoringSource = Pick<ScoringRepository, "loadRound">;

/** One photo the caller has already stored. */
export interface ScanUploadFile {
  path: string;
  sha256: string;
  mime: string;
  bytes: number;
}

/** A scan that was created by an upload. */
export interface ScanUploadAdded {
  path: string;
  sha256: string;
  scanId: string;
}

/** A photo that was not created, with the reason in plain words. */
export interface ScanUploadSkipped {
  path: string;
  sha256: string;
  reason: string;
}

export interface ScanUploadResult {
  /** The inbox after the upload. */
  view: ScanInboxView;
  added: ScanUploadAdded[];
  skipped: ScanUploadSkipped[];
}

/** One inbox row with what the desk still has to check. */
export interface ScanInboxRow {
  scan: ScanRecord;
  readiness: ScanReadiness;
}

export interface ScanInboxView {
  roundId: string;
  tournamentId: string;
  dayNumber: number;
  /** Newest first. */
  rows: ScanInboxRow[];
}

/**
 * The scan inbox. Every write returns a fresh view, and a refused move throws an `Error` whose
 * message is the state rule in plain words. A day that is left out reads the earliest round, like
 * the scoring repository.
 */
export interface ScanInboxRepository {
  list(tournamentId: string, day?: number | null): Promise<ScanInboxView>;
  upload(
    tournamentId: string,
    files: readonly ScanUploadFile[],
    day?: number | null,
  ): Promise<ScanUploadResult>;
  recordReading(
    tournamentId: string,
    scanId: string,
    reading: ScanReading,
    day?: number | null,
  ): Promise<ScanInboxView>;
  match(
    tournamentId: string,
    scanId: string,
    playerId: string,
    day?: number | null,
  ): Promise<ScanInboxView>;
  /** Clears the picked player: the `matched -> read` move. */
  clearMatch(tournamentId: string, scanId: string, day?: number | null): Promise<ScanInboxView>;
  confirm(
    tournamentId: string,
    scanId: string,
    markerId: string,
    day?: number | null,
  ): Promise<ScanInboxView>;
  setAside(
    tournamentId: string,
    scanId: string,
    reason: string,
    day?: number | null,
  ): Promise<ScanInboxView>;
  restore(tournamentId: string, scanId: string, day?: number | null): Promise<ScanInboxView>;
  attachCard(
    tournamentId: string,
    scanId: string,
    cardId: string,
    day?: number | null,
  ): Promise<ScanInboxView>;
  /** Suggests a marker from the other team in the group. It never writes. */
  assignMarker(
    tournamentId: string,
    scanId: string,
    day?: number | null,
  ): Promise<MarkerCandidates>;
}

/** The round's players as the matcher wants them. Tee and group are absent, not invented. */
export function roundPlayersFor(view: ScoringRoundView): RoundPlayer[] {
  const withCards = new Set(view.cards.map((card) => card.playerId));
  return view.players.map((player) => ({
    playerId: player.playerId,
    name: player.playerName,
    playingHandicap: player.handicap?.playingHandicap ?? null,
    hasCard: withCards.has(player.playerId),
  }));
}

/** The ids of the round's players who already have a card. */
export function playersWithCardsFor(view: ScoringRoundView): string[] {
  return roundPlayersFor(view)
    .filter((player) => player.hasCard === true)
    .map((player) => player.playerId);
}

/** One row with its suggestions and readiness worked from the round's players. */
export function inboxRowFor(scan: ScanRecord, view: ScoringRoundView): ScanInboxRow {
  const players = roundPlayersFor(view);
  const suggestions =
    scan.reading === null ? [] : suggestForScan(scan.reading, players, { limit: 4 });
  const withSuggestions: ScanRecord = { ...scan, suggestions };
  const playerName =
    view.players.find((player) => player.playerId === scan.playerId)?.playerName ?? null;
  const readiness = scanReadiness(withSuggestions, {
    playersWithCards: playersWithCardsFor(view),
    playerName,
  });
  return { scan: withSuggestions, readiness };
}

/**
 * The caller has not loaded the group and team, so no marker is filled in. This is not a guess and
 * it does not blame the player: the desk can still pick the marker through `confirm`.
 */
export function markerPoolMissing(): MarkerCandidates {
  return {
    candidates: [],
    assignedMarkerId: null,
    reason: "no_candidates",
    message: "The group and team for this round were not loaded, so no marker can be assigned.",
  };
}

function copyScan(scan: ScanRecord): ScanRecord {
  return {
    ...scan,
    image: scan.image === null ? null : { ...scan.image },
    reading:
      scan.reading === null
        ? null
        : { ...scan.reading, holes: scan.reading.holes.map((hole) => ({ ...hole })) },
    suggestions: scan.suggestions.map((suggestion) => ({
      ...suggestion,
      reasons: suggestion.reasons.map((reason) => ({ ...reason })),
    })),
    setAside: scan.setAside === null ? null : { ...scan.setAside },
  };
}

export interface DemoScanInboxOptions {
  /** Where the round and its players come from, normally the demo scoring repository. */
  scoring: ScanInboxScoringSource;
  /**
   * Group, team and place in the group, when the caller has the draw. A marker is only filled in
   * when the order is known, so leaving this out fills nothing rather than guessing.
   */
  markerPool?: (
    tournamentId: string,
    dayNumber: number,
  ) => readonly MarkerPoolPlayer[] | Promise<readonly MarkerPoolPlayer[]>;
  /** Scans already in the inbox, oldest first. */
  scans?: readonly ScanRecord[];
  actor?: string;
  idFactory?: () => string;
  now?: () => number;
}

interface StoredScan {
  scan: ScanRecord;
  createdAt: string;
  sequence: number;
}

/**
 * An in-memory scan inbox for the demo and for tests.
 *
 * It does not replace the database. It applies the same pure state machine and exposes the same
 * view, so the screens do not depend on Supabase and the demo can run the whole flow.
 */
export function createDemoScanInboxRepository(options: DemoScanInboxOptions): ScanInboxRepository {
  const actor = options.actor ?? "demo-desk";
  const idFactory = options.idFactory ?? (() => globalThis.crypto.randomUUID());
  const clock = options.now ?? (() => Date.now());

  let lastTick = 0;
  const nextIso = () => {
    lastTick = Math.max(clock(), lastTick + 1);
    return new Date(lastTick).toISOString();
  };

  let sequence = 0;
  let stored: StoredScan[] = (options.scans ?? []).map((scan) => {
    sequence += 1;
    return { scan: copyScan(scan), createdAt: nextIso(), sequence };
  });

  async function roundFor(tournamentId: string, day?: number | null): Promise<ScoringRoundView> {
    const view = await options.scoring.loadRound(tournamentId, day);
    if (!view) throw new Error("No scoring round is configured for this tournament.");
    return view;
  }

  function findScan(scanId: string): StoredScan {
    const found = stored.find((entry) => entry.scan.id === scanId);
    if (!found) throw new Error("Scan not found.");
    return found;
  }

  async function buildView(tournamentId: string, day?: number | null): Promise<ScanInboxView> {
    const view = await roundFor(tournamentId, day);
    const rows = stored
      .filter((entry) => entry.scan.roundId === view.roundId)
      .sort((left, right) => {
        const byTime = right.createdAt.localeCompare(left.createdAt);
        return byTime !== 0 ? byTime : right.sequence - left.sequence;
      })
      .map((entry) => inboxRowFor(entry.scan, view));
    return {
      roundId: view.roundId,
      tournamentId,
      dayNumber: view.dayNumber,
      rows,
    };
  }

  function pushScan(scan: ScanRecord) {
    sequence += 1;
    stored = [...stored, { scan, createdAt: nextIso(), sequence }];
  }

  async function applyOne(
    scanId: string,
    event: Parameters<typeof applyScanEvent>[1],
  ): Promise<ScanRecord> {
    const entry = findScan(scanId);
    const result = applyScanEvent(entry.scan, event);
    if (!result.ok) throw new Error(result.message);
    entry.scan = result.scan;
    return result.scan;
  }

  async function matchScan(
    tournamentId: string,
    scanId: string,
    playerId: string | null,
    day?: number | null,
  ): Promise<ScanInboxView> {
    await roundFor(tournamentId, day);
    await applyOne(scanId, { type: "match", playerId });
    return buildView(tournamentId, day);
  }

  return {
    async list(tournamentId, day) {
      return buildView(tournamentId, day);
    },

    async upload(tournamentId, files, day) {
      const view = await roundFor(tournamentId, day);
      const existing = stored
        .filter((entry) => entry.scan.roundId === view.roundId)
        .flatMap((entry) => (entry.scan.image === null ? [] : [entry.scan.image.sha256]));
      const plan = planBatchUpload(
        files.map((file) => ({ name: file.path, sha256: file.sha256 })),
        existing,
      );
      const fileByPath = new Map(files.map((file) => [file.path, file]));

      const added: ScanUploadAdded[] = [];
      for (const planned of plan.toCreate) {
        const file = fileByPath.get(planned.name);
        if (!file) continue;
        const sha256 = file.sha256.trim().toLowerCase();
        const scan: ScanRecord = {
          id: idFactory(),
          roundId: view.roundId,
          state: "uploaded",
          image: { path: file.path, sha256, mime: file.mime, bytes: file.bytes },
          reading: null,
          suggestions: [],
          playerId: null,
          markerId: null,
          confirmedBy: null,
          confirmedAt: null,
          scorecardId: null,
          setAside: null,
        };
        pushScan(scan);
        added.push({ path: file.path, sha256, scanId: scan.id });
      }

      const skipped: ScanUploadSkipped[] = [
        ...plan.duplicates.map((duplicate) => ({
          path: duplicate.name,
          sha256: duplicate.sha256,
          reason: duplicate.message,
        })),
        ...plan.invalid.map((invalid) => ({
          path: invalid.name,
          sha256: invalid.sha256,
          reason: invalid.message,
        })),
      ];

      return { view: await buildView(tournamentId, day), added, skipped };
    },

    async recordReading(tournamentId, scanId, reading, day) {
      const view = await roundFor(tournamentId, day);
      const suggestions: ScanSuggestion[] = suggestForScan(reading, roundPlayersFor(view), {
        limit: 4,
      });
      const entry = findScan(scanId);
      const result = applyScanEvent(entry.scan, { type: "record_reading", reading });
      if (!result.ok) throw new Error(result.message);
      entry.scan = { ...result.scan, suggestions };
      return buildView(tournamentId, day);
    },

    async match(tournamentId, scanId, playerId, day) {
      return matchScan(tournamentId, scanId, playerId, day);
    },

    async clearMatch(tournamentId, scanId, day) {
      return matchScan(tournamentId, scanId, null, day);
    },

    async confirm(tournamentId, scanId, markerId, day) {
      await roundFor(tournamentId, day);
      await applyOne(scanId, { type: "confirm", markerId, by: actor, at: nextIso() });
      return buildView(tournamentId, day);
    },

    async setAside(tournamentId, scanId, reason, day) {
      await roundFor(tournamentId, day);
      await applyOne(scanId, { type: "set_aside", reason, by: actor, at: nextIso() });
      return buildView(tournamentId, day);
    },

    async restore(tournamentId, scanId, day) {
      await roundFor(tournamentId, day);
      await applyOne(scanId, { type: "restore" });
      return buildView(tournamentId, day);
    },

    async attachCard(tournamentId, scanId, cardId, day) {
      await roundFor(tournamentId, day);
      const entry = findScan(scanId);
      await applyOne(scanId, {
        type: "attach_card",
        scorecardId: cardId,
        playerId: entry.scan.playerId ?? "",
      });
      return buildView(tournamentId, day);
    },

    async assignMarker(tournamentId, scanId, day) {
      const view = await roundFor(tournamentId, day);
      const entry = findScan(scanId);
      if (entry.scan.playerId === null) {
        return {
          candidates: [],
          assignedMarkerId: null,
          reason: "player_not_found",
          message: "Pick the player on the card before choosing a marker.",
        };
      }
      if (!options.markerPool) return markerPoolMissing();
      const players = await options.markerPool(tournamentId, view.dayNumber);
      return markerCandidates(entry.scan.playerId, players);
    },
  };
}

/** The hole shape the migration stores. A pick-up is 0 strokes and a picked-up flag. */
export function readingHoleJson(hole: ScanReadingHole): Record<string, unknown> {
  const pickedUp = hole.pickedUp === true;
  return {
    hole: hole.hole,
    strokes: pickedUp ? 0 : hole.strokes,
    ...(pickedUp ? { picked_up: true } : {}),
    confidence: hole.confidence,
  };
}
