/**
 * Pure logic for the desk components: search ranking, eligibility wording, the required-field
 * check, and the small time labels. Everything here is a plain function of its arguments, so the
 * behaviour is tested in `logic.test.ts` and the components stay thin.
 */

import { PAYMENT_LABEL } from "@/lib/data/types";
import { fmtIndex } from "@/lib/format";
import type { DeskRole, EligibilityView, PlayerPickItem, RegistrationField } from "./types";

/* ---------------------------------------------------------------------------------------------- */
/* Search ranking                                                                                  */
/* ---------------------------------------------------------------------------------------------- */

/** Lowercase, strip accents, collapse whitespace. Keeps digits so NGAP ids survive. */
export function normaliseText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Where a candidate matched, best first. The number is the sort weight: exact NGAP id beats an id
 * prefix, which beats the start of the name, which beats any word in the name, and so on. A lower
 * score sorts earlier.
 */
export const MATCH_WEIGHT = {
  ngapIdExact: 0,
  ngapIdPrefix: 1,
  nameStart: 2,
  nameWordStart: 3,
  nicknameStart: 4,
  ngapIdContains: 5,
  nameContains: 6,
} as const;

export type MatchRank = (typeof MATCH_WEIGHT)[keyof typeof MATCH_WEIGHT];

const startsWith = (haystack: string, needle: string) => haystack.startsWith(needle);

const wordStarts = (haystack: string, needle: string) =>
  haystack.split(" ").some((word) => word !== "" && startsWith(word, needle));

/**
 * The best rank for one item, or null when it does not match at all. NGAP id and name are the
 * identifiers the desk uses; nickname and home course are deliberately last so a half-typed name
 * never loses to a course.
 */
export function matchRank(item: PlayerPickItem, query: string): MatchRank | null {
  const q = normaliseText(query);
  if (q === "") return null;
  const name = normaliseText(item.player.name);
  const nickname = normaliseText(item.player.nickname ?? "");
  const ngapId = normaliseText(item.player.ngapId ?? "");

  if (ngapId !== "") {
    if (ngapId === q) return MATCH_WEIGHT.ngapIdExact;
    if (startsWith(ngapId, q)) return MATCH_WEIGHT.ngapIdPrefix;
  }
  if (startsWith(name, q)) return MATCH_WEIGHT.nameStart;
  if (wordStarts(name, q)) return MATCH_WEIGHT.nameWordStart;
  if (nickname !== "" && (startsWith(nickname, q) || wordStarts(nickname, q))) {
    return MATCH_WEIGHT.nicknameStart;
  }
  if (ngapId !== "" && ngapId.includes(q)) return MATCH_WEIGHT.ngapIdContains;
  if (name.includes(q)) return MATCH_WEIGHT.nameContains;
  return null;
}

/**
 * Ranks saved players for a typed query. An empty query returns the list untouched (the caller's
 * order, usually most recent first), capped. Matches sort by rank, then by name so the order is the
 * same on every render.
 */
export function rankPlayerMatches(
  items: PlayerPickItem[],
  query: string,
  options: { maxResults?: number } = {},
): PlayerPickItem[] {
  const max = Math.max(1, options.maxResults ?? 8);
  if (normaliseText(query) === "") return items.slice(0, max);
  const ranked: { item: PlayerPickItem; rank: MatchRank }[] = [];
  for (const item of items) {
    const rank = matchRank(item, query);
    if (rank !== null) ranked.push({ item, rank });
  }
  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.item.player.name.localeCompare(b.item.player.name) ||
      a.item.player.id.localeCompare(b.item.player.id),
  );
  return ranked.slice(0, max).map((entry) => entry.item);
}

/* ---------------------------------------------------------------------------------------------- */
/* Eligibility wording                                                                             */
/* ---------------------------------------------------------------------------------------------- */

export interface EligibilityInput {
  status: EligibilityView["status"];
  reasons?: string[];
  index: number | null;
  maxIndex?: number | null;
}

/**
 * Turns the routing result into one line the organizer can act on. A blocked player always gets a
 * reason; the index above the maximum case names both numbers. Nothing is claimed beyond what the
 * engine returned.
 */
export function eligibilityView(input: EligibilityInput): EligibilityView {
  const max = input.maxIndex ?? null;
  const reasons = (input.reasons ?? []).filter((reason) => reason.trim() !== "");
  const indexLabel = fmtIndex(input.index);

  if (input.status === "ineligible") {
    const fallback =
      max === null
        ? `Index ${indexLabel} is above the limit for this event, so this entry cannot be saved as ready.`
        : `Index ${indexLabel} is above the maximum of ${max}, so this entry cannot be saved as ready.`;
    return {
      status: "ineligible",
      tone: "bad",
      message: reasons[0] ?? fallback,
      blocked: true,
      maxIndex: max,
    };
  }

  if (input.status === "needs_review") {
    const fallback =
      "Not ready to route yet: the desk needs a handicap index or identity details before this player can be placed.";
    return {
      status: "needs_review",
      tone: "warn",
      message: reasons.length > 0 ? reasons.join(" ") : fallback,
      blocked: false,
      maxIndex: max,
    };
  }

  const message =
    input.index === null
      ? "Ready to route: no index is on file, so the event rule uses 0."
      : max === null
        ? `Index ${indexLabel} is on file and ready to route.`
        : `Index ${indexLabel} is within the event maximum of ${max}.`;
  return { status: "ok", tone: "ok", message, blocked: false, maxIndex: max };
}

/* ---------------------------------------------------------------------------------------------- */
/* Event fields                                                                                    */
/* ---------------------------------------------------------------------------------------------- */

const answered = (field: RegistrationField, value: string | undefined): boolean => {
  const text = (value ?? "").trim();
  if (field.type === "checkbox") return text === "yes" || text === "no";
  return text !== "";
};

/**
 * The event-specific fields that still need an answer for this role. Only required ones block:
 * optional questions stay hidden on the confirm card on purpose.
 */
export function missingRequiredFields(
  fields: RegistrationField[],
  values: Record<string, string>,
  role: "member" | "guest",
): RegistrationField[] {
  return fields.filter(
    (field) =>
      field.required &&
      (field.appliesTo === "both" || field.appliesTo === role) &&
      !answered(field, values[field.id]),
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Time and persistence labels                                                                     */
/* ---------------------------------------------------------------------------------------------- */

const pad = (value: number) => String(value).padStart(2, "0");

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** "2:05 PM". */
export function formatClock(date: Date): string {
  const hours = date.getHours();
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${pad(date.getMinutes())} ${suffix}`;
}

/** "12 Nov". */
export const formatDay = (date: Date): string => `${date.getDate()} ${MONTHS[date.getMonth()]}`;

export type AddedAtLabel =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "time"; time: string }
  | { kind: "datetime"; date: string; time: string };

/**
 * How to show the "added at" fact. Same day shows the clock time only; another day adds the date.
 * A missing value renders nothing at all, which is how the row behaves before the audit columns
 * exist.
 */
export function formatAddedAt(
  iso: string | null | undefined,
  now: Date = new Date(),
): AddedAtLabel {
  if (iso === null || iso === undefined || iso.trim() === "") return { kind: "none" };
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return { kind: "invalid" };
  const time = formatClock(at);
  if (sameDay(at, now)) return { kind: "time", time };
  return { kind: "datetime", date: formatDay(at), time };
}

/** "Added by Ana Reyes at 2:05 PM", or a shorter form when only one half is known. */
export function addedByLabel(
  audit: { addedByName?: string | null; addedAt?: string | null },
  now: Date = new Date(),
): string | null {
  const name = audit.addedByName?.trim() ?? "";
  const at = formatAddedAt(audit.addedAt, now);
  const atText =
    at.kind === "time"
      ? `at ${at.time}`
      : at.kind === "datetime"
        ? `at ${at.time} on ${at.date}`
        : "";
  if (name === "" && atText === "") return null;
  if (name === "") return `Added ${atText}`;
  if (atText === "") return `Added by ${name}`;
  return `Added by ${name} ${atText}`;
}

/** "Saved just now", "Saved 4 min ago", "Saved at 2:05 PM", "Saved 12 Nov, 2:05 PM". */
export function lastSavedLabel(iso: string | null | undefined, now: Date = new Date()): string {
  if (iso === null || iso === undefined || iso.trim() === "") return "Not saved yet";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "Saved";
  const seconds = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));
  if (seconds < 45) return "Saved just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Saved ${minutes} min ago`;
  if (sameDay(at, now)) return `Saved at ${formatClock(at)}`;
  return `Saved ${formatDay(at)}, ${formatClock(at)}`;
}

/** The order the payment choices appear in, with the existing labels. */
export const PAYMENT_OPTIONS = ["not_recorded", "pending", "recorded_paid", "waived"] as const;

export const paymentLabel = (status: keyof typeof PAYMENT_LABEL): string => PAYMENT_LABEL[status];

export type SaveTarget = "session" | "database" | null | undefined;

/**
 * The honest line about what happens when the organizer presses save. The component does not know
 * where the data goes, so the assembler passes the target (or its own wording).
 */
export function persistenceNote(target: SaveTarget, override?: string | null): string {
  const custom = override?.trim();
  if (custom) return custom;
  if (target === "session") {
    return "Nothing is written to a server: this entry lives in the browser session and a refresh clears it.";
  }
  if (target === "database") {
    return "Press Save registration to write this entry to the club database.";
  }
  return "Nothing is saved until you press Save registration.";
}

/** The role badge text; undefined when the member has no role (nothing to badge). */
export function roleLabel(role: DeskRole | null | undefined): string | null {
  if (role === null || role === undefined) return null;
  return role === "owner" ? "Owner" : role === "organizer" ? "Organizer" : "Desk";
}

/**
 * Whether a role passes a gate. `undefined` means auth is not configured (demo mode), so the gate
 * stays open; `null` means signed in without a membership row, which is treated as least privilege.
 * This is interface convenience only; the database decides what a member may actually do.
 */
export function isRoleAllowed(role: DeskRole | null | undefined, allow: DeskRole[]): boolean {
  if (role === undefined) return true;
  if (role === null) return false;
  return allow.includes(role);
}
