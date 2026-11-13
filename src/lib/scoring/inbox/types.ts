/**
 * A scanned paper card that is not a scorecard yet.
 *
 * The desk uploads a batch of card photos, the reader records what it saw, and a person confirms
 * which player and marker the card belongs to. This first state is kept in the inbox so a photo can
 * exist before a player is known. The state machine in `state.ts` is the contract shared with the
 * `scorecard_scans` table.
 *
 * Pure types only: no I/O, no React, no Supabase.
 */

import type { MatchReason } from "../match";

/** Where a scan sits on its way to becoming a scorecard. */
export type ScanState =
  | "uploaded"
  | "read"
  | "matched"
  | "confirmed"
  | "card_created"
  | "set_aside";

/** One hole as the reader saw it. `confidence` is null when the reader did not say. */
export interface ScanReadingHole {
  hole: number;
  strokes: number | null;
  /** True when the card marked the hole as picked up (an X). */
  pickedUp?: boolean;
  /** Reader confidence from 0 to 1, or null when it was not reported. */
  confidence: number | null;
}

/**
 * What the reader returned for one card. A name or holes must be present for the scan to count as
 * read. The reader does not return a tee, the HDCP box number or a group today, so they are absent
 * rather than invented.
 */
export interface ScanReading {
  engine: string;
  engineVersion: string;
  /** The name as read from the card, or null when no name could be read. */
  name: string | null;
  /** The total written by hand on the card, or null when it was not read. */
  writtenTotal: number | null;
  holes: ScanReadingHole[];
  /** When the reader finished, as an ISO 8601 string. Passed in; never taken from the clock here. */
  readAt: string;
}

/** A proposed player. The desk still confirms; a suggestion is never an assignment. */
export interface ScanSuggestion {
  playerId: string;
  /** 0 to 1, higher is better. Used only to order suggestions. */
  score: number;
  reasons: MatchReason[];
  /** True when the player already has a card in this round. */
  hasCard: boolean;
}

/** The stored photo for one scan. */
export interface ScanImage {
  /** Object storage key. */
  path: string;
  sha256: string;
  mime: string;
  bytes: number;
}

/** Why a scan was parked. Restoring it clears the player, marker and confirmation. */
export interface ScanSetAside {
  reason: string;
  by: string;
  at: string;
}

/**
 * One row of the scan inbox. Every value that is not set is `null`, never `undefined`, so the
 * record maps straight onto the table without a second shape.
 */
export interface ScanRecord {
  id: string;
  roundId: string;
  state: ScanState;
  image: ScanImage | null;
  reading: ScanReading | null;
  suggestions: ScanSuggestion[];
  playerId: string | null;
  markerId: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  scorecardId: string | null;
  setAside: ScanSetAside | null;
}

/** The actions the desk can take on a scan. */
export type ScanEvent =
  | { type: "record_reading"; reading: ScanReading }
  | { type: "match"; playerId: string | null }
  | { type: "confirm"; markerId: string; by: string; at: string }
  | { type: "set_aside"; reason: string; by: string; at: string }
  | { type: "restore" }
  | { type: "attach_card"; scorecardId: string; playerId: string };

/**
 * Stable codes for a refused event. The screens may translate these; the message is already plain
 * language for the desk.
 */
export type ScanErrorCode =
  | "not_allowed_from_state"
  | "player_not_set"
  | "marker_required"
  | "marker_is_player"
  | "reason_too_short"
  | "card_player_mismatch";

export interface ScanEventAccepted {
  ok: true;
  scan: ScanRecord;
}

export interface ScanEventRejected {
  ok: false;
  code: ScanErrorCode;
  message: string;
}

export type ScanEventResult = ScanEventAccepted | ScanEventRejected;
