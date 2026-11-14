import {
  ageOn,
  classifyPlayer,
  defaultCategoryFor,
  type Registration,
  type Tee,
} from "@/lib/routing";
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
 *
 * A missing index is not on this list. The event rule treats an unverified handicap as 0, so the
 * player is classified and paired; the entry's reasons say that 0 was used.
 */
export function missingFactsFor(player: PlayerRecord, entry: RegistrationEntry): MissingFact[] {
  const missing: MissingFact[] = [];
  if (player.birthdate === null) missing.push("birthdate");
  if (player.gender === null) missing.push("gender");
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
export function playsUnclassified(_player: PlayerRecord, entry: RegistrationEntry): boolean {
  if (entry.status !== "ok") return false;
  if (entry.overridden === true && entry.categoryId && entry.flightId) return false;
  // A birthdate and a gender no longer send a player to Unclassified: the class comes from the
  // handicap and the club's open division carries the tee until the details arrive for scoring. Only
  // an override that names no category leaves an entry without one.
  return entry.overridden === true;
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
 * The tee an index edit is worked out on.
 *
 * The playing handicap for the player's own tee is what the event scores with (owner's rule, 14
 * November 2026), so the tee stored on the registration wins. The tee the routing view holds for the
 * entry is the same number for an entry that has not been corrected by hand. The category's tee is a
 * fallback only, for a registration that carries no tee at all.
 *
 * A tee id that is not in the event's tees is never swapped for another tee: the answer is null, so
 * the desk sees that the handicap cannot be worked out instead of reading a number from the wrong
 * card.
 */
export function overrideTee(
  ids: {
    /** The tee stored on the registration, set from the paper cards. */
    entryTeeId?: string | null;
    /** The tee the desk's routing view holds for the entry. */
    registrationTeeId?: string | null;
    /** The tee set on the category the dialog has chosen. */
    categoryTeeId?: string | null;
  },
  tees: Tee[],
): Tee | null {
  const own = ids.entryTeeId || ids.registrationTeeId || null;
  const wanted = own ?? ids.categoryTeeId ?? null;
  if (!wanted) return null;
  return tees.find((tee) => tee.id === wanted) ?? null;
}

/**
 * The other entry of the player's pair, when the club paired them. A member-guest pair is classed on
 * both partners, so an index edit has to name the partner it changes with the player.
 */
export function partnerOf(
  entry: RegistrationEntry,
  entries: RegistrationEntry[],
): RegistrationEntry | null {
  if (entry.teamNo === null || entry.teamNo === undefined) return null;
  return entries.find((other) => other.id !== entry.id && other.teamNo === entry.teamNo) ?? null;
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
      // The desk's stored class is the pair's class: applyTeamClasses gives it to both partners.
      classSource: "stored",
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

  // The owner's rule: schedule first. A missing birthdate or gender no longer holds an entry back.
  // The player is classed on their handicap through the club's open division, and the missing facts
  // stay on the entry as notes for scoring.
  let routing: Registration = classifyPlayer(
    {
      id: player.id,
      name: player.name,
      birthdate: player.birthdate,
      gender: player.gender,
      index: entry.frozen.index,
    },
    {
      players: [],
      config: tournament.config,
      tees,
      categories: tournament.categories,
      flights: tournament.flights,
      defaultCategoryId: defaultCategoryFor(tournament.categories)?.id,
    },
  );
  routing = { ...routing, reasons: [...missingReasons, ...routing.reasons] };
  {
    if (entry.frozen.index === null) {
      // The engine already placed this player with a handicap of 0. The desk wording says where the
      // missing number came from, and the status stays as the engine set it.
      const reason = selection.reason ?? "No NGAP index was frozen onto this registration.";
      routing = {
        ...routing,
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
    provisional,
    missing,
  };
}
