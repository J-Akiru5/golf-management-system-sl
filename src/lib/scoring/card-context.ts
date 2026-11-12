import { fmtHcp } from "@/lib/format";

export interface CardContextInput {
  dayNumber?: number | null;
  markerName?: string | null;
  playingHandicap?: number | null;
  /** The number written in the card's HDCP box. For comparison only. */
  cardHandicap?: number | null;
  className?: string | null;
  partnerName?: string | null;
  teamHandicap?: number | null;
  teeName?: string | null;
  groupLabel?: string | null;
}

export type CardContextTone = "normal" | "missing";

export interface CardContextPart {
  key:
    | "day"
    | "marker"
    | "class"
    | "partner"
    | "teamHandicap"
    | "tee"
    | "group"
    | "playingHandicap"
    | "cardHandicap";
  label: string;
  value: string;
  tone: CardContextTone;
}

/** Whole numbers print as written; anything else keeps one decimal. Plus handicaps read as "+2". */
function fmtNumber(value: number): string {
  if (Number.isInteger(value)) return fmtHcp(value);
  const magnitude = Math.abs(value).toFixed(1);
  return value < 0 ? `+${magnitude}` : magnitude;
}

function asNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value;
}

function asText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The value of the class part. Stored class names already carry the word "Class" ("Class A") and
 * the part has its own label, so that leading word is dropped: the desk reads "Class A", not
 * "Class Class A". The word must stand alone before a space, so "Classic" is left as it is, and a
 * name that does not start with it is shown as stored.
 */
function asClassName(value: string | null | undefined): string | null {
  const name = asText(value);
  if (name === null) return null;
  const withoutWord = name.replace(/^class\s+/i, "").trim();
  return withoutWord === "" ? name : withoutWord;
}

/**
 * The facts shown beside a desk scorecard, in the order the desk reads them. Values are shown as
 * passed and never worked out here: the class bands and team handicap rules are tournament
 * settings, not this module's business.
 *
 * `undefined` means the caller does not have that fact at all, so the part is left out. `null` or a
 * blank string means the caller looked and there is none, so a class, partner or playing handicap
 * is kept in the line with words; the desk has to see that it is missing.
 */
export function buildCardContext(input: CardContextInput): CardContextPart[] {
  const parts: CardContextPart[] = [];

  const day = asNumber(input.dayNumber);
  if (day !== null) {
    parts.push({ key: "day", label: "Day", value: fmtNumber(day), tone: "normal" });
  }

  const marker = asText(input.markerName);
  if (marker !== null) {
    parts.push({ key: "marker", label: "Marker", value: marker, tone: "normal" });
  }

  if (input.className !== undefined) {
    const className = asClassName(input.className);
    parts.push({
      key: "class",
      label: "Class",
      value: className ?? "Not set",
      tone: className === null ? "missing" : "normal",
    });
  }

  if (input.partnerName !== undefined) {
    const partner = asText(input.partnerName);
    parts.push({
      key: "partner",
      label: "Partner",
      value: partner ?? "None on file",
      tone: partner === null ? "missing" : "normal",
    });
  }

  const teamHandicap = asNumber(input.teamHandicap);
  if (teamHandicap !== null) {
    parts.push({
      key: "teamHandicap",
      label: "Team handicap",
      value: fmtNumber(teamHandicap),
      tone: "normal",
    });
  }

  const tee = asText(input.teeName);
  if (tee !== null) {
    parts.push({ key: "tee", label: "Tee", value: tee, tone: "normal" });
  }

  const group = asText(input.groupLabel);
  if (group !== null) {
    parts.push({ key: "group", label: "Group", value: group, tone: "normal" });
  }

  const playingHandicap = asNumber(input.playingHandicap);
  if (input.playingHandicap !== undefined) {
    parts.push({
      key: "playingHandicap",
      label: "Playing handicap",
      value: playingHandicap === null ? "Not calculated" : fmtNumber(playingHandicap),
      tone: playingHandicap === null ? "missing" : "normal",
    });
  }

  const cardHandicap = asNumber(input.cardHandicap);
  if (cardHandicap !== null && cardHandicap !== playingHandicap) {
    parts.push({
      key: "cardHandicap",
      label: "Card HDCP",
      value: fmtNumber(cardHandicap),
      tone: "normal",
    });
  }

  return parts;
}
