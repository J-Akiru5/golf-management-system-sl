import type { FinalizationAuthority } from "@/lib/scoring";
import {
  buildStandings,
  type CanonicalRound,
  checkFinalization,
  DEFAULT_STROKE_LIMITS,
  deriveCanonicalHoleScores,
  type FinalizationReadiness,
  type HandicapSnapshot,
  type Resolution,
  type RoundCourse,
  type Scorecard,
  type StandingsResult,
  type TieBreakPolicy,
  type VerificationPolicy,
  validateScorecard,
} from "@/lib/scoring";

export type ScoringRoundStatus = "draft" | "open" | "scoring" | "provisional" | "final";

export interface ScoringPlayerSeed {
  registrationId: string;
  /** The per-day entry, when the connected repository has one. The demo does not need it. */
  roundEntryId?: string;
  playerId: string;
  playerName: string;
  flightId: string | null;
  handicap: HandicapSnapshot | null;
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
}

export interface ScoringRoundView {
  roundId: string;
  tournamentId: string;
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
  strokes: number;
  reason: string;
}

export interface ScoringRepository {
  loadRound(tournamentId: string): Promise<ScoringRoundView | null>;
  submitCard(tournamentId: string, input: SubmitCardInput): Promise<ScoringRoundView>;
  approveCard(tournamentId: string, cardId: string, reason?: string): Promise<ScoringRoundView>;
  rejectCard(tournamentId: string, cardId: string, reason: string): Promise<ScoringRoundView>;
  resolveHole(tournamentId: string, input: ResolveHoleInput): Promise<ScoringRoundView>;
  publishRound(tournamentId: string, note?: string): Promise<ScoringRoundView>;
  finalizeRound(tournamentId: string, note?: string): Promise<ScoringRoundView>;
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
  const captureKeys = new Map<string, string>();

  let lastTick = 0;
  const nextIso = () => {
    lastTick = Math.max(clock(), lastTick + 1);
    return new Date(lastTick).toISOString();
  };

  function view(): ScoringRoundView {
    const players: ScoringPlayer[] = seed.players.map((player) => ({
      ...player,
      canonical: deriveCanonicalHoleScores({
        roundId: seed.roundId,
        playerId: player.playerId,
        course: seed.course,
        cards: cards.filter((card) => card.playerId === player.playerId),
        resolutions: resolutions.filter((resolution) => resolution.playerId === player.playerId),
        policy: seed.policy,
      }),
    }));

    const standings = buildStandings({
      roundId: seed.roundId,
      course: seed.course,
      policy: seed.policy,
      players,
    });

    const finalization = checkFinalization({
      roundId: seed.roundId,
      course: seed.course,
      policy: seed.policy,
      players,
      tieBreak: seed.tieBreak ?? null,
      approvedBy: seed.approvedBy ?? null,
    });

    return {
      roundId: seed.roundId,
      tournamentId: seed.tournamentId,
      course: seed.course,
      policy: seed.policy,
      players,
      cards: cards.map((card) => ({ ...card })),
      resolutions: resolutions.map((resolution) => ({ ...resolution })),
      standings,
      finalization,
      roundStatus,
      requiredCards: seed.policy.requiredCards,
      tieBreak: seed.tieBreak ?? null,
      approvedBy: seed.approvedBy ?? null,
      finalizationAuthority: seed.finalizationAuthority ?? null,
      publications: publications.map((publication) => ({ ...publication })),
      provisionalPublication: seed.provisionalPublication ?? false,
    };
  }

  function assertTournament(tournamentId: string) {
    if (tournamentId !== seed.tournamentId) {
      throw new Error("This scoring round belongs to another tournament.");
    }
  }

  return {
    async loadRound(tournamentId) {
      if (tournamentId !== seed.tournamentId) return null;
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

    async resolveHole(tournamentId, input) {
      assertTournament(tournamentId);
      if (input.reason.trim().length < 3) throw new Error("A resolution needs a reason.");
      if (!seed.course.holes.some((hole) => hole.number === input.hole)) {
        throw new Error("That hole is not part of this round.");
      }
      if (
        !Number.isInteger(input.strokes) ||
        input.strokes < DEFAULT_STROKE_LIMITS.min ||
        input.strokes > DEFAULT_STROKE_LIMITS.max
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
          strokes: input.strokes,
          resolvedBy: actor,
          resolvedAt: nextIso(),
          reason: input.reason.trim(),
          evidenceCardIds: cards
            .filter((card) => card.playerId === input.playerId && card.status === "approved")
            .map((card) => card.id),
          previousStrokes: previous?.strokes ?? null,
        },
      ];
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
      if (!seed.finalizationAuthority) {
        throw new Error("The final approval authority has not been confirmed.");
      }
      if (seed.finalizationAuthority === "committee") {
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
}
