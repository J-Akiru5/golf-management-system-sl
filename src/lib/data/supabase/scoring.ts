import type { SupabaseClient } from "@supabase/supabase-js";
import { saveEventCardFlow } from "@/lib/data/event-card";
import {
  type OpenRoundDrawGroup,
  type OpenRoundSnapshot,
  openRoundErrorMessage,
} from "@/lib/data/open-round";
import {
  type CorrectHandicapInput,
  handicapCorrectionProblem,
  type OpenRoundInput,
  type ResolveHoleInput,
  type ScoringPlayer,
  type ScoringPublication,
  type ScoringRepository,
  type ScoringRoundStatus,
  type ScoringRoundView,
  type SubmitCardInput,
} from "@/lib/data/scoring";
import { refreshPublicPage } from "@/lib/data/supabase/draw-sync";
import { displayName } from "@/lib/format";
import {
  buildStandings,
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
import { planEventHandicap } from "@/lib/scoring/event-card";
import { CARD_HANDICAP_SOURCE, eventRulesFor } from "@/lib/scoring/event-rules";
import { checkCardSubmission } from "@/lib/scoring/submission";
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
  pickedUp?: boolean;
  verification: "verified" | "provisional";
  provenance: "agreement" | "single_card" | "desk_resolution";
}

type OpenRoundArgs = Db["Functions"]["open_round"]["Args"];

/**
 * Reads the player ids from a published snapshot. A publish written after player ids were stored
 * carries `playerIds` beside the names. An older publish carries names only, which cannot name a
 * player reliably, so it is treated as absent rather than matched by name.
 */
export function publishedGroupsFromJson(snapshot: unknown): OpenRoundDrawGroup[] | null {
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const groups = (snapshot as Record<string, unknown>).groups;
  if (!Array.isArray(groups) || groups.length === 0) return null;

  const result: OpenRoundDrawGroup[] = [];
  for (const group of groups) {
    if (typeof group !== "object" || group === null || Array.isArray(group)) return null;
    const record = group as Record<string, unknown>;
    const number = record.number;
    if (typeof number !== "number" || !Number.isFinite(number)) return null;
    const playerIds = record.playerIds;
    if (!Array.isArray(playerIds) || playerIds.length === 0) return null;
    if (!playerIds.every((id) => typeof id === "string" && id !== "")) return null;
    const dayNumber = record.dayNumber;
    result.push({
      number,
      playerIds,
      ...(typeof dayNumber === "number" && Number.isFinite(dayNumber) ? { dayNumber } : {}),
    });
  }
  return result;
}

/**
 * Calls the guarded `open_round` function. Every argument is sent, with an explicit null where the
 * desk left it out, so the database applies its own defaults predictably.
 */
export async function openRoundRequest(
  client: SupabaseClient<Database>,
  tournamentId: string,
  input: OpenRoundInput,
): Promise<string> {
  const args = {
    p_tournament: tournamentId,
    p_expected_revision: input.expectedRevision,
    p_required_cards: input.requiredCards ?? null,
    p_finalization_authority: input.finalizationAuthority ?? null,
    p_tie_break_policy_id: input.tieBreakPolicyId ?? null,
    p_rules_version: input.rulesVersion ?? null,
    p_day_number: input.dayNumber ?? null,
  } as unknown as OpenRoundArgs;
  const { data, error } = await client.rpc("open_round", args);
  if (error) throw new Error(openRoundErrorMessage(error.message));
  if (typeof data !== "string") {
    throw new Error("The round was not opened: the database returned no round id.");
  }
  return data;
}

/**
 * The connected scoring repository. Reads the persisted evidence and derives the view with the same
 * pure engine the sample uses; writes go through the guarded RPCs, never directly to the tables.
 */
export function createSupabaseScoringRepository(
  options: SupabaseScoringOptions,
): ScoringRepository {
  const db = options.client as unknown as SupabaseClient<Database>;
  /**
   * The scoring client is typed from the generated schema, which is a step ahead of the app's
   * Database type; the public clear only needs `auth.getSession`, so the cast stays local.
   */
  const publicDataChanged = () =>
    void refreshPublicPage(db as unknown as SupabaseClient<AppDatabase>);

  async function roundFor(
    tournamentId: string,
    dayNumber?: number,
  ): Promise<Row<"competition_rounds"> | null> {
    const base = db.from("competition_rounds").select("*").eq("tournament_id", tournamentId);
    const filtered = dayNumber === undefined ? base : base.eq("day_number", dayNumber);
    const { data, error } = await filtered
      .order("day_number", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Could not load the scoring round: ${error.message}`);
    return data;
  }

  async function roundForId(roundId: string): Promise<Row<"competition_rounds"> | null> {
    const { data, error } = await db
      .from("competition_rounds")
      .select("*")
      .eq("id", roundId)
      .maybeSingle();
    if (error) throw new Error(`Could not load the scoring round: ${error.message}`);
    return data;
  }

  async function buildView(round: Row<"competition_rounds">): Promise<ScoringRoundView | null> {
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

    const flightIds = [
      ...new Set(
        (entries ?? [])
          .map((entry) => entry.flight_id)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];
    const { data: flightRows, error: flightError } = flightIds.length
      ? await db
          .from("flights")
          .select("id, name")
          .eq("club_id", tournament.club_id)
          .in("id", flightIds)
      : { data: [], error: null };
    if (flightError) throw new Error(`Could not load classes: ${flightError.message}`);
    const classNameByFlight = new Map((flightRows ?? []).map((flight) => [flight.id, flight.name]));

    if (!holes?.length || !tees?.length) return null;

    const teeById = new Map(
      tees.map((tee) => [
        tee.id,
        {
          id: tee.id,
          name: tee.name,
          courseRating: Number(tee.course_rating),
          slope: tee.slope,
          par: tee.par,
        },
      ]),
    );

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

    // The photo fingerprint is what lets the screens recognise the same photo scanned twice, since
    // each scan request carries its own capture key.
    const { data: cardImages, error: cardImageError } = cardIds.length
      ? await db.from("scorecard_images").select("scorecard_id, sha256").in("scorecard_id", cardIds)
      : { data: [], error: null };
    // The fingerprints only feed the same-photo notice. If they cannot be read, the cards still
    // load and that one notice is skipped; scoring must not stop for it.
    const cardImageRows = cardImageError ? [] : (cardImages ?? []);

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
      imageSha256: cardImageRows.find((image) => image.scorecard_id === card.id)?.sha256 ?? null,
      entries: (cardEntries ?? [])
        .filter((entry) => entry.scorecard_id === card.id)
        .map((entry) => ({
          hole: entry.hole_number,
          strokes: entry.strokes,
          ...(entry.picked_up === true ? { pickedUp: true } : {}),
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
      ...(resolution.picked_up === true ? { pickedUp: true } : {}),
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
            // A snapshot saved from the card's HDCP box is stored as "single" (the database only
            // knows whs and single) and marked by its source. Read it back as the card rule, or the
            // engine would recompute it from the tee and call it a mismatch.
            rounding:
              snapshot.index_source === CARD_HANDICAP_SOURCE
                ? "card"
                : (snapshot.rounding as HandicapRounding),
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
          // The class name, never the stored flight id. An entry with a flight id but no matching
          // class row reads as no class rather than showing an id the desk cannot read.
          flightName:
            entry.flight_id === null ? null : (classNameByFlight.get(entry.flight_id) ?? null),
          handicap,
          // Loaded beside the snapshot so the screen can show whether the two agree. The
          // registration column is nullable; null means no index was frozen, not zero.
          frozenIndex:
            registration.frozen_index === null ? null : Number(registration.frozen_index),
          // The tee on the registration, not the round's: the WHS playing handicap a card is saved
          // with is worked out from the player's own tee. A registration with no tee reads as null,
          // which stops a save rather than guessing the round's.
          tee: registration.tee_id === null ? null : (teeById.get(registration.tee_id) ?? null),
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
      dayNumber: round.day_number,
      strokeLimits: { min: round.stroke_min, max: round.stroke_max },
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
      rulesVersion: round.rules_version,
      publications,
      provisionalPublication: round.provisional_publication !== "off",
    };
  }

  async function loadRound(
    tournamentId: string,
    dayNumber?: number | null,
  ): Promise<ScoringRoundView | null> {
    const round = await roundFor(tournamentId, dayNumber ?? undefined);
    if (!round) return null;
    return buildView(round);
  }

  async function loadOpenRoundState(
    tournamentId: string,
    dayNumber?: number | null,
  ): Promise<OpenRoundSnapshot> {
    const { data: tournament, error: tournamentError } = await db
      .from("tournaments")
      .select("id, club_id, draw_revision, published, published_snapshot")
      .eq("id", tournamentId)
      .maybeSingle();
    if (tournamentError) {
      throw new Error(`Could not load the tournament: ${tournamentError.message}`);
    }
    if (!tournament) {
      throw new Error("This event could not be found, so its round cannot be opened.");
    }

    const round = await roundFor(tournamentId, dayNumber ?? undefined);

    let liveGroups: OpenRoundDrawGroup[] = [];
    if (round) {
      const { data: groupRows, error: groupError } = await db
        .from("groups")
        .select("id, number")
        .eq("round_id", round.id)
        .order("number", { ascending: true });
      if (groupError) throw new Error(`Could not load the draw: ${groupError.message}`);

      const groups = groupRows ?? [];
      const groupIds = groups.map((group) => group.id);
      const { data: memberRows, error: memberError } = groupIds.length
        ? await db
            .from("group_members")
            .select("group_id, registration_id, position")
            .in("group_id", groupIds)
            .order("position", { ascending: true })
        : { data: [], error: null };
      if (memberError) throw new Error(`Could not load the group members: ${memberError.message}`);

      const registrationIds = (memberRows ?? []).map((member) => member.registration_id);
      const { data: registrationRows, error: registrationError } = registrationIds.length
        ? await db.from("registrations").select("id, player_id").in("id", registrationIds)
        : { data: [], error: null };
      if (registrationError) {
        throw new Error(`Could not load registrations: ${registrationError.message}`);
      }

      const playerByRegistration = new Map(
        (registrationRows ?? []).map((registration) => [registration.id, registration.player_id]),
      );
      const membersByGroup = new Map<string, { registrationId: string; position: number }[]>();
      for (const member of memberRows ?? []) {
        const list = membersByGroup.get(member.group_id) ?? [];
        list.push({ registrationId: member.registration_id, position: member.position });
        membersByGroup.set(member.group_id, list);
      }

      liveGroups = groups.map((group) => ({
        number: group.number,
        playerIds: (membersByGroup.get(group.id) ?? [])
          .sort((a, b) => a.position - b.position)
          .map((member) => playerByRegistration.get(member.registrationId))
          .filter((playerId): playerId is string => typeof playerId === "string"),
      }));
    }

    const { data: policyRows, error: policyError } = await db
      .from("tie_break_policies")
      .select("id, name, confirmed_at, confirmed_by")
      .eq("club_id", tournament.club_id)
      .order("name", { ascending: true });
    if (policyError) {
      throw new Error(`Could not load the tie-break policies: ${policyError.message}`);
    }

    return {
      draw: {
        revision: tournament.draw_revision,
        published: tournament.published,
        publishedGroups: publishedGroupsFromJson(tournament.published_snapshot),
        liveGroups,
      },
      roundStatus: round ? (round.status as OpenRoundSnapshot["roundStatus"]) : null,
      storedSettings: {
        requiredCards: round?.required_cards ?? null,
        finalizationAuthority:
          (round?.finalization_authority as FinalizationAuthority | null | undefined) ?? null,
        tieBreakPolicyId: round?.tie_break_policy_id ?? null,
        rulesVersion: round?.rules_version ?? null,
      },
      tieBreakPolicies: (policyRows ?? []).map((policy) => ({
        id: policy.id,
        name: policy.name,
        confirmed: policy.confirmed_at !== null && policy.confirmed_by !== null,
      })),
    };
  }

  function proposalRows(player: ScoringPlayer): ProposalRow[] {
    const rows: ProposalRow[] = [];
    for (const hole of player.canonical.holes) {
      if (hole.status !== "verified" && hole.status !== "provisional") continue;
      if (hole.provenance === null) continue;
      const pickedUp = hole.pickedUp === true;
      if (!pickedUp && hole.strokes === null) continue;
      rows.push({
        hole: hole.hole,
        // A pick-up is sent as 0, the shape the database stores for it.
        strokes: pickedUp ? 0 : (hole.strokes ?? 0),
        ...(pickedUp ? { pickedUp: true } : {}),
        verification: hole.status,
        provenance: hole.provenance,
      });
    }
    return rows;
  }

  async function refresh(
    tournamentId: string,
    dayNumber?: number | null,
  ): Promise<ScoringRoundView> {
    const view = await loadRound(tournamentId, dayNumber);
    if (!view) throw new Error("No scoring round is configured for this tournament.");
    return view;
  }

  /**
   * Stores the WHS playing handicap a card is scored with, through the one function the database has
   * for a card snapshot (`save_card_handicap_snapshot`, migration 20261114000100).
   *
   * The number handed over is the playing handicap worked out from the registration index and tee.
   * The function stores what it is handed as both the course and the playing handicap, and marks the
   * row by its `index_source`, which is how the connected view reads it back as a card snapshot
   * instead of recomputing it from the tee. Nothing here reads the card's HDCP box.
   */
  async function writeCardSnapshot(player: ScoringPlayer, playingHandicap: number): Promise<void> {
    if (!player.roundEntryId) throw new Error("The player has no round entry.");
    // The generated types predate this function, so the call is typed by hand.
    const call = db.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ error: { message: string } | null }>;
    const { error } = await call.call(db, "save_card_handicap_snapshot", {
      p_round_entry: player.roundEntryId,
      p_card_handicap: String(playingHandicap),
    });
    if (!error) return;
    const missing = /could not find the function|PGRST202|does not exist/i.test(error.message);
    if (missing) {
      throw new Error(
        "The card handicap function is not installed in the database yet. Apply migration 20261114000100_card_handicap_snapshot.sql first.",
      );
    }
    // The installed function only accepts 0 and above. A plus player, or an index of 0 on a tee
    // rated below par, plays off a negative number, which needs the signed handicap migration
    // before it can be stored. The migration is not needed for any card that plays off 0 or more.
    if (playingHandicap < 0 && /plain number|card handicap/i.test(error.message)) {
      throw new Error(
        `${player.playerName} plays off ${playingHandicap}, and the installed card handicap function only stores 0 or more. The owner has to apply migration 20261115000100_card_handicap_signed_handicap.sql before a negative playing handicap can be saved.`,
      );
    }
    throw new Error(`Could not save the card handicap for ${player.playerName}: ${error.message}`);
  }

  /**
   * Makes sure the round holds the WHS playing handicap this card is scored with, whatever screen
   * sent the card. A card that reached the desk by import or from the tabulator has no snapshot of
   * its own, and without one the round scores gross only, so the handicap is written here before the
   * approval. A snapshot that already matches is left alone.
   */
  async function ensureCardHandicap(view: ScoringRoundView, player: ScoringPlayer): Promise<void> {
    // A round that is not on the event's card rules keeps the ordinary path untouched.
    if (!eventRulesFor(view.rulesVersion)) return;
    const plan = planEventHandicap({
      rulesVersion: view.rulesVersion,
      roundStatus: view.roundStatus,
      tee: view.course.tee,
      effectiveDate: new Date().toISOString().slice(0, 10),
      player,
    });
    if (!plan.ok) throw new Error(plan.message);
    if (plan.needsSnapshotWrite) await writeCardSnapshot(player, plan.snapshot.playingHandicap);
  }

  const repository: Omit<ScoringRepository, "saveEventCard"> = {
    loadRound,
    loadOpenRoundState,

    async openRound(tournamentId, input) {
      const roundId = await openRoundRequest(db, tournamentId, input);
      const round = await roundForId(roundId);
      const view = round ? await buildView(round) : null;
      if (!view) {
        throw new Error(
          "The round was opened, but its field could not be read. Reload the scoring screen.",
        );
      }
      return view;
    },

    async submitCard(tournamentId, input: SubmitCardInput, dayNumber?: number | null) {
      const view = await refresh(tournamentId, dayNumber);
      const player = view.players.find((candidate) => candidate.playerId === input.playerId);
      if (!player?.roundEntryId) throw new Error("The player has no round entry.");

      // Recognise a card that is already in before writing a new revision. The capture key covers
      // a retried request; this covers a second tap, a fresh key, and the same photo scanned twice.
      const verdict = checkCardSubmission({
        cards: view.cards,
        playerId: input.playerId,
        scorerId: input.scorerId,
        entries: input.entries,
        playerName: player.playerName,
        imageSha256: input.image?.sha256,
        correcting: Boolean(input.reason),
      });
      if (verdict.kind === "repeat" || verdict.kind === "same_photo") return view;
      if (verdict.kind === "needs_correction") throw new Error(verdict.message);

      const { data: cardId, error } = await db.rpc("submit_scorecard", {
        p_round_entry: player.roundEntryId,
        p_scorer_id: input.scorerId,
        p_source: input.source,
        p_capture_key: input.captureKey,
        p_entries: input.entries.map((entry) => ({
          hole: entry.hole,
          strokes: entry.strokes,
          ...(entry.pickedUp === true ? { picked_up: true } : {}),
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

      // The revision is already stored at this point. The reason is a separate audit row so a
      // missing audit function cannot roll back a card that the desk has already checked.
      if (input.reason) {
        const { error: reasonError } = await db.rpc("record_scorecard_correction", {
          p_card: cardId,
          p_reason: input.reason,
        });
        if (reasonError) {
          throw new Error(
            `The card revision was saved, but its correction reason could not be recorded: ${reasonError.message}`,
          );
        }
      }
      return refresh(tournamentId, dayNumber);
    },

    async approveCard(tournamentId, cardId, reason, dayNumber) {
      const view = await refresh(tournamentId, dayNumber);
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
      // Every approved card is scored with the WHS playing handicap, whichever screen sent it. A
      // card that arrived by import has no snapshot, so this is where it gets one.
      await ensureCardHandicap(view, existing);
      const player: ScoringPlayer = { ...existing, canonical };

      const { error } = await db.rpc("approve_scorecard", {
        p_card: cardId,
        p_canonical: proposalRows(player) as unknown as Json,
        p_reason: reason,
      });
      if (error) throw new Error(`Could not approve the card: ${error.message}`);
      return refresh(tournamentId, dayNumber);
    },

    async rejectCard(tournamentId, cardId, reason, dayNumber) {
      await refresh(tournamentId, dayNumber);
      const { error } = await db.rpc("reject_scorecard", { p_card: cardId, p_reason: reason });
      if (error) throw new Error(`Could not reject the card: ${error.message}`);
      return refresh(tournamentId, dayNumber);
    },

    async revokeCard(tournamentId, cardId, reason, dayNumber) {
      const view = await refresh(tournamentId, dayNumber);
      const card = view.cards.find((candidate) => candidate.id === cardId);
      if (!card) throw new Error("Scorecard not found.");
      if (card.status !== "approved") {
        throw new Error("Only an approved card can be revoked.");
      }

      // The revocation removes the card from the evidence, so the canonical rows have to be rebuilt
      // without it. The database checks the proposal against the remaining cards and resolutions.
      const afterRevoke = view.cards.map((candidate) =>
        candidate.id === cardId ? { ...candidate, status: "revoked" as const } : candidate,
      );
      const canonical = deriveCanonicalHoleScores({
        roundId: view.roundId,
        playerId: card.playerId,
        course: view.course,
        cards: afterRevoke,
        resolutions: view.resolutions,
        policy: view.policy,
      });
      const existing = view.players.find((candidate) => candidate.playerId === card.playerId);
      if (!existing) throw new Error("The card's player is not in this round.");

      const { error } = await db.rpc("revoke_scorecard", {
        p_card: cardId,
        p_canonical: proposalRows({ ...existing, canonical }) as unknown as Json,
        p_reason: reason,
      });
      if (error) throw new Error(`Could not revoke the card: ${error.message}`);
      return refresh(tournamentId, dayNumber);
    },

    async resolveHole(tournamentId, input: ResolveHoleInput, dayNumber) {
      const view = await refresh(tournamentId, dayNumber);
      const player = view.players.find((candidate) => candidate.playerId === input.playerId);
      if (!player) throw new Error("Player not found in this round.");

      const pickedUp = input.pickedUp === true;
      const strokes = pickedUp ? 0 : input.strokes;
      const previous = player.canonical.holes.find((hole) => hole.hole === input.hole);
      const temporary: Resolution = {
        id: `pending-${Date.now()}`,
        roundId: view.roundId,
        playerId: input.playerId,
        hole: input.hole,
        strokes,
        ...(pickedUp ? { pickedUp: true } : {}),
        resolvedBy: "desk",
        resolvedAt: new Date().toISOString(),
        reason: input.reason,
        evidenceCardIds: view.cards
          .filter((card) => card.playerId === input.playerId && card.status === "approved")
          .map((card) => card.id),
        // A pick-up before this resolution has no number, so it reads as null.
        previousStrokes: previous?.pickedUp === true ? null : (previous?.strokes ?? null),
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
        p_strokes: strokes,
        p_reason: input.reason,
        p_canonical: proposalRows({ ...player, canonical }) as unknown as Json,
      });
      if (error) throw new Error(`Could not resolve the hole: ${error.message}`);
      return refresh(tournamentId, dayNumber);
    },

    async correctHandicap(tournamentId, input: CorrectHandicapInput, dayNumber) {
      const view = await refresh(tournamentId, dayNumber);
      const problem = handicapCorrectionProblem(input, view.roundStatus);
      if (problem) throw new Error(problem);

      const player = view.players.find((candidate) => candidate.playerId === input.playerId);
      if (!player) throw new Error("Player not found in this round.");
      if (!player.roundEntryId) throw new Error("The player has no round entry.");

      // The generated types predate this function, so the call is typed by hand, as the card
      // handicap write is above.
      const call = db.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{ error: { message: string } | null }>;
      const { error } = await call.call(db, "correct_handicap_snapshot", {
        p_round_entry: player.roundEntryId,
        p_index: input.index,
        p_effective: input.effectiveDate,
        p_reason: input.reason.trim(),
      });
      if (error) {
        const missing = /could not find the function|PGRST202|does not exist/i.test(error.message);
        throw new Error(
          missing
            ? "The handicap correction function is not installed in the database yet. Apply migration 20261114000300_correct_handicap_snapshot.sql first."
            : `Could not correct the handicap for ${player.playerName}: ${error.message}`,
        );
      }
      // The function recalculates that player's result. Publishing the new result is the caller's
      // decision, so nothing here clears the public cache.
      return refresh(tournamentId, dayNumber);
    },

    async publishRound(tournamentId, note, dayNumber) {
      const view = await refresh(tournamentId, dayNumber);
      const { error } = await db.rpc("publish_round", {
        p_round: view.roundId,
        p_note: note,
      });
      if (error) throw new Error(`Could not publish the round: ${error.message}`);
      // A publication changes the team leaderboard, the published rounds and the player's card.
      publicDataChanged();
      return refresh(tournamentId, dayNumber);
    },

    async finalizeRound(tournamentId, note, dayNumber) {
      const view = await refresh(tournamentId, dayNumber);
      const { error } = await db.rpc("finalize_round", {
        p_round: view.roundId,
        p_note: note,
      });
      if (error) throw new Error(`Could not finalize the round: ${error.message}`);
      // Final results replace the provisional ones on the same public tables.
      publicDataChanged();
      return refresh(tournamentId, dayNumber);
    },
  };

  return {
    ...repository,

    async saveEventCard(tournamentId, input, dayNumber) {
      return saveEventCardFlow(
        {
          load: () => refresh(tournamentId, dayNumber),
          async writeSnapshot(plan, view) {
            const player = view.players.find((candidate) => candidate.playerId === input.playerId);
            if (!player) throw new Error("The player has no round entry.");
            await writeCardSnapshot(player, plan.snapshot.playingHandicap);
          },
          submit: (card) => repository.submitCard(tournamentId, card, dayNumber),
          approve: (cardId, reason) =>
            repository.approveCard(tournamentId, cardId, reason, dayNumber),
          today: () => new Date().toISOString().slice(0, 10),
        },
        input,
      );
    },
  };
}
