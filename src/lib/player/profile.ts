import { SAMPLE_INDEX, SAMPLE_PLAYER } from "./demo-identity";
import type { PortalEntry } from "./portal";

/**
 * The player's own profile: the pure part.
 *
 * The database returns one jsonb row for the signed-in account (`player_own_profile`, added by
 * `20261108000200_player_self_profile.sql`). This module maps that row to typed values and validates
 * the three fields a player may change. It performs no I/O, so the mapping and the rules are unit
 * tested without a database.
 *
 * The validators return translation KEYS, never sentences: the page decides the language, and a
 * sentence baked in here could not speak Tagalog or Hiligaynon.
 */

export type ContactField = "phone" | "email" | "nickname";

export type ContactErrorKey =
  | "profile.contact.errorPhone"
  | "profile.contact.errorEmail"
  | "profile.contact.errorNickname";

export interface ContactInput {
  phone: string;
  email: string;
  nickname: string;
}

/** The values that travel to the database: trimmed, blank becomes empty. */
export interface ContactValues {
  phone: string;
  email: string;
  nickname: string;
}

export interface ContactValidation {
  ok: boolean;
  values: ContactValues;
  errors: Partial<Record<ContactField, ContactErrorKey>>;
}

export interface OwnProfile {
  linked: boolean;
  player: { id: string; name: string; ngapId: string | null };
  contact: ContactValues;
  handicap: { index: number | null; effectiveDate: string | null };
  membership: { type: "member" | "guest" | null; memberNumber: string | null };
  clubName: string | null;
  /**
   * Booleans only. The private bucket path never leaves the database, and the public path is
   * fetched separately so this row cannot be cached and replayed as a URL.
   */
  photo: { private: boolean; public: boolean; publicConsentAt: string | null };
}

export const NICKNAME_MAX = 24;
export const PHONE_MAX = 24;
export const EMAIL_MAX = 254;

/** Whitespace, including the non-breaking space a phone keyboard can insert. */
const trim = (value: string): string => value.replace(/^[\s\u00a0]+|[\s\u00a0]+$/g, "");

/** Control characters would break a printed sheet, so they become plain spaces. */
const cleanLine = (value: string): string =>
  value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function normalizeContact(input: ContactInput): ContactValues {
  return {
    phone: trim(input.phone),
    email: trim(input.email),
    nickname: cleanLine(input.nickname),
  };
}

/**
 * Philippine mobile numbers are written many ways: 0917 123 4567, +63 917 123 4567, 0917-123-4567,
 * (0917) 123 4567, 0063 917 123 4567. All of them are accepted. Only the basic shape is checked:
 * digits, spaces, dashes, dots, brackets and at most one leading +. A number is never refused for
 * being unusual.
 */
function phoneError(phone: string): ContactErrorKey | null {
  if (phone === "") return null;
  if (phone.length > PHONE_MAX) return "profile.contact.errorPhone";
  if (!/^\+?[0-9 ().\-\u00a0]+$/.test(phone)) return "profile.contact.errorPhone";
  if ((phone.match(/\+/g) ?? []).length > 1) return "profile.contact.errorPhone";
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length < 7 || digits.length > 15) return "profile.contact.errorPhone";
  return null;
}

/** A shape check, not a delivery check: exactly one @, and a dot with a suffix after it. */
function emailError(email: string): ContactErrorKey | null {
  if (email === "") return null;
  if (email.length > EMAIL_MAX) return "profile.contact.errorEmail";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "profile.contact.errorEmail";
  return null;
}

function nicknameError(nickname: string): ContactErrorKey | null {
  if (nickname === "") return null;
  if (nickname.length > NICKNAME_MAX) return "profile.contact.errorNickname";
  return null;
}

/** Trim first, then check. Every field is optional: a player may clear what the club held. */
export function validateContact(input: ContactInput): ContactValidation {
  const values = normalizeContact(input);
  const errors: ContactValidation["errors"] = {};

  const phone = phoneError(values.phone);
  if (phone) errors.phone = phone;
  const email = emailError(values.email);
  if (email) errors.email = email;
  const nickname = nicknameError(values.nickname);
  if (nickname) errors.nickname = nickname;

  return { ok: Object.keys(errors).length === 0, values, errors };
}

/** True when something would actually be written. Used to skip a pointless round trip. */
export function hasContactChanges(current: ContactInput, next: ContactInput): boolean {
  const a = normalizeContact(current);
  const b = normalizeContact(next);
  return a.phone !== b.phone || a.email !== b.email || a.nickname !== b.nickname;
}

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asMembership = (value: unknown): "member" | "guest" | null =>
  value === "member" || value === "guest" ? value : null;

/**
 * The jsonb from `player_own_profile`, turned into typed values. Never throws: a missing key stays
 * null, and a row with no player id is "not linked" rather than an error.
 */
export function mapOwnProfile(raw: unknown): OwnProfile | null {
  const root = asRecord(raw);
  if (Object.keys(root).length === 0) return null;

  const player = asRecord(root.player);
  const playerId = asString(player.id);
  if (!playerId) return null;

  const contact = asRecord(root.contact);
  const handicap = asRecord(root.handicap);
  const membership = asRecord(root.membership);
  const club = asRecord(root.club);
  const photo = asRecord(root.photo);

  return {
    linked: root.linked === true || playerId !== "",
    player: {
      id: playerId,
      name: asString(player.name) ?? "",
      ngapId: asString(player.ngapId),
    },
    contact: {
      phone: asString(contact.phone) ?? asString(player.phone) ?? "",
      email: asString(contact.email) ?? asString(player.email) ?? "",
      nickname: asString(contact.nickname) ?? asString(player.nickname) ?? "",
    },
    handicap: {
      index: asNumber(handicap.index),
      effectiveDate: asString(handicap.effectiveDate),
    },
    membership: {
      type: asMembership(membership.type),
      memberNumber: asString(membership.memberNumber),
    },
    clubName: asString(club.name),
    photo: {
      private: photo.private === true,
      public: photo.public === true,
      publicConsentAt: asString(photo.publicConsentAt),
    },
  };
}

/**
 * The index the club last used for this player, from the entries they can already see. This is the
 * fallback for the record section while the migration is not applied: it is real data, date included,
 * and it says "as of" so it never claims to be today's index.
 */
export function indexFromEntries(
  entries: readonly PortalEntry[],
): { index: number; effectiveDate: string | null } | null {
  let best: { index: number; effectiveDate: string | null; date: string } | null = null;

  for (const entry of entries) {
    if (entry.frozenIndex === null) continue;
    const date = entry.dates.at(-1) ?? entry.eventDate ?? "";
    if (!best || date > best.date) {
      best = { index: entry.frozenIndex, effectiveDate: date || null, date };
    }
  }

  return best ? { index: best.index, effectiveDate: best.effectiveDate } : null;
}

/** A sample record for the demo build, where there is no database to ask. */
export const demoOwnProfile: OwnProfile = {
  linked: true,
  player: { ...SAMPLE_PLAYER },
  contact: {
    phone: "0917 123 4567",
    email: "antonio.alcantara@example.com",
    nickname: "Tony",
  },
  handicap: { index: SAMPLE_INDEX, effectiveDate: "2026-11-05" },
  membership: { type: "member", memberNumber: "M-0182" },
  clubName: "Iloilo Golf and Country Club",
  photo: { private: true, public: true, publicConsentAt: "2026-09-14" },
};
