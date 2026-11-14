import {
  type SaveEventCardInput,
  type SaveEventCardResult,
  saveEventCardFlow,
} from "@/lib/data/event-card";
import {
  assessOpenRound,
  OPEN_ROUND_MESSAGES,
  type OpenRoundSettingsInput,
  type OpenRoundSnapshot,
  type TieBreakPolicyOption,
} from "@/lib/data/open-round";
import type { FinalizationAuthority } from "@/lib/scoring";
import {
  buildStandings,
  type CanonicalRound,
  calculateHandicap,
  checkFinalization,
  DEFAULT_STROKE_LIMITS,
  deriveCanonicalHoleScores,
  type FinalizationReadiness,
  type HandicapSnapshot,
  isIsoDate,
  type Resolution,
  type RoundCourse,
  type Scorecard,
  type StandingsResult,
  type StrokeLimits,
  type TeeRatings,
  type TieBreakPolicy,
  type VerificationPolicy,
  validateScorecard,
} from "@/lib/scoring";
import { CORRECTED_HANDICAP_SOURCE } from "@/lib/scoring/event-rules";
import { checkCardSubmission } from "@/lib/scoring/submission";

export type ScoringRoundStatus = "draft" | "open" | "scoring" | "provisional" | "final";

export interface ScoringPlayerSeed {
  registrationId: string;
  /** The per-day entry, when the connected repository has one. The demo does not need it. */
  roundEntryId?: string;
  playerId: string;
  playerName: string;
  flightId: string | null;
  /**
   * The name of the class the entry was drawn into. `undefined` means the connected repository did
   * not look it up (the demo); `null` means it looked and the player has no class.
   */
  flightName?: string | null;
  handicap: HandicapSnapshot | null;
  /**
   * The registration's frozen index, loaded beside the round snapshot so the desk can compare the
   * two. Optional: a view that has not loaded it leaves the mismatch check silent rather than
   * claiming a difference.
   */
  frozenIndex?: number | null;
  /**
   * The ratings of the tee on the player's registration, loaded so the WHS playing handicap can be
   * worked out from the index and that tee. Optional: a view that has not loaded it leaves it
   * undefined and the round's tee is used. Null means the registration has no tee, which stops a
   * card from being saved with a guessed handicap.
   */
  tee?: TeeRatings | null;
}

export interface ScoringPlayer extends ScoringPlayerSeed {
  canonical: CanonicalRound;
}

export interface ScoringPublication {
  version: number;
  state: "provisional" | "final";
  publishedAt: string;
}

export interface ScoringRoundSeed {
  roundId: string;
  tournamentId: string;
  /** The playing day. The demo defaults to day 1. */
  dayNumber?: number;
  /** The round's own stroke range. The demo defaults to 1-20. */
  strokeLimits?: StrokeLimits;
  course: RoundCourse;
  policy: VerificationPolicy;
  players: readonly ScoringPlayerSeed[];
  cards?: readonly Scorecard[];
  resolutions?: readonly Resolution[];
  tieBreak?: TieBreakPolicy | null;
  approvedBy?: string | null;
  finalizationAuthority?: FinalizationAuthority | null;
  roundStatus?: ScoringRoundStatus;
  provisionalPublication?: boolean;
  /** The rules version stored on the round. The demo does not need one to score. */
  rulesVersion?: string | null;
  /**
   * The event's maximum index. A corrected index is capped at it the way `save_handicap_snapshot`
   * does. Left out or null, the demo applies no cap.
   */
  maxIndex?: number | null;
  /**
   * The published draw the demo can open a round from. When left out, the demo treats one group
   * holding every seeded player as published at revision 1.
   */
  draw?: ScoringDrawSeed;
}

export interface ScoringDrawSeed {
  revision: number;
  published: boolean;
  groups: readonly { number: number; playerIds: readonly string[] }[];
  /** The live board, when it differs from the published one. Defaults to `groups`. */
  liveGroups?: readonly { number: number; playerIds: readonly string[] }[];
  /** False models a publish from before player ids were stored. */
  hasPlayerIds?: boolean;
}

export interface ScoringRoundView {
  roundId: string;
  tournamentId: string;
  /** The playing day this round belongs to. */
  dayNumber: number;
  /** The round's own stroke range, which can be narrower than the engine default. */
  strokeLimits: StrokeLimits;
  course: RoundCourse;
  policy: VerificationPolicy;
  players: ScoringPlayer[];
  cards: Scorecard[];
  resolutions: Resolution[];
  standings: StandingsResult;
  finalization: FinalizationReadiness;
  roundStatus: ScoringRoundStatus;
  requiredCards: number | null;
  tieBreak: TieBreakPolicy | null;
  approvedBy: string | null;
  finalizationAuthority: FinalizationAuthority | null;
  rulesVersion: string | null;
  publications: ScoringPublication[];
  provisionalPublication: boolean;
}

export interface SubmitCardInput {
  playerId: string;
  scorerId: string;
  source: Scorecard["source"];
  entries: Scorecard["entries"];
  writtenTotal: number | null;
  captureKey: string;
  /** A correction's reason. It is written to the scoring audit with the new revision. */
  reason?: string;
  /** Optional original photo stored in R2. */
  image?: {
    path: string;
    sha256: string;
    mime: string;
    bytes: number;
  };
  /** Optional raw extraction from the card reader. */
  extraction?: {
    engine: string;
    engineVersion: string;
    raw: unknown;
  };
}

export interface ResolveHoleInput {
  playerId: string;
  hole: number;
  /** 0 when the hole is settled as a pick-up. */
  strokes: number;
  /** True when the desk settles the hole as a pick-up: 0 points and no stroke count. */
  pickedUp?: boolean;
  reason: string;
}

export interface OpenRoundInput extends OpenRoundSettingsInput {
  /** The draw revision the desk is acting on. A newer revision on the event is refused. */
  expectedRevision: number;
  /** The playing day to open. Left out, the earliest playing day is used. */
  dayNumber?: number | null;
}

export interface CorrectHandicapInput {
  /** The player whose round snapshot is being corrected. */
  playerId: string;
  /** The corrected Handicap Index, before the event maximum is applied. */
  index: number;
  /** ISO date the corrected index is valid from. */
  effectiveDate: string;
  /** Why the index changed. Written to the scoring audit, so it is required. */
  reason: string;
}

/**
 * The bounds a correction accepts. Narrower than the snapshot's own storage check (-20 to 54) on
 * purpose: `correct_handicap_snapshot` refuses anything below -10, and both repositories refuse the
 * same values here before starting a write.
 */
export const CORRECTION_INDEX_LIMITS = { min: -10, max: 54 } as const;

/**
 * Checks a correction before either repository writes it. Returns the plain sentence to show, or
 * null when the input is acceptable.
 *
 * The database function applies the same rules in the same order. This helper keeps the demo, the
 * screen and the connected repository from starting a write that the database will refuse.
 */
export function handicapCorrectionProblem(
  input: CorrectHandicapInput,
  roundStatus: ScoringRoundStatus,
): string | null {
  if (roundStatus === "final") {
    return "The round is final, so its handicap snapshot cannot be corrected.";
  }
  if (input.reason.trim().length < 3) {
    return "A handicap correction needs a reason of at least 3 characters.";
  }
  if (
    !Number.isFinite(input.index) ||
    input.index < CORRECTION_INDEX_LIMITS.min ||
    input.index > CORRECTION_INDEX_LIMITS.max
  ) {
    return `The Handicap Index must be between ${CORRECTION_INDEX_LIMITS.min} and ${CORRECTION_INDEX_LIMITS.max}.`;
  }
  if (!isIsoDate(input.effectiveDate)) {
    return "The Handicap Index needs its effective date.";
  }
  return null;
}

export interface ScoringRepository {
  /**
   * The round for the playing day the desk is on. A null or missing day reads the earliest round,
   * which is what a caller with no day on screen has always had.
   */
  loadRound(tournamentId: string, dayNumber?: number | null): Promise<ScoringRoundView | null>;
  /** What the desk needs to decide whether the round can be opened, and why not. */
  loadOpenRoundState(tournamentId: string, dayNumber?: number | null): Promise<OpenRoundSnapshot>;
  /**
   * Copies the published draw into the round, its entries and handicap snapshots in one
   * transaction. Safe to call again for the same revision.
   */
  openRound(tournamentId: string, input: OpenRoundInput): Promise<ScoringRoundView>;
  submitCard(
    tournamentId: string,
    input: SubmitCardInput,
    dayNumber?: number | null,
  ): Promise<ScoringRoundView>;
  /**
   * Saves a desk-checked card under the event's card rules in one step: the handicap written on
   * the card, the card, and (when the desk has checked it) its approval, each with its audit row.
   * Refuses with a plain sentence when the round is not on the event rules.
   */
  saveEventCard(
    tournamentId: string,
    input: SaveEventCardInput,
    dayNumber?: number | null,
  ): Promise<SaveEventCardResult>;
  approveCard(
    tournamentId: string,
    cardId: string,
    reason?: string,
    dayNumber?: number | null,
  ): Promise<ScoringRoundView>;
  rejectCard(
    tournamentId: string,
    cardId: string,
    reason: string,
    dayNumber?: number | null,
  ): Promise<ScoringRoundView>;
  revokeCard(
    tournamentId: string,
    cardId: string,
    reason: string,
    dayNumber?: number | null,
  ): Promise<ScoringRoundView>;
  resolveHole(
    tournamentId: string,
    input: ResolveHoleInput,
    dayNumber?: number | null,
  ): Promise<ScoringRoundView>;
  /**
   * Corrects the handicap snapshot the round is scored from, after the round has left draft/open.
   * The database lifts its freeze for this one write, recalculates that player's result and records
   * who, why, the old values and the new ones. Owner or organizer only. Publishing is the caller's
   * decision.
   */
  correctHandicap(
    tournamentId: string,
    input: CorrectHandicapInput,
    dayNumber?: number | null,
  ): Promise<ScoringRoundView>;
  publishRound(
    tournamentId: string,
    note?: string,
    dayNumber?: number | null,
  ): Promise<ScoringRoundView>;
  finalizeRound(
    tournamentId: string,
    note?: string,
    dayNumber?: number | null,
  ): Promise<ScoringRoundView>;
}

export interface DemoScoringOptions {
  actor?: string;
  idFactory?: () => string;
  now?: () => number;
}

/**
 * A deterministic, in-memory scoring repository for the demo shell and tests.
 *
 * It does not replace the database workflow. It applies the same pure engine and exposes the same
 * view the connected repository must return, so the screen and its tests do not depend on Supabase.
 */
export function createDemoScoringRepository(
  seed: ScoringRoundSeed,
  options: DemoScoringOptions = {},
): ScoringRepository {
  const actor = options.actor ?? "demo-desk";
  const idFactory = options.idFactory ?? (() => globalThis.crypto.randomUUID());
  const clock = options.now ?? (() => Date.now());

  let cards = seed.cards ? seed.cards.map((card) => ({ ...card })) : [];
  let resolutions = seed.resolutions
    ? seed.resolutions.map((resolution) => ({ ...resolution }))
    : [];
  let publications: ScoringPublication[] = [];
  let roundStatus: ScoringRoundStatus = seed.roundStatus ?? "scoring";
  let requiredCards: number | null = seed.policy.requiredCards;
  let finalizationAuthority: FinalizationAuthority | null = seed.finalizationAuthority ?? null;
  let tieBreak: TieBreakPolicy | null = seed.tieBreak ?? null;
  let rulesVersion: string | null = seed.rulesVersion ?? null;
  const captureKeys = new Map<string, string>();
  /** Card handicap snapshots written under an event's card rules, by player. */
  const cardHandicaps = new Map<string, HandicapSnapshot>();

  let lastTick = 0;
  const nextIso = () => {
    lastTick = Math.max(clock(), lastTick + 1);
    return new Date(lastTick).toISOString();
  };

  function view(): ScoringRoundView {
    const policy: VerificationPolicy = { ...seed.policy, requiredCards };
    const players: ScoringPlayer[] = seed.players.map((player) => ({
      ...player,
      handicap: cardHandicaps.get(player.playerId) ?? player.handicap,
      canonical: deriveCanonicalHoleScores({
        roundId: seed.roundId,
        playerId: player.playerId,
        course: seed.course,
        cards: cards.filter((card) => card.playerId === player.playerId),
        resolutions: resolutions.filter((resolution) => resolution.playerId === player.playerId),
        policy,
      }),
    }));

    const standings = buildStandings({
      roundId: seed.roundId,
      course: seed.course,
      policy,
      players,
    });

    const finalization = checkFinalization({
      roundId: seed.roundId,
      course: seed.course,
      policy,
      players,
      tieBreak,
      approvedBy: seed.approvedBy ?? null,
    });

    return {
      roundId: seed.roundId,
      tournamentId: seed.tournamentId,
      dayNumber: seed.dayNumber ?? 1,
      strokeLimits: seed.strokeLimits ?? DEFAULT_STROKE_LIMITS,
      course: seed.course,
      policy,
      players,
      cards: cards.map((card) => ({ ...card })),
      resolutions: resolutions.map((resolution) => ({ ...resolution })),
      standings,
      finalization,
      roundStatus,
      requiredCards,
      tieBreak,
      approvedBy: seed.approvedBy ?? null,
      finalizationAuthority,
      rulesVersion,
      publications: publications.map((publication) => ({ ...publication })),
      provisionalPublication: seed.provisionalPublication ?? false,
    };
  }

  function assertTournament(tournamentId: string) {
    if (tournamentId !== seed.tournamentId) {
      throw new Error("This scoring round belongs to another tournament.");
    }
  }

  function openRoundSnapshot(): OpenRoundSnapshot {
    const draw = seed.draw ?? {
      revision: 1,
      published: true,
      groups: [{ number: 1, playerIds: seed.players.map((player) => player.playerId) }],
    };
    const policies: TieBreakPolicyOption[] = seed.tieBreak
      ? [
          {
            id: seed.tieBreak.id,
            name: seed.tieBreak.name,
            confirmed: Boolean(seed.tieBreak.confirmedBy && seed.tieBreak.confirmedAt),
          },
        ]
      : [];
    return {
      draw: {
        revision: draw.revision,
        published: draw.published,
        publishedGroups: draw.hasPlayerIds === false ? null : draw.groups,
        liveGroups: draw.liveGroups ?? draw.groups,
      },
      roundStatus,
      storedSettings: {
        requiredCards,
        finalizationAuthority,
        tieBreakPolicyId: tieBreak ? tieBreak.id : null,
        rulesVersion,
      },
      tieBreakPolicies: policies,
    };
  }

  const repository: Omit<ScoringRepository, "saveEventCard"> = {
    async loadRound(tournamentId, dayNumber) {
      if (tournamentId !== seed.tournamentId) return null;
      if (dayNumber !== undefined && dayNumber !== null && (seed.dayNumber ?? 1) !== dayNumber) {
        return null;
      }
      return view();
    },

    async loadOpenRoundState(tournamentId) {
      assertTournament(tournamentId);
      return openRoundSnapshot();
    },

    async openRound(tournamentId, input) {
      assertTournament(tournamentId);
      const current = openRoundSnapshot();
      // Repeating the same open from the same revision is a no-op, matching the database.
      if (roundStatus === "open") {
        if (input.expectedRevision === current.draw.revision) return view();
        throw new Error(OPEN_ROUND_MESSAGES.staleRevision);
      }

      const assessment = assessOpenRound(current, input, input.expectedRevision);
      if (assessment.state !== "ready") {
        throw new Error(assessment.message);
      }

      const chosen =
        seed.tieBreak && seed.tieBreak.id === input.tieBreakPolicyId ? seed.tieBreak : null;
      if (!chosen) {
        throw new Error("That tie-break policy is not one of the demo's policies.");
      }

      requiredCards = input.requiredCards ?? null;
      finalizationAuthority = input.finalizationAuthority ?? null;
      tieBreak = chosen;
      rulesVersion = input.rulesVersion ?? null;
      roundStatus = "open";
      return view();
    },

    async submitCard(tournamentId, input) {
      assertTournament(tournamentId);
      const existingId = captureKeys.get(input.captureKey);
      if (existingId) {
        const existing = cards.find((card) => card.id === existingId);
        if (
          !existing ||
          existing.playerId !== input.playerId ||
          existing.scorerId !== input.scorerId
        ) {
          throw new Error("capture_key_reused: the capture key belongs to another card.");
        }
        return view();
      }

      // The same card can arrive again with a new capture key: a second tap, a retried request, or
      // the same photo scanned twice. Recognising it here keeps a second revision out of the
      // evidence, even when the screen never asked.
      const verdict = checkCardSubmission({
        cards,
        playerId: input.playerId,
        scorerId: input.scorerId,
        entries: input.entries,
        playerName: seed.players.find((player) => player.playerId === input.playerId)?.playerName,
        imageSha256: input.image?.sha256,
        correcting: Boolean(input.reason),
      });
      if (verdict.kind === "repeat" || verdict.kind === "same_photo") return view();
      if (verdict.kind === "needs_correction") throw new Error(verdict.message);

      const revision =
        Math.max(
          0,
          ...cards
            .filter((card) => card.playerId === input.playerId && card.scorerId === input.scorerId)
            .map((card) => card.revision),
        ) + 1;

      cards = [
        ...cards,
        {
          id: idFactory(),
          roundId: seed.roundId,
          playerId: input.playerId,
          scorerId: input.scorerId,
          source: input.source,
          revision,
          status: "submitted",
          entries: input.entries.map((entry) => ({ ...entry })),
          writtenTotal: input.writtenTotal,
          submittedAt: nextIso(),
          imageSha256: input.image?.sha256 ?? null,
        },
      ];
      captureKeys.set(input.captureKey, cards[cards.length - 1]?.id ?? "");
      return view();
    },

    async approveCard(tournamentId, cardId) {
      assertTournament(tournamentId);
      const card = cards.find((candidate) => candidate.id === cardId);
      if (!card) throw new Error("Scorecard not found.");
      if (card.status === "approved") return view();
      if (card.status !== "submitted" && card.status !== "in_review") {
        throw new Error("Only a submitted card can be approved.");
      }

      const validation = validateScorecard(card, {
        course: seed.course,
        minOcrConfidence: seed.policy.minOcrConfidence,
      });
      if (!validation.approvable) {
        throw new Error(validation.issues.map((issue) => issue.message).join(" "));
      }

      cards = cards.map((candidate) =>
        candidate.id === cardId ? { ...candidate, status: "approved" } : candidate,
      );
      return view();
    },

    async rejectCard(tournamentId, cardId, reason) {
      assertTournament(tournamentId);
      if (!reason.trim()) throw new Error("A rejection needs a reason.");
      const card = cards.find((candidate) => candidate.id === cardId);
      if (!card) throw new Error("Scorecard not found.");
      if (card.status !== "submitted" && card.status !== "in_review") {
        throw new Error("Only a submitted card can be rejected.");
      }
      cards = cards.map((candidate) =>
        candidate.id === cardId ? { ...candidate, status: "rejected" } : candidate,
      );
      return view();
    },

    async revokeCard(tournamentId, cardId, reason) {
      assertTournament(tournamentId);
      const card = cards.find((candidate) => candidate.id === cardId);
      if (!card) throw new Error("Scorecard not found.");
      if (reason.trim().length < 3) throw new Error("A revocation needs a reason.");
      if (roundStatus === "final") {
        throw new Error("The round is final; its results cannot be revoked.");
      }
      if (card.status !== "approved") {
        throw new Error("Only an approved card can be revoked.");
      }
      cards = cards.map((candidate) =>
        candidate.id === cardId ? { ...candidate, status: "revoked" } : candidate,
      );
      return view();
    },

    async resolveHole(tournamentId, input) {
      assertTournament(tournamentId);
      if (input.reason.trim().length < 3) throw new Error("A resolution needs a reason.");
      if (!seed.course.holes.some((hole) => hole.number === input.hole)) {
        throw new Error("That hole is not part of this round.");
      }
      const pickedUp = input.pickedUp === true;
      if (
        !pickedUp &&
        (!Number.isInteger(input.strokes) ||
          input.strokes < DEFAULT_STROKE_LIMITS.min ||
          input.strokes > DEFAULT_STROKE_LIMITS.max)
      ) {
        throw new Error("The resolved score is outside the permitted range.");
      }
      const current = view();
      const player = current.players.find((candidate) => candidate.playerId === input.playerId);
      if (!player) throw new Error("Player not found in this round.");
      const previous = player.canonical.holes.find((hole) => hole.hole === input.hole);

      resolutions = [
        ...resolutions,
        {
          id: idFactory(),
          roundId: seed.roundId,
          playerId: input.playerId,
          hole: input.hole,
          strokes: pickedUp ? 0 : input.strokes,
          ...(pickedUp ? { pickedUp: true } : {}),
          resolvedBy: actor,
          resolvedAt: nextIso(),
          reason: input.reason.trim(),
          evidenceCardIds: cards
            .filter((card) => card.playerId === input.playerId && card.status === "approved")
            .map((card) => card.id),
          previousStrokes: previous?.pickedUp === true ? null : (previous?.strokes ?? null),
        },
      ];
      return view();
    },

    async correctHandicap(tournamentId, input) {
      assertTournament(tournamentId);
      const problem = handicapCorrectionProblem(input, roundStatus);
      if (problem) throw new Error(problem);

      const current = view();
      const player = current.players.find((candidate) => candidate.playerId === input.playerId);
      if (!player) throw new Error("Player not found in this round.");
      const existing = cardHandicaps.get(input.playerId) ?? player.handicap;
      if (!existing) throw new Error("This player has no handicap snapshot to correct.");

      // The same arithmetic as the database: cap at the event maximum, round the index to one
      // decimal, then work out Course and Playing Handicap from the snapshot's tee ratings and the
      // round's allowance. A card snapshot reads as "card" here but is stored as "single", which is
      // the mode the correction keeps.
      const capped =
        seed.maxIndex === null || seed.maxIndex === undefined
          ? input.index
          : Math.min(input.index, seed.maxIndex);
      const calculation = calculateHandicap({
        index: Math.round(capped * 10) / 10,
        indexSource: CORRECTED_HANDICAP_SOURCE,
        indexEffectiveDate: input.effectiveDate,
        tee: {
          id: existing.teeId,
          name: seed.course.tee.name,
          courseRating: existing.courseRating,
          slope: existing.slope,
          par: existing.coursePar,
        },
        allowance: existing.allowance,
        rounding: existing.rounding === "card" ? "single" : existing.rounding,
        rulesVersion: existing.rulesVersion,
      });
      if (!calculation.ok) {
        throw new Error(calculation.problems.map((issue) => issue.message).join(" "));
      }

      cardHandicaps.set(input.playerId, calculation.snapshot);
      return view();
    },

    async publishRound(tournamentId) {
      assertTournament(tournamentId);
      if (!seed.provisionalPublication) {
        throw new Error("Provisional publication is off for this round.");
      }
      if (roundStatus !== "scoring" && roundStatus !== "provisional") {
        throw new Error("The round is not ready to publish provisional results.");
      }
      publications = [
        ...publications,
        {
          version: publications.length + 1,
          state: "provisional",
          publishedAt: nextIso(),
        },
      ];
      roundStatus = "provisional";
      return view();
    },

    async finalizeRound(tournamentId) {
      assertTournament(tournamentId);
      if (!finalizationAuthority) {
        throw new Error("The final approval authority has not been confirmed.");
      }
      if (finalizationAuthority === "committee") {
        throw new Error("Committee finalization is not implemented.");
      }
      const current = view();
      if (!current.finalization.ready) {
        throw new Error(current.finalization.blockers.map((blocker) => blocker.message).join(" "));
      }
      if (roundStatus === "final") throw new Error("The round is already final.");
      publications = [
        ...publications,
        {
          version: publications.length + 1,
          state: "final",
          publishedAt: nextIso(),
        },
      ];
      roundStatus = "final";
      return view();
    },
  };

  return {
    ...repository,
    async saveEventCard(tournamentId, input, dayNumber) {
      assertTournament(tournamentId);
      if (dayNumber !== undefined && dayNumber !== null && (seed.dayNumber ?? 1) !== dayNumber) {
        throw new Error("This scoring round is for another playing day.");
      }
      return saveEventCardFlow(
        {
          load: async () => view(),
          writeSnapshot: async (plan) => {
            cardHandicaps.set(input.playerId, plan.snapshot);
          },
          submit: (card) => repository.submitCard(tournamentId, card),
          approve: (cardId, reason) => repository.approveCard(tournamentId, cardId, reason),
          today: () => new Date(clock()).toISOString().slice(0, 10),
        },
        input,
      );
    },
  };
}
