import { ageOn, classifyPlayer, type Registration, type Tee } from "@/lib/routing";
import { frozenOutdated, isStale, selectIndexForCutOff } from "./frozen";
import type {
  DeskRegistration,
  HandicapRecord,
  MissingFact,
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
 * The routing facts still missing from this entry. These are the facts the desk has to collect;
 * nothing here invents a default. Order matches the correction path on the register screen.
 */
export function missingFactsFor(player: PlayerRecord, entry: RegistrationEntry): MissingFact[] {
  const missing: MissingFact[] = [];
  if (player.birthdate === null) missing.push("birthdate");
  if (player.gender === null) missing.push("gender");
  if (entry.frozen.index === null) missing.push("handicap index");
  // An override can be recorded before the class is known. Such an entry plays in an Unclassified
  // group until a category and a flight are added to it.
  if (entry.overridden === true && entry.status === "ok") {
    if (!entry.categoryId) missing.push("category");
    if (!entry.flightId) missing.push("flight");
  }
  return missing;
}

/**
 * True when the entry plays today without a category and flight, so it is placed in an Unclassified
 * group. An override that names both is placed by those facts even when the player record is still
 * missing a birthdate.
 */
export function playsUnclassified(player: PlayerRecord, entry: RegistrationEntry): boolean {
  if (entry.status !== "ok") return false;
  if (entry.overridden === true && entry.categoryId && entry.flightId) return false;
  return missingFactsFor(player, entry).length > 0;
}

/**
 * True when the desk confirmed the entry while a routing fact is still missing. Derived from the
 * stored confirmation and the player record, never persisted as a status of its own.
 */
export function isProvisional(player: PlayerRecord, entry: RegistrationEntry): boolean {
  return playsUnclassified(player, entry);
}

/**
 * True when an organizer override is stored on the entry. The entry is placed by those stored facts,
 * even when some of them are empty: those empties put the player in an Unclassified group rather
 * than being guessed.
 */
export function hasStoredRouting(entry: RegistrationEntry): boolean {
  return entry.overridden === true && entry.status === "ok";
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
  const missing = missingFactsFor(player, entry);
  const provisional = playsUnclassified(player, entry);

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

  // An organizer override stores the routing facts the draw needs (category, tee, flight and
  // playing handicap) on the registration. It is the only path that can place a player whose
  // profile is still incomplete. The missing details stay in `entry.reasons` as pending notes.
  if (hasStoredRouting(entry)) {
    const age = player.birthdate ? ageOn(player.birthdate, tournament.config.date) : 0;
    return {
      playerId: player.id,
      playerName: player.name,
      status: "ok",
      reasons: entry.reasons ?? [],
      index: entry.frozen.index,
      age,
      categoryId: entry.categoryId ?? null,
      teeId: entry.teeId ?? null,
      playingHandicap: entry.playingHandicap ?? null,
      flightId: entry.flightId ?? null,
      ageKnown: player.birthdate !== null,
      flags: [],
      entryId: entry.id,
      role: entry.role,
      frozenIndex: entry.frozen.index,
      frozenRecordId: entry.frozen.recordId,
      frozenEffectiveDate: entry.frozen.effectiveDate,
      newerRecord: null,
      frozenOutdated: false,
      staleIndex: false,
      paymentStatus: entry.paymentStatus,
      sponsor: entry.sponsor,
      teePreferences: entry.teePreferences,
      provisional,
      missing,
    };
  }

  const missingReasons: string[] = [];
  if (player.birthdate === null) missingReasons.push(`Birthdate is missing for ${player.name}.`);
  if (player.gender === null) missingReasons.push(`Gender is missing for ${player.name}.`);

  let routing: Registration;
  const birthdate = player.birthdate;
  const gender = player.gender;
  if (missingReasons.length > 0 || birthdate === null || gender === null) {
    routing = {
      playerId: player.id,
      playerName: player.name,
      // A confirmed entry goes into the draw as provisional. Unconfirmed entries stay parked.
      status: provisional ? "ok" : "needs_review",
      reasons: missingReasons,
      index: entry.frozen.index,
      age: 0,
      categoryId: null,
      teeId: null,
      playingHandicap: null,
      flightId: null,
      provisional,
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
        // A confirmed entry is provisional, not parked: it plays today without a playing handicap.
        status: provisional ? "ok" : "needs_review",
        reasons: [reason, ...routing.reasons.filter((r) => !/No handicap index/i.test(r))],
        provisional,
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
    provisional,
    missing,
  };
}
