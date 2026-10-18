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
import type { Hole, Tournament, TournamentRegistration } from "./types";

export type SetupSection =
  | "basics"
  | "rules"
  | "start"
  | "fields"
  | "course"
  | "categories"
  | "flights";

export const SETUP_SECTIONS: SetupSection[] = [
  "basics",
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

  return {
    p_course: want("course") || want("start") ? { holes: tournament.config.holes } : null,
    p_holes: want("course")
      ? holes.map((hole) => ({
          number: hole.number,
          // The column requires a par and a stroke index; a missing one is written as the hole's own
          // number (or par 4) and the readiness check keeps saying the card is not entered yet.
          par: hole.par ?? 4,
          strokeIndex: hole.strokeIndex ?? hole.number,
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
          id: category.id,
          name: category.name,
          gender: category.gender,
          minAge: category.minAge,
          maxAge: category.maxAge,
          teeName: teeNameById.get(category.teeId) ?? "",
        }))
      : null,
    p_flights: want("flights")
      ? tournament.flights.map((flight) => ({
          id: flight.id,
          categoryName: categoryNameById.get(flight.categoryId) ?? "",
          name: flight.name,
          min: flight.min,
          max: flight.max,
        }))
      : null,
    p_basics: want("basics")
      ? {
          name: tournament.name,
          dates: tournament.dates,
          state: tournament.state,
          nameNeedsConfirmation: tournament.nameNeedsConfirmation,
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
