import { type DateFormat, parseDateValue, parseDaySelection } from "./dates";
import { matchPlayer, nameKey } from "./match";
import type {
  ColumnMapping,
  ExistingPlayerRef,
  ExistingRegistrationRef,
  ImportIssue,
  NormalizedRegistrationRow,
  RowAction,
  RowDecision,
  SourceTable,
  TournamentDayRef,
} from "./types";

function clean(value: string | undefined | null): string {
  return (value ?? "")
    .toString()
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nullIfEmpty(value: string | null | undefined): string | null {
  const text = clean(value);
  return text ? text : null;
}

export function splitPersonName(full: string): {
  firstName: string | null;
  lastName: string | null;
} {
  const parts = clean(full).split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: null, lastName: parts[0] ?? null };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1] ?? null,
  };
}

export function parseMembership(value: string | null | undefined): "member" | "guest" | null {
  const key = clean(value).toLowerCase();
  if (!key) return null;
  if (["member", "m", "mem", "yes", "y", "1", "true", "club member"].includes(key)) return "member";
  if (["guest", "g", "no", "n", "0", "false", "visitor", "non member", "nonmember"].includes(key)) {
    return "guest";
  }
  return null;
}

export function parseGender(value: string | null | undefined): "M" | "F" | null {
  const key = clean(value).toLowerCase();
  if (!key) return null;
  if (["m", "male", "man", "lalaki", "boy"].includes(key)) return "M";
  if (["f", "female", "woman", "babae", "girl"].includes(key)) return "F";
  return null;
}

export function parseBoolean(value: string | null | undefined): boolean | null {
  const key = clean(value).toLowerCase();
  if (!key) return null;
  if (["yes", "y", "true", "1", "sponsored", "sponsor"].includes(key)) return true;
  if (["no", "n", "false", "0", "not sponsored", "none"].includes(key)) return false;
  return null;
}

export interface PaymentParse {
  status: "paid" | "unpaid" | "waived" | null;
  amount: number | null;
  note: string | null;
}

function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[₱$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * A paid column can be Yes/No, a status word, or an amount. Each case is named in the preview so
 * the operator can see the assumption before it is written.
 */
export function parsePayment(value: string | null | undefined): PaymentParse {
  const text = clean(value);
  if (!text) return { status: null, amount: null, note: null };
  const key = text.toLowerCase();
  if (["waived", "free", "complimentary", "sponsored"].includes(key)) {
    return { status: "waived", amount: null, note: "Read as waived." };
  }
  if (["paid", "yes", "y", "true", "1", "fully paid", "settled"].includes(key)) {
    return { status: "paid", amount: null, note: "Read as paid; no amount in the cell." };
  }
  if (["unpaid", "no", "n", "false", "0", "pending", "not paid"].includes(key)) {
    return { status: "unpaid", amount: null, note: null };
  }
  const amount = parseAmount(text);
  if (amount !== null) {
    return {
      status: amount > 0 ? "paid" : "unpaid",
      amount,
      note: "The cell is an amount, so it was read as the amount paid. Check the status.",
    };
  }
  if (/partial|down|deposit/i.test(text)) {
    return {
      status: "unpaid",
      amount: parseAmount(text.replace(/[^\d.,]/g, "")),
      note: "Read as a partial payment; status is unpaid.",
    };
  }
  return { status: null, amount: null, note: `"${text}" is not a payment status.` };
}

export function parseHandicap(value: string | null | undefined): {
  value: string | null;
  noHandicap: boolean;
} {
  const text = clean(value);
  if (!text) return { value: null, noHandicap: false };
  if (/^(nh|n\/a|na|none|no handicap|-|—)$/i.test(text)) return { value: null, noHandicap: true };
  const match = text.match(/^([+-]?)(\d{1,2}(?:\.\d{1,2})?)$/);
  if (!match) return { value: null, noHandicap: false };
  const number = Number(`${match[2]}`);
  if (!Number.isFinite(number) || number > 54) return { value: null, noHandicap: false };
  return { value: text, noHandicap: false };
}

function issue(
  row: number,
  field: ImportIssue["field"],
  severity: ImportIssue["severity"],
  message: string,
): ImportIssue {
  return { row, field, severity, message };
}

export interface NormalizeContext {
  mapping: ColumnMapping;
  fixedMembershipType: "member" | "guest" | null;
  dateFormat: DateFormat;
  days: TournamentDayRef[];
  dayRule: { required: number | null; max: number | null };
  existingPlayers: ExistingPlayerRef[];
  existingRegistrations: ExistingRegistrationRef[];
  /** Keyed by the sequential import row number returned by this function. */
  decisions?: Record<number, RowDecision>;
  /** Keyed by the sequential import row number; overrides an uncertain GAME DATES cell. */
  dayOverrides?: Record<number, number[]>;
}

interface Variant {
  name: string;
  membershipType: "member" | "guest";
  memberName: string | null;
  fromPair: boolean;
  /** True when the name came from a MEMBER/GUEST column, so its membership is already known. */
  fromNameColumn: boolean;
}

/**
 * Turns a parsed sheet into normalized rows. It expands a MEMBER + GUEST row into two players, but
 * it does not copy the member's birthdate, contact or payment onto the guest: those facts were not
 * given for the guest.
 */
export function normalizeRows(
  table: SourceTable,
  context: NormalizeContext,
): NormalizedRegistrationRow[] {
  const rows: NormalizedRegistrationRow[] = [];
  let rowNumber = 0;

  for (let index = 0; index < table.rows.length; index += 1) {
    const values = table.rows[index] ?? [];
    const raw: Record<string, string> = {};
    for (let i = 0; i < table.headers.length; i += 1) {
      raw[table.headers[i] ?? `Column ${i + 1}`] = clean(values[i]);
    }
    const sourceRow = index + 2;

    const variants: Variant[] = [];
    const memberName = context.mapping.memberName ? clean(raw[context.mapping.memberName]) : "";
    const guestName = context.mapping.guestName ? clean(raw[context.mapping.guestName]) : "";

    if (memberName || guestName) {
      if (memberName) {
        variants.push({
          name: memberName,
          membershipType: "member",
          memberName,
          fromPair: Boolean(guestName),
          fromNameColumn: true,
        });
      }
      if (guestName) {
        variants.push({
          name: guestName,
          membershipType: "guest",
          memberName: memberName || null,
          fromPair: Boolean(memberName),
          fromNameColumn: true,
        });
      }
    } else {
      const name = context.mapping.name ? clean(raw[context.mapping.name]) : "";
      const membership =
        (context.mapping.membershipType
          ? parseMembership(raw[context.mapping.membershipType])
          : null) ?? context.fixedMembershipType;
      variants.push({
        name,
        // A missing membership is reported below; this placeholder is never written.
        membershipType: membership ?? "guest",
        memberName: null,
        fromPair: false,
        fromNameColumn: false,
      });
    }

    for (const variant of variants) {
      rowNumber += 1;
      rows.push(normalizeOne(sourceRow, rowNumber, raw, variant, context));
    }
  }

  markDuplicates(rows);
  return rows;
}

function normalizeOne(
  sourceRow: number,
  row: number,
  raw: Record<string, string>,
  variant: Variant,
  context: NormalizeContext,
): NormalizedRegistrationRow {
  const { mapping } = context;
  const issues: ImportIssue[] = [];
  const get = (key: keyof ColumnMapping) =>
    mapping[key] ? (raw[mapping[key] as string] ?? "") : "";

  const name = clean(variant.name);
  if (!name) issues.push(issue(row, "name", "error", "The name is empty."));

  const suppliedMembership = mapping.membershipType ? parseMembership(get("membershipType")) : null;
  const membershipType = variant.fromNameColumn
    ? variant.membershipType
    : (suppliedMembership ?? context.fixedMembershipType);
  if (!membershipType) {
    issues.push(issue(row, "membershipType", "error", "Membership is neither member nor guest."));
  }

  const birthdateParse = mapping.birthdate
    ? parseDateValue(get("birthdate"), context.dateFormat)
    : { ok: true, value: null };
  if (!birthdateParse.ok) {
    issues.push(
      issue(row, "birthdate", "error", `${birthdateParse.message} Check the date format.`),
    );
  }
  // A GUEST column in a member-and-guest row carries the guest's name only. The birthdate and
  // gender on that row belong to the member, so they must not be attached to the guest.
  const guestFromPair = variant.fromPair && variant.membershipType === "guest";
  const birthdate = guestFromPair ? null : birthdateParse.value;

  const parsedGender = mapping.gender ? parseGender(get("gender")) : null;
  if (mapping.gender && get("gender") && !parsedGender) {
    issues.push(
      issue(
        row,
        "gender",
        "warning",
        `"${get("gender")}" is not a recognised gender; it was left empty.`,
      ),
    );
  }
  const gender = guestFromPair ? null : parsedGender;

  const ngapId = nullIfEmpty(get("ngapId"))?.toUpperCase() ?? null;
  const whsId = nullIfEmpty(get("whsId"));
  const handicap = parseHandicap(get("handicap"));
  if (get("handicap") && handicap.value === null && !handicap.noHandicap) {
    issues.push(
      issue(
        row,
        "handicap",
        "warning",
        `"${get("handicap")}" is not a readable handicap; it was left as declared text.`,
      ),
    );
  }

  const contactNumber = guestFromPair ? null : nullIfEmpty(get("contactNumber"));
  const email = guestFromPair ? null : (nullIfEmpty(get("email"))?.toLowerCase() ?? null);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    issues.push(issue(row, "email", "warning", `"${email}" does not look like an email address.`));
  }
  const homeCourse = guestFromPair ? null : nullIfEmpty(get("homeCourse"));
  const shirtSize = guestFromPair ? null : nullIfEmpty(get("shirtSize"));

  const payment = guestFromPair
    ? { status: null, amount: null, note: null }
    : parsePayment(get("paymentStatus"));
  const amountCell = guestFromPair ? "" : get("paymentAmount");
  const amountFromColumn = amountCell ? parseAmount(amountCell) : null;
  if (amountCell && amountFromColumn === null) {
    issues.push(
      issue(row, "paymentAmount", "warning", `"${amountCell}" is not a readable amount.`),
    );
  }
  const paymentAmount = payment.amount ?? amountFromColumn;
  if (payment.note) issues.push(issue(row, "paymentStatus", "info", payment.note));
  if (payment.status === "paid" && paymentAmount === null && !amountCell) {
    issues.push(
      issue(row, "paymentAmount", "warning", "Marked paid but the amount is not on file."),
    );
  }
  if (variant.fromPair && variant.membershipType === "guest") {
    issues.push(
      issue(
        row,
        "paymentStatus",
        "info",
        "The guest did not get the member's payment or shirt details.",
      ),
    );
  }

  const sponsorFromColumn = mapping.sponsor ? parseBoolean(get("sponsor")) : null;
  const sponsorDetails =
    nullIfEmpty(get("sponsorDetails")) ?? (variant.fromPair ? variant.memberName : null);
  const sponsor = sponsorFromColumn ?? (sponsorDetails ? true : null);

  const dayText = get("gameDates");
  const dayParse = parseDaySelection(dayText, context.days, context.dateFormat);
  let days = dayParse.days;
  const override = context.dayOverrides?.[row];
  if (override) days = [...new Set(override)].sort((a, b) => a - b);
  if (dayParse.note) {
    issues.push(issue(row, "gameDates", dayParse.uncertain ? "warning" : "info", dayParse.note));
  }
  for (const day of days) {
    if (!context.days.some((d) => d.dayNumber === day && d.isPlayingDay)) {
      issues.push(issue(row, "days", "error", `Day ${day} is not a playing day for this event.`));
    }
  }
  if (dayParse.uncertain && !override) {
    issues.push(
      issue(row, "days", "warning", "The day cell needs the operator to choose the days."),
    );
  }
  if (context.dayRule.required !== null && days.length !== context.dayRule.required) {
    issues.push(
      issue(
        row,
        "days",
        "error",
        `This event requires exactly ${context.dayRule.required} day(s); this row has ${days.length}.`,
      ),
    );
  }
  if (context.dayRule.max !== null && days.length > context.dayRule.max) {
    issues.push(
      issue(row, "days", "error", `This event allows at most ${context.dayRule.max} day(s).`),
    );
  }
  if (days.length === 0 && context.dayRule.required === null) {
    issues.push(
      issue(row, "days", "info", "No playing days selected. The desk can assign them later."),
    );
  }

  const match = matchPlayer(
    {
      name,
      ngapId,
      birthdate,
      contactNumber,
      email,
    },
    context.existingPlayers,
  );

  const decision = context.decisions?.[row];
  const chosenPlayerId = decision?.playerId ?? null;
  const chosenPlayer = chosenPlayerId
    ? (context.existingPlayers.find((p) => p.id === chosenPlayerId) ?? null)
    : null;
  if (decision?.action === "link" && !chosenPlayer) {
    issues.push(issue(row, "match", "error", "The chosen player is not in this club's directory."));
  }
  if (
    decision?.action === "link" &&
    chosenPlayer &&
    !match.candidates.some((c) => c.playerId === chosenPlayer.id)
  ) {
    issues.push(
      issue(
        row,
        "match",
        "error",
        "The chosen player was not one of the matches shown. Re-run the preview.",
      ),
    );
  }

  const linkPlayerId =
    chosenPlayer?.id ??
    (match.candidates.length === 1 ? (match.candidates[0]?.playerId ?? null) : null);
  const existingRegistrationId = linkPlayerId
    ? (context.existingRegistrations.find((r) => r.playerId === linkPlayerId)?.id ?? null)
    : null;

  const isNewPlayer = !linkPlayerId && decision?.action !== "link";
  if (isNewPlayer && (!birthdate || !gender)) {
    issues.push(
      issue(
        row,
        "birthdate",
        "warning",
        "No birthdate or gender on the row. The player is saved as Needs review; the desk must complete the profile before the player can be routed.",
      ),
    );
  }
  if (match.candidates.length > 1) {
    issues.push(
      issue(
        row,
        "match",
        "warning",
        `More than one player matches. Choose the right one or create a separate record.`,
      ),
    );
  }
  for (const candidate of match.candidates) {
    for (const conflict of candidate.conflicts) {
      issues.push(issue(row, "match", "warning", conflict));
    }
  }

  const hasError = issues.some((i) => i.severity === "error");
  const needsMatchDecision = match.recommendation === "review" && !decision;
  const needsDayDecision = dayParse.uncertain && !override;
  const requiresDecision = !hasError && (needsMatchDecision || needsDayDecision);

  let action: RowAction;
  if (decision?.action === "skip") action = "skip";
  else if (decision?.action === "update") action = existingRegistrationId ? "update" : "reject";
  else if (hasError) action = "reject";
  else if (requiresDecision) action = "reject";
  else if (existingRegistrationId) action = "skip";
  else action = "insert";

  if (decision?.action === "update" && !existingRegistrationId) {
    issues.push(
      issue(row, "match", "error", "There is no registration for this player in this event."),
    );
  }
  if (decision?.action === "create" && match.candidates.length > 0) {
    issues.push(
      issue(
        row,
        "match",
        "info",
        "You chose to create a separate player even though a name match exists.",
      ),
    );
  }

  const forceNew = decision?.action === "create";
  const firstName = guestFromPair ? null : nullIfEmpty(get("firstName"));
  const lastName = guestFromPair ? null : nullIfEmpty(get("lastName"));
  const declaredHandicap = nullIfEmpty(get("handicap"));
  const notes = nullIfEmpty(get("notes"));
  const teeTimeNote = guestFromPair ? null : nullIfEmpty(get("teeTimePreference"));

  return {
    row,
    sourceRow,
    raw,
    name,
    firstName,
    lastName,
    membershipType,
    gender,
    birthdate,
    ngapId,
    whsId,
    declaredHandicap,
    contactNumber,
    email,
    homeCourse,
    shirtSize,
    paymentStatus: payment.status,
    paymentAmount,
    paymentReference: guestFromPair ? null : nullIfEmpty(get("paymentReference")),
    sponsor,
    sponsorDetails,
    days,
    dayNote: dayParse.note,
    teeTimeNote,
    notes,
    forceNew,
    linkPlayerId,
    match,
    existingRegistrationId,
    action,
    issues,
    requiresDecision,
  };
}

/**
 * Flags a player who appears more than once in the file. It does not merge the rows: two rows with
 * different days may be a legitimate correction or a duplicate, and only the operator knows which.
 */
function markDuplicates(rows: NormalizedRegistrationRow[]): void {
  const groups = new Map<string, NormalizedRegistrationRow[]>();
  for (const row of rows) {
    if (!row.name) continue;
    const key = row.ngapId ? `ngap:${row.ngapId}` : `name:${nameKey(row.name)}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    for (const row of list.slice(1)) {
      row.issues.push(
        issue(
          row.row,
          "file",
          "warning",
          `${row.name} appears more than once in this file. Keep one row, or choose which days belong to each.`,
        ),
      );
      if (row.action !== "reject") row.requiresDecision = true;
    }
  }
}
