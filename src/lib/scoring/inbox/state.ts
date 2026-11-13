/**
 * The scan inbox state machine.
 *
 * This is the contract with the `scorecard_scans` table: the same transitions and the same facts
 * hold in both places. It is pure. It never changes its input, never throws, and every refused
 * action returns a stable code plus a plain message for the desk.
 *
 * Legal moves:
 *   uploaded -> read -> matched -> confirmed -> card_created
 *   read -> read (re-read), matched -> matched (another player), matched -> read (clear)
 *   confirmed -> matched (reopen and match again)
 *   uploaded|read|matched|confirmed -> set_aside -> read|uploaded (restore)
 *   card_created is final.
 */

import type {
  ScanErrorCode,
  ScanEvent,
  ScanEventRejected,
  ScanEventResult,
  ScanRecord,
} from "./types";

const MIN_SET_ASIDE_REASON = 3;

function rejected(code: ScanErrorCode, message: string): ScanEventRejected {
  return { ok: false, code, message };
}

function accepted(scan: ScanRecord): ScanEventResult {
  return { ok: true, scan };
}

/**
 * Records what the reader saw. Allowed on a new scan and on a re-read. The player and marker stay
 * unset because a reading on its own never identifies anyone.
 */
function recordReading(scan: ScanRecord, event: Extract<ScanEvent, { type: "record_reading" }>) {
  if (scan.state !== "uploaded" && scan.state !== "read") {
    return rejected(
      "not_allowed_from_state",
      "A reading can only be recorded on a new or read scan.",
    );
  }
  return accepted({
    ...scan,
    state: "read",
    reading: event.reading,
    playerId: null,
    markerId: null,
    confirmedBy: null,
    confirmedAt: null,
    scorecardId: null,
    setAside: null,
  });
}

/**
 * Picks a player, or clears the pick with `null`. A new pick drops the marker and confirmation, as
 * the SQL does, because the marker belongs to the player and must be picked again.
 */
function match(scan: ScanRecord, event: Extract<ScanEvent, { type: "match" }>) {
  if (scan.state !== "read" && scan.state !== "matched" && scan.state !== "confirmed") {
    if (scan.state === "uploaded") {
      return rejected("not_allowed_from_state", "Read the card before matching a player.");
    }
    return rejected("not_allowed_from_state", "This scan can no longer be matched to a player.");
  }

  if (event.playerId === null) {
    if (scan.state === "read") {
      return rejected("not_allowed_from_state", "There is no player to clear on this scan.");
    }
    return accepted({
      ...scan,
      state: "read",
      playerId: null,
      markerId: null,
      confirmedBy: null,
      confirmedAt: null,
      scorecardId: null,
    });
  }

  return accepted({
    ...scan,
    state: "matched",
    playerId: event.playerId,
    markerId: null,
    confirmedBy: null,
    confirmedAt: null,
    scorecardId: null,
  });
}

/** Confirms the player and marker. Confirming is the approval step (D7). */
function confirm(scan: ScanRecord, event: Extract<ScanEvent, { type: "confirm" }>) {
  if (scan.state !== "matched") {
    return rejected("not_allowed_from_state", "Only a matched scan can be confirmed.");
  }
  if (scan.playerId === null) {
    return rejected("player_not_set", "Pick the player before confirming the card.");
  }
  if (event.markerId.trim() === "") {
    return rejected("marker_required", "Pick a marker before confirming the card.");
  }
  if (event.markerId === scan.playerId) {
    return rejected(
      "marker_is_player",
      "The marker must be another player, not the player on the card.",
    );
  }
  return accepted({
    ...scan,
    state: "confirmed",
    markerId: event.markerId,
    confirmedBy: event.by,
    confirmedAt: event.at,
  });
}

/** Parks a scan with a reason. The player and marker are kept so the desk can still see them. */
function setAside(scan: ScanRecord, event: Extract<ScanEvent, { type: "set_aside" }>) {
  if (
    scan.state !== "uploaded" &&
    scan.state !== "read" &&
    scan.state !== "matched" &&
    scan.state !== "confirmed"
  ) {
    return rejected("not_allowed_from_state", "This scan cannot be set aside.");
  }
  const reason = event.reason.trim();
  if (reason.length < MIN_SET_ASIDE_REASON) {
    return rejected("reason_too_short", "Give a reason of at least three characters.");
  }
  return accepted({
    ...scan,
    state: "set_aside",
    setAside: { reason, by: event.by, at: event.at },
  });
}

/**
 * Brings a parked scan back. It returns to `read` when a reading exists and to `uploaded`
 * otherwise. The player, marker and confirmation are cleared because those facts do not hold on
 * either restored state.
 */
function restore(scan: ScanRecord) {
  if (scan.state !== "set_aside") {
    return rejected("not_allowed_from_state", "Only a scan that was set aside can be restored.");
  }
  return accepted({
    ...scan,
    state: scan.reading !== null ? "read" : "uploaded",
    playerId: null,
    markerId: null,
    confirmedBy: null,
    confirmedAt: null,
    scorecardId: null,
    setAside: null,
  });
}

/** Attaches the created scorecard. The card must belong to the player already confirmed. */
function attachCard(scan: ScanRecord, event: Extract<ScanEvent, { type: "attach_card" }>) {
  if (scan.state !== "confirmed") {
    return rejected("not_allowed_from_state", "Confirm the scan before creating a card.");
  }
  if (scan.playerId !== event.playerId) {
    return rejected("card_player_mismatch", "The card belongs to a different player.");
  }
  return accepted({
    ...scan,
    state: "card_created",
    scorecardId: event.scorecardId,
  });
}

/** Applies one event. The input record is never changed. */
export function applyScanEvent(scan: ScanRecord, event: ScanEvent): ScanEventResult {
  switch (event.type) {
    case "record_reading":
      return recordReading(scan, event);
    case "match":
      return match(scan, event);
    case "confirm":
      return confirm(scan, event);
    case "set_aside":
      return setAside(scan, event);
    case "restore":
      return restore(scan);
    case "attach_card":
      return attachCard(scan, event);
    default:
      return rejected("not_allowed_from_state", "This action is not supported for a scan.");
  }
}
