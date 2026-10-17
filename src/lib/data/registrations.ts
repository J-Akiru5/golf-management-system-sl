import { classifyPlayer, type Registration, type Tee } from "@/lib/routing";
import { frozenOutdated, isStale, selectIndexForCutOff } from "./frozen";
import type {
  DeskRegistration,
  HandicapRecord,
  PlayerRecord,
  RegistrationEntry,
  Tournament,
} from "./types";

export interface RegistrationArgs {
  tournament: Tournament;
  tees: Tee[];
  player: PlayerRecord;
  entry: RegistrationEntry;
  records: HandicapRecord[];
}

/**
 * Builds the desk's view of one registration: the routing result for the frozen index, plus the
 * freeze provenance. Pure and side-effect free, so the draw, the registration desk and the tests
 * all read the same numbers.
 */
export function registrationFor({
  tournament,
  tees,
  player,
  entry,
  records,
}: RegistrationArgs): DeskRegistration {
  const selection = selectIndexForCutOff(records, tournament.cutOffDate);
  const stale = isStale(selection, tournament.cutOffDate, tournament.staleIndexDays);
  const outdated = frozenOutdated(entry.frozen, selection);

  const flags: string[] = [];
  if (outdated) {
    flags.push(
      selection.record
        ? `Records now select the ${selection.index ?? "NH"} index dated ${selection.record.effectiveDate}. Re-freeze before the draw.`
        : "The frozen record is no longer the latest one for the cut-off. Re-freeze before the draw.",
    );
  }
  if (stale && selection.record) {
    flags.push(
      `The frozen index dates from ${selection.record.effectiveDate}, more than ${tournament.staleIndexDays} days before the cut-off (${tournament.cutOffDate}). Import a fresh NGAP file.`,
    );
  }

  const missing: string[] = [];
  if (player.birthdate === null) missing.push(`Birthdate is missing for ${player.name}.`);
  if (player.gender === null) missing.push(`Gender is missing for ${player.name}.`);

  let routing: Registration;
  const birthdate = player.birthdate;
  const gender = player.gender;
  if (missing.length > 0 || birthdate === null || gender === null) {
    routing = {
      playerId: player.id,
      playerName: player.name,
      status: "needs_review",
      reasons: missing,
      index: entry.frozen.index,
      age: 0,
      categoryId: null,
      teeId: null,
      playingHandicap: null,
      flightId: null,
    };
  } else {
    routing = classifyPlayer(
      {
        id: player.id,
        name: player.name,
        birthdate,
        gender,
        index: entry.frozen.index,
      },
      {
        players: [],
        config: tournament.config,
        tees,
        categories: tournament.categories,
        flights: tournament.flights,
      },
    );
    if (entry.frozen.index === null) {
      // The generic engine wording hides where the number came from; the desk knows better.
      const reason = selection.reason ?? "No NGAP index was frozen onto this registration.";
      routing = {
        ...routing,
        status: "needs_review",
        reasons: [reason, ...routing.reasons.filter((r) => !/No handicap index/i.test(r))],
      };
    }
  }

  const reasons = [...routing.reasons, ...flags];

  return {
    ...routing,
    index: entry.frozen.index,
    ageKnown: player.birthdate !== null,
    reasons,
    flags,
    entryId: entry.id,
    role: entry.role,
    frozenIndex: entry.frozen.index,
    frozenRecordId: entry.frozen.recordId,
    frozenEffectiveDate: entry.frozen.effectiveDate,
    newerRecord: selection.newer
      ? { index: selection.newer.index, effectiveDate: selection.newer.effectiveDate }
      : null,
    frozenOutdated: outdated,
    staleIndex: stale,
    paymentStatus: entry.paymentStatus,
    sponsor: entry.sponsor,
    teePreferences: entry.teePreferences,
  };
}
