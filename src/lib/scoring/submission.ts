/**
 * Guards against the same card being recorded twice.
 *
 * A scorecard can arrive twice in several ordinary ways: a double tap, a retry after a request that
 * actually succeeded, the same photo scanned twice, or the desk and a phone submitting the same card
 * at once. The capture key stops a repeated request for the *same* submission at the database, but a
 * second tap in the browser creates a new request with a new key. So the screens ask one shared,
 * pure question before they write, and the repositories ask it again before they insert.
 *
 * Nothing here decides a score. It only recognises that the card in hand is already in.
 */
import type { Scorecard } from "./types";
import { DEFAULT_STROKE_LIMITS } from "./validation";

/** Cards that still count. A superseded, rejected or revoked card is not evidence. */
const ACTIVE_STATUSES: ReadonlySet<Scorecard["status"]> = new Set([
  "submitted",
  "in_review",
  "approved",
]);

export interface CardValue {
  hole: number;
  strokes: number | null;
}

/** A stable fingerprint of the 18 cells, independent of the order the entries arrived in. */
export function cardSignature(entries: readonly CardValue[]): string {
  return [...entries]
    .sort((left, right) => left.hole - right.hole)
    .map((entry) => `${entry.hole}:${entry.strokes ?? ""}`)
    .join("|");
}

export type DuplicateVerdict =
  | { kind: "new" }
  | { kind: "repeat"; message: string }
  | { kind: "same_photo"; message: string }
  | { kind: "needs_correction"; message: string };

export interface DuplicateInput {
  cards: readonly Scorecard[];
  playerId: string;
  scorerId: string;
  entries: readonly CardValue[];
  playerName?: string | null;
  /** The SHA-256 of the photo attached to this submission, when there is one. */
  imageSha256?: string | null;
  /** The desk is correcting an existing card, so a second revision is expected and intended. */
  correcting?: boolean;
}

function nameOf(input: DuplicateInput): string {
  const name = input.playerName?.trim();
  return name && name.length > 0 ? name : "this player";
}

/**
 * Decides whether this card may be written.
 *
 * - An identical card already in from the same marker is a repeat, never a second revision.
 * - The same photo already attached to a card for the same player is a repeat.
 * - A different set of scores from the same marker is a correction, and a correction needs the
 *   desk's Edit path and a reason; the plain submit is refused in plain words.
 * - A card from a different marker with the same scores is allowed: that is how the second
 *   independent card agrees with the first.
 */
export function checkCardSubmission(input: DuplicateInput): DuplicateVerdict {
  const name = nameOf(input);
  const playerCards = input.cards.filter(
    (card) =>
      card.status !== "superseded" && card.status !== "rejected" && card.status !== "revoked",
  );
  const playerActive = playerCards.filter((card) => ACTIVE_STATUSES.has(card.status));
  const sameMarker = playerActive
    .filter((card) => card.playerId === input.playerId && card.scorerId === input.scorerId)
    .sort((left, right) => left.revision - right.revision);
  const latest = sameMarker.at(-1) ?? null;
  const signature = cardSignature(input.entries);

  if (latest && cardSignature(latest.entries) === signature) {
    return input.correcting
      ? {
          kind: "repeat",
          message: `Nothing changed on ${name}'s card, so no new revision was saved.`,
        }
      : { kind: "repeat", message: `This card is already in for ${name}. It was not sent again.` };
  }

  if (input.correcting) return { kind: "new" };

  const sha = input.imageSha256?.trim();
  if (sha) {
    const samePhoto = playerActive.some(
      (card) => card.playerId === input.playerId && card.imageSha256 === sha,
    );
    if (samePhoto) {
      return {
        kind: "same_photo",
        message: `That photo is already attached to ${name}'s card. It was not sent again.`,
      };
    }
  }

  if (latest) {
    return {
      kind: "needs_correction",
      message: `${name}'s card from this marker is already in with different scores. Use Edit on that card to correct it, or choose another marker.`,
    };
  }

  return { kind: "new" };
}

/**
 * A synchronous in-flight guard.
 *
 * React state only disables a button after the next render, which is long after a double tap has
 * queued its second click. A ref-like gate answers on the same tick. `tryEnter` returns false while
 * a request is in flight, so the second tap never reaches the repository.
 */
export interface SubmitGate {
  /** True when this call took the gate. False when a request is already running. */
  tryEnter(): boolean;
  leave(): void;
  readonly busy: boolean;
}

export function createSubmitGate(): SubmitGate {
  let running = false;
  return {
    tryEnter() {
      if (running) return false;
      running = true;
      return true;
    },
    leave() {
      running = false;
    },
    get busy() {
      return running;
    },
  };
}

/**
 * Reads the eighteen cells of a card form without guessing.
 *
 * An empty cell is a problem, not a zero and not a par. A cell outside the stroke limits is a
 * problem too, because the browser's `min`/`max` attributes do not stop a typed value.
 */
export function readCardValues(
  holes: readonly { number: number }[],
  values: Readonly<Record<number, string>>,
): { entries: CardValue[]; problems: string[] } {
  const entries: CardValue[] = [];
  const problems: string[] = [];
  for (const hole of holes) {
    const raw = (values[hole.number] ?? "").trim();
    if (raw === "") {
      problems.push(`Hole ${hole.number} is empty. Type the score from the card.`);
      entries.push({ hole: hole.number, strokes: null });
      continue;
    }
    const strokes = Number(raw);
    if (
      !Number.isInteger(strokes) ||
      strokes < DEFAULT_STROKE_LIMITS.min ||
      strokes > DEFAULT_STROKE_LIMITS.max
    ) {
      problems.push(
        `Hole ${hole.number} needs a whole number between ${DEFAULT_STROKE_LIMITS.min} and ${DEFAULT_STROKE_LIMITS.max}.`,
      );
      entries.push({ hole: hole.number, strokes: null });
      continue;
    }
    entries.push({ hole: hole.number, strokes });
  }
  return { entries, problems };
}
