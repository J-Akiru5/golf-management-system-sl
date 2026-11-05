/**
 * The payload for `save_event_setup`, built per section.
 *
 * The Settings screen can save one section (Basics, Cut-off & handicap, Start & groups, Registration
 * fields, Course & tees, Categories, Flights) or all of them. The database function takes every
 * parameter as optional, where null means "leave it alone", so this pure mapping decides what a save
 * carries. Keeping it here means the adapter stays a thin call and the mapping can be tested without
 * a database.
 */

import type { StartFormat, Tee } from "@/lib/routing";
import { holesComplete, parProblem, strokeIndexProblem } from "./course-data";
import type { Hole, Tournament, TournamentRegistration } from "./types";

export type SetupSection =
  | "basics"
  | "playbook"
  | "rules"
  | "start"
  | "fields"
  | "course"
  | "categories"
  | "flights";

export const SETUP_SECTIONS: SetupSection[] = [
  "basics",
  "playbook",
  "rules",
  "start",
  "fields",
  "course",
  "categories",
  "flights",
];

export interface SetupPayload {
  p_course: { holes: number } | null;
  p_holes: { number: number; par: number; strokeIndex: number }[] | null;
  p_tees: { name: string; courseRating: number; slope: number; par: number }[] | null;
  p_categories:
    | {
        id: string;
        name: string;
        gender: string;
        minAge: number;
        maxAge: number | null;
        teeName: string;
      }[]
    | null;
  p_flights:
    | {
        id: string;
        categoryName: string;
        name: string;
        min: number;
        max: number;
      }[]
    | null;
  p_basics: {
    name: string;
    dates: string[];
    state: Tournament["state"];
    nameNeedsConfirmation: boolean;
    /** Organizer-written public rules. An empty string clears the stored text. */
    rulesOfPlay: string;
  } | null;
  p_rules: {
    cutoffDate: string;
    maxIndex: number;
    allowance: number;
    staleIndexDays: number;
    /** The database column uses snake case, the domain type does not. */
    flightBasis: "index" | "course_handicap";
    scheduleNeedsConfirmation: boolean;
  } | null;
  p_start: {
    startFormat: StartFormat;
    firstTeeTime: string;
    intervalMinutes: number;
    waveGapMinutes: number;
    groupSize: number;
    minGroupSize: number;
  } | null;
  p_registration: TournamentRegistration | null;
}

/** Narrows a hole to one carrying the two numbers the database column requires. */
const hasCard = (hole: Hole): hole is Hole & { par: number; strokeIndex: number } =>
  hole.par !== null && hole.strokeIndex !== null;

/** An id the database issued. */
const DATABASE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ids the database did not issue are left off, so the function inserts a fresh row and assigns its
 * own. The starter setup hands out ids like `cat-regular` (they come from the demo constants), and a
 * save that sent one would fail the function's `::uuid` cast instead of inserting.
 */
const databaseId = (id: string) => (DATABASE_ID.test(id) ? id : "");

/**
 * `sections` is either one section, several, or `"all"`. Saving the Start section also sends the
 * course's hole count, because that is where `config.holes` is stored today.
 */
export function setupPayload(
  tournament: Tournament,
  tees: Tee[],
  holes: Hole[],
  sections: SetupSection[] | "all",
): SetupPayload {
  const want = (section: SetupSection) => sections === "all" || sections.includes(section);
  const teeNameById = new Map(tees.map((tee) => [tee.id, tee.name]));
  const categoryNameById = new Map(
    tournament.categories.map((category) => [category.id, category.name]),
  );
  // A class ignores its carrier category now, so a row whose carrier is not one of this event's
  // categories is hung off the first one instead of being sent with a blank name. The database looks
  // the carrier up by name and refuses the whole section when it finds nothing.
  const carrierName = (categoryId: string) =>
    categoryNameById.get(categoryId) ?? tournament.categories[0]?.name ?? "";

  return {
    p_course: want("course") || want("start") ? { holes: tournament.config.holes } : null,
    // A hole card goes only as a whole, valid card: all 18 holes with a par the database accepts and
    // a stroke index, and no stroke index used twice. The column requires both numbers, so an
    // unfinished card used to be written with par 4 and the hole's own number as its stroke index —
    // numbers nobody had entered, which made a blank card look entered. Null means "leave the
    // stored card alone".
    p_holes:
      want("course") &&
      holesComplete(holes) &&
      strokeIndexProblem(holes) === null &&
      parProblem(holes) === null
        ? holes.filter(hasCard).map((hole) => ({
            number: hole.number,
            par: hole.par,
            strokeIndex: hole.strokeIndex,
          }))
        : null,
    p_tees: want("course")
      ? tees.map((tee) => ({
          name: tee.name,
          courseRating: tee.courseRating,
          slope: tee.slope,
          par: tee.par,
        }))
      : null,
    p_categories: want("categories")
      ? tournament.categories.map((category) => ({
          id: databaseId(category.id),
          name: category.name,
          gender: category.gender,
          minAge: category.minAge,
          maxAge: category.maxAge,
          teeName: teeNameById.get(category.teeId) ?? "",
        }))
      : null,
    p_flights: want("flights")
      ? tournament.flights.map((flight) => ({
          id: databaseId(flight.id),
          categoryName: carrierName(flight.categoryId),
          name: flight.name,
          min: flight.min,
          max: flight.max,
        }))
      : null,
    p_basics:
      want("basics") || want("playbook")
        ? {
            name: tournament.name,
            dates: tournament.dates,
            state: tournament.state,
            nameNeedsConfirmation: tournament.nameNeedsConfirmation,
            rulesOfPlay: tournament.rulesOfPlay ?? "",
          }
        : null,
    p_rules: want("rules")
      ? {
          cutoffDate: tournament.cutOffDate,
          maxIndex: tournament.config.maxIndex,
          allowance: tournament.config.allowance,
          staleIndexDays: tournament.staleIndexDays,
          flightBasis:
            tournament.config.flightBasis === "courseHandicap" ? "course_handicap" : "index",
          scheduleNeedsConfirmation: tournament.scheduleNeedsConfirmation,
        }
      : null,
    p_start: want("start")
      ? {
          startFormat: tournament.config.startFormat,
          firstTeeTime: tournament.config.firstTeeTime,
          intervalMinutes: tournament.config.intervalMinutes,
          waveGapMinutes: tournament.config.waveGapMinutes,
          groupSize: tournament.config.groupSize,
          minGroupSize: tournament.config.minGroupSize,
        }
      : null,
    p_registration: want("fields") ? tournament.registration : null,
  };
}
