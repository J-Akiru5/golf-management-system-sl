/**
 * Types for the registration-desk and shell components.
 *
 * These components are props-driven and self-contained: they do not fetch, do not touch Supabase,
 * and do not import the store. They speak the existing domain types (`PlayerRecord`,
 * `RegistrationField`, `PaymentStatus`, `RegistrationStatus`) and the adapter contract
 * (`NewEntryInput`), so the assembler can wire them to any repository implementation.
 *
 * Anything the existing types do not cover lives here in this file (per the component task): the
 * audit facts the database does not have yet, the role list, the pick-row shape and the small view
 * models for the banners and session bar.
 */
import type { NewEntryInput } from "@/lib/data/adapters";
import type { PaymentStatus, PlayerRecord, RegistrationField } from "@/lib/data/types";
import type { RegistrationStatus } from "@/lib/routing";

/** The club_members roles the desk recognises. Mirrors the database check constraint. */
export type DeskRole = "owner" | "organizer" | "desk";

/** Human labels for the role badge. */
export const ROLE_LABEL: Record<DeskRole, string> = {
  owner: "Owner",
  organizer: "Organizer",
  desk: "Desk",
};

/**
 * One row in the quick pick: a saved player plus whatever the routing pass knows about them for the
 * current event. The assembler builds these; the component never computes the index or category.
 */
export interface PlayerPickItem {
  player: PlayerRecord;
  /** Index to show: the frozen one for the event, or the latest on file. null = NH or none yet. */
  index: number | null;
  /** Category from routing, when the player can be classified. */
  categoryName: string | null;
  /** Playing handicap for the mapped tee, when known. */
  playingHandicap?: number | null;
  /** True when the player already has an entry in the event; the confirm step warns about it. */
  alreadyRegistered?: boolean;
}

/** Load state of any props-driven list. `idle` means the query is empty and nothing was asked. */
export type PickStatus = "idle" | "loading" | "ready" | "error";

/** The registration-desk view of an eligibility result, ready to render. */
export interface EligibilityView {
  status: RegistrationStatus;
  tone: "ok" | "warn" | "bad";
  message: string;
  /** True only when the entry cannot be saved: an index above the event maximum. */
  blocked: boolean;
  /** The event maximum, when one is configured. */
  maxIndex: number | null;
}

/** The audit facts a registration row can show. All optional: the columns do not exist yet. */
export interface RegistrationAudit {
  /** Display name of the member who took the registration. */
  addedByName?: string | null;
  /** ISO timestamp of when it was taken. */
  addedAt?: string | null;
  /** True when the organizer changed something by hand (draw move, flight, payment). */
  overridden?: boolean;
  overrideReason?: string | null;
}

/** What a status banner can say about the data behind a screen. */
export type DataStatus = "demo" | "loading" | "ready" | "error";

/**
 * The fields the assembler collects while confirming a registration. It is exactly the editable
 * part of `NewEntryInput`, kept as a named type so a component can be handed the values without
 * importing the stores.
 */
export type EntryDraftFields = Pick<
  NewEntryInput,
  | "role"
  | "sponsor"
  | "shirt"
  | "teePreferences"
  | "declaredWshId"
  | "declaredWshHandicap"
  | "extra"
  | "paymentStatus"
>;

/** Re-exported so screens can name the payment choices without another import. */
export type { PaymentStatus, RegistrationField, RegistrationStatus };
