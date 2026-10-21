import {
  CANONICAL_FIELDS,
  type CanonicalField,
  type ColumnMapping,
  type MappingKey,
  type MappingSuggestion,
  SOURCE_SLOTS,
} from "./types";

/** A header as the club wrote it, reduced to the words that identify it. */
export function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIASES: Record<CanonicalField, string[]> = {
  name: [
    "name",
    "player name",
    "full name",
    "fullname",
    "golfer",
    "golfer name",
    "participant",
    "participant name",
    "player",
  ],
  firstName: ["first name", "firstname", "given name", "given names"],
  lastName: ["last name", "lastname", "surname", "family name"],
  membershipType: [
    "membership",
    "membership type",
    "member type",
    "player type",
    "classification",
    "category type",
  ],
  gender: ["gender", "sex"],
  birthdate: ["birthdate", "birth date", "date of birth", "dob", "born"],
  ngapId: ["ngap id", "ngap no", "ngap number", "ngap", "handicap id", "ngap card"],
  whsId: ["whs id", "whs number", "whs no", "whs", "golf id", "world handicap id"],
  handicap: [
    "handicap index",
    "handicap",
    "index",
    "hcp",
    "whs handicap",
    "playing handicap",
    "course handicap",
  ],
  contactNumber: [
    "contact no",
    "contact number",
    "contact",
    "mobile",
    "mobile no",
    "mobile number",
    "phone",
    "phone number",
    "cellphone",
    "cell no",
    "cp",
    "tel",
  ],
  email: ["email", "e mail", "email address", "mail"],
  homeCourse: ["home course", "home club", "club", "club name"],
  shirtSize: ["shirt size", "shirt", "t shirt size", "tshirt size", "t shirt", "tshirt", "size"],
  paymentStatus: ["paid", "payment status", "payment", "status", "paid status"],
  paymentAmount: ["amount", "amount paid", "payment amount", "fee", "entry fee", "total"],
  paymentReference: [
    "reference",
    "reference no",
    "or number",
    "receipt",
    "receipt no",
    "transaction",
  ],
  sponsor: ["sponsor", "sponsored", "is sponsored", "sponsor question"],
  sponsorDetails: ["sponsor name", "sponsored by", "sponsor details", "guest of"],
  gameDates: [
    "game dates",
    "game date",
    "playing days",
    "playing day",
    "play dates",
    "play date",
    "dates",
    "schedule",
    "days",
  ],
  teeTimePreference: ["tee time", "tee times", "preferred tee time", "preferred time", "time"],
  notes: ["notes", "note", "remarks", "remark", "comment", "comments"],
};

const NAME_VALUES = new Set([
  "m",
  "f",
  "member",
  "guest",
  "yes",
  "no",
  "y",
  "n",
  "1",
  "0",
  "male",
  "female",
]);

function headerLookup(headers: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const header of headers) {
    const key = normalizeHeader(header);
    if (key && !map.has(key)) map.set(key, header);
  }
  return map;
}

function findHeader(
  lookup: Map<string, string>,
  key: string,
  used: Set<string>,
): { header: string; score: number; reason: string } | null {
  const candidates: Array<{ header: string; score: number; reason: string }> = [];
  for (const [normalized, original] of lookup) {
    if (used.has(original)) continue;
    if (normalized === key)
      candidates.push({ header: original, score: 1, reason: `Header is "${original}".` });
    else if (normalized.includes(key))
      candidates.push({
        header: original,
        score: 0.8,
        reason: `Header "${original}" contains "${key}".`,
      });
  }
  candidates.sort((a, b) => b.score - a.score || a.header.length - b.header.length);
  return candidates[0] ?? null;
}

function valuesLookLikeNames(values: string[]): boolean {
  const present = values.map((v) => v.trim()).filter(Boolean);
  if (!present.length) return true;
  const nonNames = present.filter((v) => {
    const key = v.toLowerCase();
    return NAME_VALUES.has(key) || /^\d+(\.\d+)?$/.test(key);
  });
  return nonNames.length / present.length < 0.6;
}

export interface SuggestOptions {
  /** Up to a few values per header, used only to tell a name column from a Yes/No column. */
  samples?: Record<string, string[]>;
}

/**
 * Deterministic first pass. It is the default because the club's formats repeat; the AI is only
 * asked when these rules leave something important unmapped.
 */
export function suggestMapping(headers: string[], options: SuggestOptions = {}): MappingSuggestion {
  const lookup = headerLookup(headers);
  const used = new Set<string>();
  const mapping: ColumnMapping = {};
  const confidence: Partial<Record<MappingKey, number>> = {};
  const reasons: Partial<Record<MappingKey, string>> = {};
  const notes: string[] = [];
  let fixedMembershipType: "member" | "guest" | null = null;

  const memberHeader = lookup.get("member") ?? lookup.get("member name") ?? lookup.get("members");
  const guestHeader = lookup.get("guest") ?? lookup.get("guest name") ?? lookup.get("guests");
  const memberValues = memberHeader ? (options.samples?.[memberHeader] ?? []) : [];
  const guestValues = guestHeader ? (options.samples?.[guestHeader] ?? []) : [];

  if (memberHeader && valuesLookLikeNames(memberValues)) {
    mapping.memberName = memberHeader;
    confidence.memberName = 0.9;
    reasons.memberName = `"${memberHeader}" holds member names.`;
    used.add(memberHeader);
    if (!guestHeader) fixedMembershipType = "member";
  }
  if (guestHeader && valuesLookLikeNames(guestValues)) {
    mapping.guestName = guestHeader;
    confidence.guestName = 0.85;
    reasons.guestName = `"${guestHeader}" holds guest names.`;
    used.add(guestHeader);
    if (!memberHeader) fixedMembershipType = "guest";
  }

  // A "MEMBER" column whose values are not names is probably the classification itself.
  if (memberHeader && !mapping.memberName) {
    mapping.membershipType = memberHeader;
    confidence.membershipType = 0.7;
    reasons.membershipType = `"${memberHeader}" looks like a member/guest classification.`;
    used.add(memberHeader);
  }

  // A combined "WHS ID / HANDICAP" column holds a handicap value in the club's workbook, so it is
  // mapped to the handicap field rather than the identifier field.
  for (const [normalized, original] of lookup) {
    if (used.has(original)) continue;
    if (/(whs|world handicap)/.test(normalized) && /(handicap|index)/.test(normalized)) {
      mapping.handicap = original;
      confidence.handicap = 0.85;
      reasons.handicap = `"${original}" combines WHS and handicap; the values decide the handicap.`;
      used.add(original);
      break;
    }
  }

  for (const field of CANONICAL_FIELDS) {
    if (mapping[field]) continue;
    const aliases = ALIASES[field];
    let best: { header: string; score: number; reason: string } | null = null;
    for (const alias of aliases) {
      const found = findHeader(lookup, alias, used);
      if (found && (!best || found.score > best.score)) best = found;
    }
    if (!best) continue;
    mapping[field] = best.header;
    confidence[field] = best.score;
    reasons[field] = best.reason;
    used.add(best.header);
  }

  if (!mapping.name && (mapping.memberName || mapping.guestName)) {
    notes.push(
      mapping.memberName && mapping.guestName
        ? "Every row with both a member and a guest becomes two registrations."
        : "Every row is a single player; the membership type comes from the column that was found.",
    );
  }
  if (mapping.paymentStatus && mapping.paymentAmount) {
    notes.push(
      "The paid column is treated as status and the amount column as the amount. Both are shown before commit.",
    );
  }
  if (!mapping.gameDates) {
    notes.push("No game-dates column was found. The operator must choose each player's days.");
  }
  if (!mapping.birthdate || !mapping.gender) {
    notes.push(
      "A new player needs a birthdate and a gender. Rows missing either are rejected, not guessed.",
    );
  }

  return {
    mapping,
    confidence,
    reasons,
    unmappedHeaders: headers.filter((h) => !used.has(h)),
    fixedMembershipType,
    source: "deterministic",
    notes,
  };
}

export interface MappingValidation {
  ok: boolean;
  errors: string[];
  mapping: ColumnMapping;
  fixedMembershipType: "member" | "guest" | null;
}

/** Confirms every mapped source exists in the sheet and every key is one we know. */
export function validateMapping(
  value: unknown,
  headers: string[],
  fixedMembershipType: unknown = null,
): MappingValidation {
  const errors: string[] = [];
  const mapping: ColumnMapping = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      ok: false,
      errors: ["The mapping is not an object."],
      mapping,
      fixedMembershipType: null,
    };
  }
  const lookup = headerLookup(headers);
  const byOriginal = new Map(headers.map((h) => [h, h]));
  const allowed = new Set<string>([...CANONICAL_FIELDS, ...SOURCE_SLOTS]);

  for (const [key, source] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(key)) {
      errors.push(`Unknown mapping field "${key}".`);
      continue;
    }
    if (source === null || source === "") {
      mapping[key as MappingKey] = null;
      continue;
    }
    if (typeof source !== "string") {
      errors.push(`The source for "${key}" is not a column name.`);
      continue;
    }
    const original = byOriginal.get(source) ?? lookup.get(normalizeHeader(source));
    if (!original) {
      errors.push(`Column "${source}" is not in this sheet.`);
      continue;
    }
    mapping[key as MappingKey] = original;
  }

  if (!mapping.name && !mapping.memberName && !mapping.guestName) {
    errors.push("Map a player-name column (or both MEMBER and GUEST columns).");
  }
  if (
    !mapping.membershipType &&
    fixedMembershipType !== "member" &&
    fixedMembershipType !== "guest"
  ) {
    errors.push("Map a member/guest column, or choose one membership type for the whole file.");
  }

  return {
    ok: errors.length === 0,
    errors,
    mapping,
    fixedMembershipType:
      fixedMembershipType === "member" || fixedMembershipType === "guest"
        ? fixedMembershipType
        : null,
  };
}

export interface AiMappingResult {
  ok: boolean;
  error?: string;
  suggestion?: MappingSuggestion;
}

/**
 * Accepts an AI proposal only after checking its shape, its keys and its column names. Anything
 * else is rejected whole; a partly valid AI answer is not worth the risk of a mis-mapped column.
 */
export function parseAiMapping(value: unknown, headers: string[]): AiMappingResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "The AI answer is not an object." };
  }
  const raw = value as Record<string, unknown>;
  const allowedTop = new Set([
    "mapping",
    "confidence",
    "reasons",
    "fixedMembershipType",
    "notes",
    "unmappedHeaders",
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowedTop.has(key))
      return { ok: false, error: `The AI answer contains an unexpected field "${key}".` };
  }
  const validated = validateMapping(raw.mapping, headers, raw.fixedMembershipType);
  if (!validated.ok) return { ok: false, error: validated.errors.join(" ") };

  const confidence: Partial<Record<MappingKey, number>> = {};
  if (raw.confidence && typeof raw.confidence === "object" && !Array.isArray(raw.confidence)) {
    for (const [key, value] of Object.entries(raw.confidence as Record<string, unknown>)) {
      if (!(key in validated.mapping)) continue;
      if (typeof value === "number" && value >= 0 && value <= 1)
        confidence[key as MappingKey] = value;
    }
  }
  const reasons: Partial<Record<MappingKey, string>> = {};
  if (raw.reasons && typeof raw.reasons === "object" && !Array.isArray(raw.reasons)) {
    for (const [key, value] of Object.entries(raw.reasons as Record<string, unknown>)) {
      if (!(key in validated.mapping)) continue;
      if (typeof value === "string") reasons[key as MappingKey] = value.slice(0, 300);
    }
  }
  const notes = Array.isArray(raw.notes)
    ? raw.notes.filter((n): n is string => typeof n === "string").slice(0, 10)
    : [];

  return {
    ok: true,
    suggestion: {
      mapping: validated.mapping,
      confidence,
      reasons,
      unmappedHeaders: headers.filter(
        (h) => !Object.values(validated.mapping).filter(Boolean).includes(h),
      ),
      fixedMembershipType: validated.fixedMembershipType,
      source: "ai",
      notes,
    },
  };
}

/** True when the preview can be built; it may still contain per-row errors. */
export function mappingIsUsable(mapping: ColumnMapping): boolean {
  return Boolean(mapping.name || mapping.memberName || mapping.guestName);
}

/** The allowed field names, for the system prompt that is sent to the optional AI endpoint. */
export function canonicalFieldListForPrompt(): string[] {
  return [...CANONICAL_FIELDS];
}
