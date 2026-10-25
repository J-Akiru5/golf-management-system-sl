import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ResolveHoleInput,
  ScoringPlayer,
  ScoringPublication,
  ScoringRepository,
  ScoringRoundStatus,
  ScoringRoundView,
  SubmitCardInput,
} from "@/lib/data/scoring";
import { displayName } from "@/lib/format";
import {
  buildStandings,
  type CanonicalHole,
  type CardSource,
  type CardStatus,
  checkFinalization,
  deriveCanonicalHoleScores,
  type FinalizationAuthority,
  type HandicapRounding,
  type HandicapSnapshot,
  type Resolution,
  type RoundCourse,
  type Scorecard,
  type TieBreakPolicy,
  type VerificationPolicy,
} from "@/lib/scoring";
import type { Database, Json } from "@/lib/supabase/generated-types";
import type { Database as AppDatabase } from "@/lib/supabase/types";

type Db = Database["public"];
type Row<T extends keyof Db["Tables"]> = Db["Tables"][T]["Row"];

export interface SupabaseScoringOptions {
  client: SupabaseClient<AppDatabase>;
}

interface ProposalRow {
  hole: number;
  strokes: number;
  verification: "verified" | "provisional";
  provenance: "agreement" | "single_card" | "desk_resolution";
}

/**
 * The connected scoring repository. Reads the persisted evidence and derives the view with the same
 * pure engine the sample uses; writes go through the guarded RPCs, never directly to the tables.
 */
export function createSupabaseScoringRepository(
  options: SupabaseScoringOptions,
): ScoringRepository {
  const db = options.client as unknown as SupabaseClient<Database>;

  async function roundFor(tournamentId: string): Promise<Row<"competition_rounds"> | null> {
    const { data, error } = await db
      .from("competition_rounds")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("day_number", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Could not load the scoring round: ${error.message}`);
    return data;
  }

  async function loadRound(tournamentId: string): Promise<ScoringRoundView | null> {
    const round = await roundFor(tournamentId);
    if (!round) return null;

    const [{ data: entries, error: entriesError }, { data: snapshotRows, error: snapshotError }] =
      await Promise.all([
        db.from("round_entries").select("*").eq("round_id", round.id).eq("status", "active"),
        db.from("handicap_snapshots").select("*").eq("round_id", round.id),
      ]);
    if (entriesError) throw new Error(`Could not load round entries: ${entriesError.message}`);
    if (snapshotError)
      throw new Error(`Could not load handicap snapshots: ${snapshotError.message}`);

    const registrationIds = (entries ?? []).map((entry) => entry.registration_id);
    const { data: registrations, error: registrationError } = registrationIds.length
      ? await db.from("registrations").select("*").in("id", registrationIds)
      : { data: [], error: null };
    if (registrationError) {
      throw new Error(`Could not load registrations: ${registrationError.message}`);
    }

    const playerIds = (registrations ?? []).map((registration) => registration.player_id);
    const { data: players, error: playerError } = playerIds.length
      ? await db.from("players").select("*").in("id", playerIds)
      : { data: [], error: null };
    if (playerError) throw new Error(`Could not load players: ${playerError.message}`);

    const { data: tournament, error: tournamentError } = await db
      .from("tournaments")
      .select("*")
      .eq("id", round.tournament_id)
      .maybeSingle();
    if (tournamentError || !tournament) {
      throw new Error(`Could not load the tournament: ${tournamentError?.message ?? "not found"}`);
    }

    const [{ data: holes, error: holeError }, { data: tees, error: teeError }] = await Promise.all([
      db.from("holes").select("*").eq("course_id", tournament.course_id).order("number"),
      db.from("tees").select("*").eq("course_id", tournament.course_id),
    ]);
    if (holeError) throw new Error(`Could not load holes: ${holeError.message}`);
    if (teeError) throw new Error(`Could not load tees: ${teeError.message}`);

    if (!holes?.length || !tees?.length) return null;

    const firstSnapshot = snapshotRows?.find((snapshot) =>
      entries?.some((entry) => entry.id === snapshot.round_entry_id),
    );
    const roundTee = tees.find((tee) => tee.id === firstSnapshot?.tee_id) ?? tees[0];
    if (!roundTee) return null;

    const course: RoundCourse = {
      roundId: round.id,
      tee: {
        id: roundTee.id,
        name: roundTee.name,
        courseRating: Number(roundTee.course_rating),
        slope: roundTee.slope,
        par: roundTee.par,
      },
      holes: holes.map((hole) => ({
        number: hole.number,
        par: hole.par,
        strokeIndex: hole.stroke_index,
      })),
    };

    const policy: VerificationPolicy = {
      requiredCards: round.required_cards,
      allowProvisionalSingleCard: round.allow_provisional_single_card,
      minOcrConfidence: Number(round.min_ocr_confidence),
    };

    const [
      { data: cardRows, error: cardError },
      { data: resolutionRows, error: resolutionError },
      { data: publicationRows, error: publicationError },
    ] = await Promise.all([
      db.from("scorecards").select("*").eq("round_id", round.id),
      db.from("hole_resolutions").select("*").eq("round_id", round.id).is("superseded_at", null),
      db
        .from("round_publications")
        .select("version,state,published_at")
        .eq("round_id", round.id)
        .order("version", { ascending: true }),
    ]);
    if (cardError) throw new Error(`Could not load scorecards: ${cardError.message}`);
    if (resolutionError) {
      throw new Error(`Could not load desk resolutions: ${resolutionError.message}`);
    }
    if (publicationError) {
      throw new Error(`Could not load publications: ${publicationError.message}`);
    }

    const cardIds = (cardRows ?? []).map((card) => card.id);
    const { data: cardEntries, error: cardEntryError } = cardIds.length
      ? await db.from("scorecard_entries").select("*").in("scorecard_id", cardIds)
      : { data: [], error: null };
    if (cardEntryError) {
      throw new Error(`Could not load card entries: ${cardEntryError.message}`);
    }

    const cards: Scorecard[] = (cardRows ?? []).map((card) => ({
      id: card.id,
      roundId: card.round_id,
      playerId: card.player_id,
      scorerId: card.scorer_id,
      source: card.source as CardSource,
      revision: card.revision,
      status: card.status as CardStatus,
      writtenTotal: card.written_total,
      submittedAt: card.submitted_at,
      entries: (cardEntries ?? [])
        .filter((entry) => entry.scorecard_id === card.id)
        .map((entry) => ({
          hole: entry.hole_number,
          strokes: entry.strokes,
          confidence: entry.confidence === null ? null : Number(entry.confidence),
          manuallyConfirmed: entry.manually_confirmed,
        })),
    }));

    const resolutions: Resolution[] = (resolutionRows ?? []).map((resolution) => ({
      id: resolution.id,
      roundId: resolution.round_id,
      playerId: resolution.player_id,
      hole: resolution.hole_number,
      strokes: resolution.strokes,
      resolvedBy: resolution.resolved_by ?? "desk",
      resolvedAt: resolution.resolved_at,
      reason: resolution.reason,
      evidenceCardIds: resolution.evidence_card_ids ?? [],
      previousStrokes: resolution.previous_strokes,
    }));

    const snapshotByEntry = new Map(
      (snapshotRows ?? []).map((snapshot) => [snapshot.round_entry_id, snapshot]),
    );
    const registrationById = new Map(
      (registrations ?? []).map((registration) => [registration.id, registration]),
    );
    const playerById = new Map((players ?? []).map((player) => [player.id, player]));

    const scoringPlayers: ScoringPlayer[] = (entries ?? []).flatMap((entry) => {
      const registration = registrationById.get(entry.registration_id);
      if (!registration) return [];
      const player = playerById.get(registration.player_id);
      const snapshot = snapshotByEntry.get(entry.id);
      const handicap: HandicapSnapshot | null = snapshot
        ? {
            index: Number(snapshot.handicap_index),
            indexSource: snapshot.index_source,
            indexEffectiveDate: snapshot.index_effective_date,
            teeId: snapshot.tee_id,
            courseRating: Number(snapshot.course_rating),
            slope: snapshot.slope,
            coursePar: snapshot.course_par,
            allowance: Number(snapshot.allowance),
            rounding: snapshot.rounding as HandicapRounding,
            courseHandicap: snapshot.course_handicap,
            playingHandicap: snapshot.playing_handicap,
            rulesVersion: snapshot.rules_version,
          }
        : null;

      return [
        {
          registrationId: registration.id,
          roundEntryId: entry.id,
          playerId: registration.player_id,
          playerName: player ? displayName(player.full_name) : "Unknown player",
          flightId: entry.flight_id,
          handicap,
          canonical: deriveCanonicalHoleScores({
            roundId: round.id,
            playerId: registration.player_id,
            course,
            cards,
            resolutions,
            policy,
          }),
        },
      ];
    });

    const standings = buildStandings({
      roundId: round.id,
      course,
      policy,
      players: scoringPlayers,
    });

    let tieBreak: TieBreakPolicy | null = null;
    if (round.tie_break_policy_id) {
      const { data: policyRow, error: policyError } = await db
        .from("tie_break_policies")
        .select("*")
        .eq("id", round.tie_break_policy_id)
        .maybeSingle();
      if (policyError)
        throw new Error(`Could not load the tie-break policy: ${policyError.message}`);
      if (policyRow) {
        tieBreak = {
          id: policyRow.id,
          name: policyRow.name,
          source: policyRow.written_source,
          confirmedBy: policyRow.confirmed_by ?? "",
          confirmedAt: policyRow.confirmed_at ?? "",
        };
      }
    }

    const { data: auth } = await db.auth.getUser();
    const finalization = checkFinalization({
      roundId: round.id,
      course,
      policy,
      players: scoringPlayers,
      tieBreak,
      approvedBy: auth.user?.id ?? null,
    });

    const publications: ScoringPublication[] = (publicationRows ?? []).map((publication) => ({
      version: publication.version,
      state: publication.state as "provisional" | "final",
      publishedAt: publication.published_at,
    }));

    return {
      roundId: round.id,
      tournamentId: round.tournament_id,
      course,
      policy,
      players: scoringPlayers,
      cards,
      resolutions,
      standings,
      finalization,
      roundStatus: round.status as ScoringRoundStatus,
      requiredCards: round.required_cards,
      tieBreak,
      approvedBy: auth.user?.id ?? null,
      finalizationAuthority: round.finalization_authority as FinalizationAuthority | null,
      publications,
      provisionalPublication: round.provisional_publication !== "off",
    };
  }

  function proposalRows(player: ScoringPlayer): ProposalRow[] {
    return player.canonical.holes
      .filter(
        (
          hole,
        ): hole is CanonicalHole & {
          status: "verified" | "provisional";
          strokes: number;
          provenance: ProposalRow["provenance"];
        } =>
          (hole.status === "verified" || hole.status === "provisional") &&
          hole.strokes !== null &&
          hole.provenance !== null,
      )
      .map((hole) => ({
        hole: hole.hole,
        strokes: hole.strokes,
        verification: hole.status,
        provenance: hole.provenance,
      }));
  }

  async function refresh(tournamentId: string): Promise<ScoringRoundView> {
    const view = await loadRound(tournamentId);
    if (!view) throw new Error("No scoring round is configured for this tournament.");
    return view;
  }

  return {
    loadRound,

    async submitCard(tournamentId, input: SubmitCardInput) {
      const view = await refresh(tournamentId);
      const player = view.players.find((candidate) => candidate.playerId === input.playerId);
      if (!player?.roundEntryId) throw new Error("The player has no round entry.");

      const { error } = await db.rpc("submit_scorecard", {
        p_round_entry: player.roundEntryId,
        p_scorer_id: input.scorerId,
        p_source: input.source,
        p_capture_key: input.captureKey,
        p_entries: input.entries.map((entry) => ({
          hole: entry.hole,
          strokes: entry.strokes,
          confidence: entry.confidence,
          manually_confirmed: entry.manuallyConfirmed,
        })) as unknown as Json,
        p_written_total: input.writtenTotal ?? undefined,
        p_image_path: input.image?.path,
        p_image_sha256: input.image?.sha256,
        p_image_mime: input.image?.mime,
        p_image_bytes: input.image?.bytes,
        p_engine: input.extraction?.engine,
        p_engine_version: input.extraction?.engineVersion,
        p_extraction: input.extraction?.raw as Json | undefined,
      });
      if (error) throw new Error(`Could not submit the card: ${error.message}`);
      return refresh(tournamentId);
    },

    async approveCard(tournamentId, cardId, reason) {
      const view = await refresh(tournamentId);
      const card = view.cards.find((candidate) => candidate.id === cardId);
      if (!card) throw new Error("Scorecard not found.");

      const temporaryCards = view.cards.map((candidate) =>
        candidate.id === cardId ? { ...candidate, status: "approved" as const } : candidate,
      );
      const canonical = deriveCanonicalHoleScores({
        roundId: view.roundId,
        playerId: card.playerId,
        course: view.course,
        cards: temporaryCards,
        resolutions: view.resolutions,
        policy: view.policy,
      });
      const existing = view.players.find((candidate) => candidate.playerId === card.playerId);
      if (!existing) throw new Error("The card's player is not in this round.");
      const player: ScoringPlayer = { ...existing, canonical };

      const { error } = await db.rpc("approve_scorecard", {
        p_card: cardId,
        p_canonical: proposalRows(player) as unknown as Json,
        p_reason: reason,
      });
      if (error) throw new Error(`Could not approve the card: ${error.message}`);
      return refresh(tournamentId);
    },

    async rejectCard(tournamentId, cardId, reason) {
      await refresh(tournamentId);
      const { error } = await db.rpc("reject_scorecard", { p_card: cardId, p_reason: reason });
      if (error) throw new Error(`Could not reject the card: ${error.message}`);
      return refresh(tournamentId);
    },

    async resolveHole(tournamentId, input: ResolveHoleInput) {
      const view = await refresh(tournamentId);
      const player = view.players.find((candidate) => candidate.playerId === input.playerId);
      if (!player) throw new Error("Player not found in this round.");

      const temporary: Resolution = {
        id: `pending-${Date.now()}`,
        roundId: view.roundId,
        playerId: input.playerId,
        hole: input.hole,
        strokes: input.strokes,
        resolvedBy: "desk",
        resolvedAt: new Date().toISOString(),
        reason: input.reason,
        evidenceCardIds: view.cards
          .filter((card) => card.playerId === input.playerId && card.status === "approved")
          .map((card) => card.id),
        previousStrokes:
          player.canonical.holes.find((hole) => hole.hole === input.hole)?.strokes ?? null,
      };
      const canonical = deriveCanonicalHoleScores({
        roundId: view.roundId,
        playerId: input.playerId,
        course: view.course,
        cards: view.cards,
        resolutions: [...view.resolutions, temporary],
        policy: view.policy,
      });

      const { error } = await db.rpc("resolve_hole", {
        p_round: view.roundId,
        p_player: input.playerId,
        p_hole: input.hole,
        p_strokes: input.strokes,
        p_reason: input.reason,
        p_canonical: proposalRows({ ...player, canonical }) as unknown as Json,
      });
      if (error) throw new Error(`Could not resolve the hole: ${error.message}`);
      return refresh(tournamentId);
    },

    async publishRound(tournamentId, note) {
      const view = await refresh(tournamentId);
      const { error } = await db.rpc("publish_round", {
        p_round: view.roundId,
        p_note: note,
      });
      if (error) throw new Error(`Could not publish the round: ${error.message}`);
      return refresh(tournamentId);
    },

    async finalizeRound(tournamentId, note) {
      const view = await refresh(tournamentId);
      const { error } = await db.rpc("finalize_round", {
        p_round: view.roundId,
        p_note: note,
      });
      if (error) throw new Error(`Could not finalize the round: ${error.message}`);
      return refresh(tournamentId);
    },
  };
}
