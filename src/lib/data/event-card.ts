import type { ScoringRoundView, SubmitCardInput } from "@/lib/data/scoring";
import { type EventCardPlan, planEventCardSave } from "@/lib/scoring/event-card";
import type { Scorecard } from "@/lib/scoring/types";

/**
 * Saving a desk-checked card under an event's rules, as one operation.
 *
 * The demo and the connected repository both use this, so the order of steps and the refusals are
 * the same in both. Only the three writes differ, and they are handed in.
 *
 * Order matters. A handicap snapshot is frozen once the round starts scoring and approving the first
 * card starts it, so the WHS handicap snapshot is written first, then the card, then the approval.
 */

export interface SaveEventCardInput {
  playerId: string;
  /** Who marked the card, when the desk knows. Left out, a stable placeholder marker is used. */
  scorerId?: string | null;
  entries: Scorecard["entries"];
  /** The HDCP box as typed. A note only: the playing handicap comes from the index and the tee. */
  cardHandicap: string | null;
  writtenTotal: number | null;
  captureKey: string;
  /** True when the desk has checked the card, so it is approved as well as saved. */
  approve: boolean;
  /** A correction's reason. It is written to the audit with the new revision. */
  reason?: string;
  /** Defaults to a card typed by hand. */
  source?: SubmitCardInput["source"];
  image?: SubmitCardInput["image"];
  extraction?: SubmitCardInput["extraction"];
}

export type EventCardOutcome = "approved" | "saved" | "already_in";

export interface SaveEventCardResult {
  view: ScoringRoundView;
  outcome: EventCardOutcome;
  /**
   * The HDCP box beside the WHS number when the two differ, for example
   * "card says 22, plays off 19 (index 16.4, White)". Null when the box agrees or is blank.
   */
  cardNote: string | null;
}

type OkPlan = Extract<EventCardPlan, { ok: true }>;

export interface SaveEventCardDeps {
  /** The round as it stands now. */
  load(): Promise<ScoringRoundView>;
  /**
   * Stores the handicap snapshot for this player before scoring starts. The plan carries the WHS
   * playing handicap to store: nothing here reads the card's HDCP box.
   */
  writeSnapshot(plan: OkPlan, view: ScoringRoundView): Promise<void>;
  submit(input: SubmitCardInput): Promise<ScoringRoundView>;
  approve(cardId: string, reason: string): Promise<ScoringRoundView>;
  /** ISO date for the in-memory snapshot. */
  today(): string;
}

const ACTIVE = new Set<Scorecard["status"]>(["submitted", "in_review", "approved"]);

export async function saveEventCardFlow(
  deps: SaveEventCardDeps,
  input: SaveEventCardInput,
): Promise<SaveEventCardResult> {
  const before = await deps.load();
  const plan = planEventCardSave({
    rulesVersion: before.rulesVersion,
    roundStatus: before.roundStatus,
    requiredCards: before.requiredCards,
    tee: before.course.tee,
    effectiveDate: deps.today(),
    playerId: input.playerId,
    scorerId: input.scorerId,
    cardHandicap: input.cardHandicap,
    players: before.players.map((player) => ({
      playerId: player.playerId,
      playerName: player.playerName,
      handicap: player.handicap,
      frozenIndex: player.frozenIndex,
      tee: player.tee,
    })),
    cards: before.cards,
  });
  if (!plan.ok) throw new Error(plan.message);

  if (plan.needsSnapshotWrite) await deps.writeSnapshot(plan, before);

  const submitted = await deps.submit({
    playerId: input.playerId,
    scorerId: plan.marker.playerId,
    source: input.source ?? "manual",
    entries: input.entries,
    writtenTotal: input.writtenTotal,
    captureKey: input.captureKey,
    reason: input.reason,
    image: input.image,
    extraction: input.extraction,
  });

  const known = new Set(before.cards.map((card) => card.id));
  const card = submitted.cards
    .filter(
      (candidate) =>
        candidate.playerId === input.playerId &&
        candidate.scorerId === plan.marker.playerId &&
        ACTIVE.has(candidate.status),
    )
    .sort((left, right) => right.revision - left.revision)[0];
  if (!card) {
    throw new Error("The card was sent, but it could not be found afterwards. Reload the screen.");
  }
  const isNew = !known.has(card.id);

  // A card that is already approved is the same card coming in again; there is nothing to do.
  if (card.status === "approved") {
    return { view: submitted, outcome: "already_in", cardNote: plan.cardNote };
  }
  if (!input.approve) {
    return {
      view: submitted,
      outcome: isNew ? "saved" : "already_in",
      cardNote: plan.cardNote,
    };
  }
  const approved = await deps.approve(card.id, plan.auditReason);
  return { view: approved, outcome: "approved", cardNote: plan.cardNote };
}
