import type {
  ExistingPlayerRef,
  MatchResult,
  PlayerMatchCandidate,
  TournamentDayRef,
} from "./types";

/** A name comparison that ignores case, spacing and punctuation, but not word order. */
export function nameKey(name: string): string {
  return name
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/[^\d]/g, "");
}

export interface MatchInput {
  name: string;
  ngapId: string | null;
  birthdate: string | null;
  contactNumber: string | null;
  email: string | null;
}

/**
 * Finds the players a row could mean. It never chooses between two people: more than one candidate
 * is a question for the operator, and a conflict is a hard stop until it is answered.
 */
export function matchPlayer(input: MatchInput, existing: ExistingPlayerRef[]): MatchResult {
  const key = nameKey(input.name);
  const ngap = input.ngapId?.trim().toUpperCase() ?? "";
  const byId = ngap ? existing.filter((p) => (p.ngapId ?? "").trim().toUpperCase() === ngap) : [];
  const byName = existing.filter((p) => nameKey(p.name) === key);
  const ids = [...new Set([...byId.map((p) => p.id), ...byName.map((p) => p.id)])];

  const candidates: PlayerMatchCandidate[] = ids.flatMap((id) => {
    const player = existing.find((p) => p.id === id);
    if (!player) return [];
    const viaId = byId.some((p) => p.id === id);
    const viaName = byName.some((p) => p.id === id);
    const signals: string[] = [];
    const warnings: string[] = [];
    const conflicts: string[] = [];

    if (viaId) signals.push(`NGAP ID ${input.ngapId} is on this record`);
    if (viaName) signals.push(`Name matches "${player.name}"`);
    if (input.birthdate && player.birthdate) {
      if (input.birthdate === player.birthdate)
        signals.push(`Birthdate matches (${input.birthdate})`);
      else
        conflicts.push(
          `Birthdate on file is ${player.birthdate} but the file says ${input.birthdate}.`,
        );
    }
    if (input.contactNumber && player.contactNumber) {
      const a = digits(input.contactNumber);
      const b = digits(player.contactNumber);
      if (a.length >= 7 && a === b) signals.push("Contact number matches");
    }
    if (input.email && player.email) {
      if (input.email.trim().toLowerCase() === player.email.trim().toLowerCase()) {
        signals.push("Email matches");
      }
    }
    if (viaId && !viaName) {
      warnings.push(
        `NGAP ID ${input.ngapId} belongs to "${player.name}" here but "${input.name}" in the file.`,
      );
    }
    if (!viaId && ngap && player.ngapId) {
      conflicts.push(`The file says NGAP ID ${input.ngapId} but this player has ${player.ngapId}.`);
    }

    const confidence: PlayerMatchCandidate["confidence"] = viaId
      ? conflicts.length > 0
        ? "strong"
        : "exact"
      : conflicts.length > 0
        ? "weak"
        : "strong";

    return [
      {
        playerId: player.id,
        name: player.name,
        ngapId: player.ngapId,
        birthdate: player.birthdate,
        confidence,
        signals,
        warnings,
        conflicts,
      },
    ];
  });

  const recommendation: MatchResult["recommendation"] =
    candidates.length === 0
      ? "create"
      : candidates.length === 1 && candidates.every((c) => c.conflicts.length === 0)
        ? "link"
        : "review";

  return {
    candidates,
    recommendation,
    matchedBy: candidates.length === 0 ? "none" : byId.length > 0 ? "ngap_id" : "name",
  };
}

/** True when every candidate has a hard conflict or there is more than one. */
export function matchNeedsDecision(match: MatchResult): boolean {
  return match.recommendation === "review";
}

/** Explains a day number in the operator's words, for the preview and the issues list. */
export function dayLabel(day: number, days: TournamentDayRef[]): string {
  const found = days.find((d) => d.dayNumber === day);
  return found ? `${found.label} (${found.playDate})` : `Day ${day}`;
}
