/**
 * The scan inbox: a card photo that is not yet a scorecard.
 *
 * The desk uploads a batch, the reader records what it saw, the matcher suggests players, and a
 * person confirms the player and the marker. Nothing here picks a player, writes data or reads the
 * clock. The state machine is the contract shared with the `scorecard_scans` table.
 */

export type {
  BatchDuplicate,
  BatchDuplicateReason,
  BatchFile,
  BatchInvalid,
  BatchPlan,
} from "./batch";
export { planBatchUpload } from "./batch";
export type {
  MarkerCandidate,
  MarkerCandidates,
  MarkerPoolPlayer,
  MarkerReasonCode,
} from "./markers";
export { markerCandidates } from "./markers";
export type {
  ScanBlocker,
  ScanBlockerCode,
  ScanReadiness,
  ScanReadinessOptions,
  ScanWarning,
  ScanWarningCode,
} from "./readiness";
export { LOW_CONFIDENCE_THRESHOLD, scanReadiness } from "./readiness";
export { applyScanEvent } from "./state";
export { suggestForScan } from "./suggest";
export type {
  ScanErrorCode,
  ScanEvent,
  ScanEventAccepted,
  ScanEventRejected,
  ScanEventResult,
  ScanImage,
  ScanReading,
  ScanReadingHole,
  ScanRecord,
  ScanSetAside,
  ScanState,
  ScanSuggestion,
} from "./types";
