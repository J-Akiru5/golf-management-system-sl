import type { RegistrationEntry } from "./types";

/** The three views of the player roster's pairing filter. */
export type PairingStatus = "all" | "paired" | "unpaired";

/** The registration fields the pairing filter reads. */
export type PairingFacts = Pick<RegistrationEntry, "teamNo">;

/** How many players each pairing view would show. */
export interface PairingCounts {
  all: number;
  paired: number;
  unpaired: number;
}

export const PAIRING_FILTERS: readonly { id: PairingStatus; label: string }[] = [
  { id: "all", label: "All players" },
  { id: "paired", label: "Paired" },
  { id: "unpaired", label: "Unpaired" },
];

/**
 * True when the active event's registration carries a partner number. A player with no registration
 * cannot be paired, so they read as unpaired.
 */
export function isPaired(entry: PairingFacts | null | undefined): boolean {
  return entry?.teamNo != null;
}

/** Reads `?pairing_status=`. A missing or unknown value falls back to All. */
export function pairingStatusFromQuery(value: string | null | undefined): PairingStatus {
  return value === "paired" || value === "unpaired" ? value : "all";
}

/** Whether the entry belongs in the chosen pairing view. */
export function matchesPairing(
  entry: PairingFacts | null | undefined,
  status: PairingStatus,
): boolean {
  if (status === "all") return true;
  return isPaired(entry) === (status === "paired");
}

/**
 * Splits the list the organizer is looking at into the three views. Call this after the search and
 * the other filters and before the pairing filter, so each badge says what its view will show.
 */
export function countPairings(
  entries: readonly (PairingFacts | null | undefined)[],
): PairingCounts {
  let paired = 0;
  for (const entry of entries) {
    if (isPaired(entry)) paired += 1;
  }
  return { all: entries.length, paired, unpaired: entries.length - paired };
}
