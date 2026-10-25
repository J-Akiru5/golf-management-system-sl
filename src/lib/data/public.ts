import type { CategoryRule, FlightRule } from "@/lib/routing";
import { selectedDaysOf } from "./dates";
import type {
  DeskRegistration,
  PlayerRecord,
  PublicPairingGroup,
  PublicPairingPlayer,
  PublicPairings,
  PublicPlayerProfile,
  PublicProgramme,
  PublicTeeTimeDay,
  PublicTeeTimePlayer,
  RegistrationEntry,
  TournamentDay,
} from "./types";

/**
 * The public view is built through this allow-list. Components that face players receive a
 * `PublicPairings` object and nothing else. The only player fields are the frozen name, the stable
 * id used to look up a public photo, and a public-bucket path that the database has already gated on
 * separate public consent. Birthdate, contact, private photo path, handicap history, payment and
 * notes can never leak into a public page by accident.
 *
 * The programme (the day schedule, the player cards and the rules of play) has its own allow-list
 * below. It adds home course, frozen index, category and flight, and still never carries contact
 * details, birthdate, gender, notes or a photo.
 */

/** The shape the publisher stores. Kept structural so this module does not import the store. */
export interface PublishedLike {
  groups: {
    number: number;
    startHole: number;
    wave: string | null;
    time: string;
    flight: string;
    players: string[];
    playerIds?: string[];
  }[];
}

export interface PublicPairingsInput {
  published: PublishedLike;
  tournamentName: string;
  dateLabel: string;
  startFormat: "shotgun" | "two_tee";
  firstTeeTime: string;
  /** Public photo paths by player id, only for players whose public consent is recorded. */
  photoByPlayerId?: Record<string, string>;
}

const onlyName = (name: string) => name.trim();

export function toPublicPairings({
  published,
  tournamentName,
  dateLabel,
  startFormat,
  firstTeeTime,
  photoByPlayerId = {},
}: PublicPairingsInput): PublicPairings {
  const groups: PublicPairingGroup[] = published.groups.map((g) => {
    const ids = g.playerIds ?? [];
    const players: PublicPairingPlayer[] = g.players
      .map((name, index) => {
        const rawId = ids[index];
        const id = rawId && rawId !== "" ? rawId : null;
        return {
          id,
          name: onlyName(name),
          photoPath: id ? (photoByPlayerId[id] ?? null) : null,
        };
      })
      .filter((player) => player.name !== "");
    return {
      number: g.number,
      startHole: g.startHole,
      wave: g.wave,
      time: g.time,
      flight: g.flight,
      players,
    };
  });
  return { tournamentName, dateLabel, startFormat, firstTeeTime, groups };
}

/* -------------------------------------------------------------------------------------------------
 * The programme: day tee times, public player cards and the organizers' rules of play.
 * ------------------------------------------------------------------------------------------------ */

export interface PublicProgrammeInput {
  /** The structured days of the event. Demo derives them; connected mode reads tournament_days. */
  days: TournamentDay[];
  entries: RegistrationEntry[];
  registrations: DeskRegistration[];
  players: PlayerRecord[];
  categories: CategoryRule[];
  flights: FlightRule[];
  rulesOfPlay?: string | null;
}

/** Trims the organizers' text and treats spaces as empty, so a blank box never renders. */
function cleanPublicText(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalised = value.replace(/\r\n?/g, "\n").trim();
  return normalised.length > 0 ? normalised : null;
}

/** A confirmed time is the only time a player may see. */
const publicTee = (
  dayTee: RegistrationEntry["dayTee"],
  dayNumber: number,
): Omit<PublicTeeTimePlayer, "name"> => {
  const tee = dayTee?.[dayNumber];
  if (!tee) return { teeTime: null, startHole: null, confirmed: false };
  const confirmed = tee.confirmed === true && typeof tee.teeTime === "string" && tee.teeTime !== "";
  return {
    teeTime: confirmed ? (tee.teeTime as string) : null,
    startHole: confirmed ? tee.startHole : null,
    confirmed,
  };
};

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/**
 * Builds the programme from the desk's own records for the demo build. The connected page reads the
 * same shape from `public_programme()`, which is the single database projection of these fields.
 *
 * Nothing here reads a contact field, a birthdate, a gender, a note or a photo.
 */
export function toPublicProgramme({
  days,
  entries,
  registrations,
  players,
  categories,
  flights,
  rulesOfPlay,
}: PublicProgrammeInput): PublicProgramme {
  const registrationByEntry = new Map(registrations.map((reg) => [reg.entryId, reg]));
  const homeCourseByPlayer = new Map(players.map((player) => [player.id, player.homeCourse]));
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const flightName = new Map(flights.map((flight) => [flight.id, flight.name]));

  const playingDays = days
    .filter((day) => day.isPlayingDay)
    .slice()
    .sort((a, b) => a.dayNumber - b.dayNumber);

  const publicDays: PublicTeeTimeDay[] = playingDays.map((day) => {
    const playersOnDay: PublicTeeTimePlayer[] = [];
    for (const entry of entries) {
      const registration = registrationByEntry.get(entry.id);
      if (!registration) continue;
      if (!selectedDaysOf(entry, playingDays).includes(day.dayNumber)) continue;
      const tee = publicTee(entry.dayTee, day.dayNumber);
      playersOnDay.push({ name: registration.playerName.trim(), ...tee });
    }

    playersOnDay.sort((a, b) => {
      if (a.teeTime && b.teeTime) return a.teeTime.localeCompare(b.teeTime) || byName(a, b);
      if (a.teeTime) return -1;
      if (b.teeTime) return 1;
      return byName(a, b);
    });

    return {
      dayNumber: day.dayNumber,
      label: day.label,
      playDate: day.playDate,
      startTime: day.startTime,
      players: playersOnDay.filter((player) => player.name !== ""),
    };
  });

  const publicPlayers: PublicPlayerProfile[] = registrations
    .filter((registration) => registration.status !== "ineligible")
    .map((registration) => ({
      name: registration.playerName.trim(),
      homeCourse: homeCourseByPlayer.get(registration.playerId)?.trim() || null,
      index: registration.frozenIndex,
      category: registration.categoryId
        ? (categoryName.get(registration.categoryId) ?? null)
        : null,
      flight: registration.flightId ? (flightName.get(registration.flightId) ?? null) : null,
    }))
    .filter((player) => player.name !== "")
    .sort(byName);

  return {
    days: publicDays,
    players: publicPlayers,
    rulesOfPlay: cleanPublicText(rulesOfPlay),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const textOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/** Accepts a numeric index as a number or a numeric string; anything else is no index. */
const indexOrNull = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
};

const timeOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${match[1]}:${match[2]}`;
};

/**
 * Validates the JSON returned by `public_programme()`. A malformed or partially deployed response
 * returns null so the pairings page keeps working instead of throwing; the database is the only
 * producer of this shape.
 */
export function mapPublicProgramme(value: unknown): PublicProgramme | null {
  if (!isRecord(value) || !Array.isArray(value.days) || !Array.isArray(value.players)) {
    return null;
  }

  const days: PublicTeeTimeDay[] = [];
  for (const rawDay of value.days) {
    if (!isRecord(rawDay)) return null;
    const dayNumber = rawDay.dayNumber;
    const label = rawDay.label;
    const playDate = rawDay.playDate;
    if (typeof dayNumber !== "number" || !Number.isInteger(dayNumber) || dayNumber < 1) return null;
    if (typeof label !== "string" || typeof playDate !== "string") return null;
    if (!Array.isArray(rawDay.players)) return null;

    const players: PublicTeeTimePlayer[] = [];
    for (const rawPlayer of rawDay.players) {
      if (!isRecord(rawPlayer)) return null;
      const name = typeof rawPlayer.name === "string" ? rawPlayer.name.trim() : "";
      if (name === "") return null;
      const time = timeOrNull(rawPlayer.teeTime);
      const confirmed = rawPlayer.confirmed === true && time !== null;
      const hole =
        confirmed &&
        typeof rawPlayer.startHole === "number" &&
        Number.isInteger(rawPlayer.startHole)
          ? rawPlayer.startHole
          : null;
      players.push({
        name,
        teeTime: confirmed ? time : null,
        startHole: confirmed ? hole : null,
        confirmed,
      });
    }
    players.sort((a, b) => {
      if (a.teeTime && b.teeTime) return a.teeTime.localeCompare(b.teeTime) || byName(a, b);
      if (a.teeTime) return -1;
      if (b.teeTime) return 1;
      return byName(a, b);
    });

    days.push({
      dayNumber,
      label,
      playDate,
      startTime: timeOrNull(rawDay.startTime),
      players,
    });
  }
  days.sort((a, b) => a.dayNumber - b.dayNumber);

  const players: PublicPlayerProfile[] = [];
  for (const rawPlayer of value.players) {
    if (!isRecord(rawPlayer)) return null;
    const name = typeof rawPlayer.name === "string" ? rawPlayer.name.trim() : "";
    if (name === "") return null;
    players.push({
      name,
      homeCourse: textOrNull(rawPlayer.homeCourse),
      index: indexOrNull(rawPlayer.index),
      category: textOrNull(rawPlayer.category),
      flight: textOrNull(rawPlayer.flight),
    });
  }
  players.sort(byName);

  return {
    days,
    players,
    rulesOfPlay: cleanPublicText(textOrNull(value.rulesOfPlay)),
  };
}
