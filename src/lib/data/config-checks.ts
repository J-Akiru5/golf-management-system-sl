import type { Tee } from "@/lib/routing";
import { matchCategories, matchFlights } from "@/lib/routing/classify";
import { holesComplete, strokeIndexProblem } from "./course-data";
import type { Hole, Tournament } from "./types";

/**
 * Readiness checks for one tournament. Pure, so the setup wizard and the tests see the same list.
 * Levels: ok (fine), warn (needs a human eye), bad (blocks a correct draw).
 */
export interface ConfigCheck {
  id: string;
  level: "ok" | "warn" | "bad";
  label: string;
  detail: string;
}

const AGE_PROBES = [
  { gender: "M" as const, age: 35 },
  { gender: "M" as const, age: 64 },
  { gender: "M" as const, age: 75 },
  { gender: "F" as const, age: 45 },
  { gender: "F" as const, age: 72 },
];

export function checkTournament(tournament: Tournament, tees: Tee[], holes: Hole[]): ConfigCheck[] {
  const checks: ConfigCheck[] = [];
  const { config, categories, flights } = tournament;

  checks.push(
    tournament.nameNeedsConfirmation
      ? {
          id: "name",
          level: "warn",
          label: "Event name needs confirmation",
          detail: `“${tournament.name}” is a sample title until the organizer confirms it.`,
        }
      : { id: "name", level: "ok", label: "Event name set", detail: tournament.name },
  );

  const firstDay = tournament.dates[0];
  checks.push(
    !firstDay
      ? { id: "dates", level: "bad", label: "No date of play", detail: "Set at least one day." }
      : tournament.cutOffDate > (firstDay ?? "")
        ? {
            id: "dates",
            level: "bad",
            label: "Cut-off is after the first day",
            detail: "The index should be frozen before play starts.",
          }
        : {
            id: "dates",
            level: tournament.scheduleNeedsConfirmation ? "warn" : "ok",
            label: "Dates and cut-off set",
            detail: `Plays ${tournament.dates.join(", ")} · cut-off ${tournament.cutOffDate}${
              tournament.scheduleNeedsConfirmation
                ? " (sample dates, confirm with the organizer)"
                : ""
            }`,
          },
  );

  const siProblem = strokeIndexProblem(holes);
  const pendingHoles = holes.filter((h) => h.par === null || h.strokeIndex === null).length;
  const missingHoles = holes.length === 0 ? 18 : pendingHoles;
  checks.push(
    siProblem
      ? { id: "holes", level: "bad", label: "Stroke index is not valid", detail: siProblem }
      : missingHoles > 0 || !holesComplete(holes)
        ? {
            id: "holes",
            level: "warn",
            label: `Hole data not entered (${missingHoles} holes)`,
            detail:
              "Par and stroke index per hole are not entered. Scorecards leave them blank and say so until the club scorecard is supplied.",
          }
        : { id: "holes", level: "ok", label: "Hole data entered", detail: `${holes.length} holes` },
  );
  checks.push(
    tees.length === 0
      ? {
          id: "tees",
          level: "bad",
          label: "No tees are set up",
          detail: "Without a Course Rating, Slope and Par no playing handicap can be worked out.",
        }
      : tournament.courseDataConfirmed
        ? {
            id: "tees",
            level: "ok",
            label: "Course data confirmed",
            detail: "An owner or organizer checked the tees and holes against the club scorecard.",
          }
        : {
            id: "tees",
            level: "warn",
            label: "Course data not confirmed",
            detail:
              "The tees and holes have not been confirmed against the club scorecard. Printed sheets carry a placeholder mark until they are.",
          },
  );

  for (const category of categories) {
    const tee = tees.find((t) => t.id === category.teeId);
    if (!tee) {
      checks.push({
        id: `tee-${category.id}`,
        level: "bad",
        label: `${category.name} has no tee`,
        detail: `Tee ${category.teeId} is not set up, so nothing can be routed for this category.`,
      });
    }
  }

  const uncovered = AGE_PROBES.filter(
    (p) => matchCategories(categories, p.gender, p.age).length === 0,
  );
  checks.push(
    uncovered.length > 0
      ? {
          id: "categories",
          level: "warn",
          label: "Some players have no category",
          detail: `${uncovered.map((p) => `${p.gender} age ${p.age}`).join(", ")} match no category. Nothing is guessed; those players wait for review.`,
        }
      : {
          id: "categories",
          level: "ok",
          label: "Categories cover the field",
          detail: `${categories.length} categories`,
        },
  );

  const overlaps: string[] = [];
  for (const f of flights) {
    // One set of classes covers the whole field, so every class is compared with every other one.
    const twin = flights.find(
      (o) => o.id !== f.id && f.min <= o.max && o.min <= f.max && !(f.max < o.min),
    );
    if (twin) overlaps.push(`${f.name} overlaps ${twin.name}`);
  }
  checks.push(
    overlaps.length > 0
      ? {
          id: "flights-overlap",
          level: "bad",
          label: "Flight ranges overlap",
          detail: [...new Set(overlaps)].join("; "),
        }
      : {
          id: "flights",
          level: "ok",
          label: "Class ranges do not overlap",
          detail: `${flights.length} classes`,
        },
  );

  const gaps: string[] = [];
  for (let value = 0; value <= config.maxIndex; value += 1) {
    if (matchFlights(flights, value).length === 0) {
      gaps.push(`No class covers index ${value}`);
      break;
    }
  }
  checks.push(
    gaps.length > 0
      ? {
          id: "flights-gap",
          level: "warn",
          label: "Some handicaps have no class",
          detail: `${gaps.join("; ")}. Those players wait for review rather than being guessed into a class.`,
        }
      : {
          id: "flights-gap",
          level: "ok",
          label: "Every class covers up to the maximum index",
          detail: `Limit ${config.maxIndex}`,
        },
  );

  checks.push(
    config.groupSize < 2 || config.minGroupSize < 2 || config.minGroupSize > config.groupSize
      ? {
          id: "groups",
          level: "bad",
          label: "Group sizes are inconsistent",
          detail: `Most ${config.groupSize}, smallest ${config.minGroupSize}.`,
        }
      : {
          id: "groups",
          level: "ok",
          label: "Group sizes set",
          detail: `Up to ${config.groupSize} players, groups below ${config.minGroupSize} are flagged.`,
        },
  );

  const day4 = tournament.registration.teeTimes.find((d) => d.needsConfirmation);
  checks.push(
    day4
      ? {
          id: "day4",
          level: "warn",
          label: "A supplied tee time still needs confirmation",
          detail: `${day4.label} offers “${day4.options.join("” or “")}” exactly as supplied. Do not assume a different time.`,
        }
      : { id: "day4", level: "ok", label: "All tee-time choices confirmed", detail: "" },
  );

  checks.push(
    tournament.registration.responseEmail
      ? {
          id: "email",
          level: "ok",
          label: "Response email on file",
          detail: `${tournament.registration.responseEmail} (shown as the response address only; TeeLine sends no mail).`,
        }
      : {
          id: "email",
          level: "warn",
          label: "No response email",
          detail: "Add the address registrations should be answered from.",
        },
  );

  if (tournament.registration.payment) {
    checks.push({
      id: "payment",
      level: "warn",
      label: "Payment is manual",
      detail:
        "Bank transfer details are shown to the desk. Nothing is charged, checked or confirmed by TeeLine.",
    });
  }

  return checks;
}
