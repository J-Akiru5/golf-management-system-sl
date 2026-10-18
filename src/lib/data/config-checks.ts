import type { Tee } from "@/lib/routing";
import { matchCategories, matchFlights } from "@/lib/routing/classify";
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

  const pendingHoles = holes.filter((h) => h.par === null || h.strokeIndex === null).length;
  checks.push(
    pendingHoles > 0
      ? {
          id: "holes",
          level: "warn",
          label: `Course data pending (${pendingHoles} holes)`,
          detail:
            "Par and stroke index per hole are not entered. Scorecards print placeholders until the club scorecard is supplied.",
        }
      : { id: "holes", level: "ok", label: "Hole data entered", detail: `${holes.length} holes` },
  );
  checks.push({
    id: "tees",
    level: "warn",
    label: "Tee ratings are samples",
    detail:
      "Course Rating, Slope and Par in this demo are sample data, not IGCC's scorecard. Replace them before a real event.",
  });

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
    const twin = flights.find(
      (o) =>
        o.id !== f.id &&
        o.categoryId === f.categoryId &&
        f.min <= o.max &&
        o.min <= f.max &&
        !(f.max < o.min),
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
          label: "Flight ranges do not overlap",
          detail: `${flights.length} flights`,
        },
  );

  const gaps: string[] = [];
  for (const category of categories) {
    for (let value = 0; value <= config.maxIndex; value += 1) {
      if (matchFlights(flights, category.id, value).length === 0) {
        gaps.push(`${category.name} has no flight at index ${value}`);
        break;
      }
    }
  }
  checks.push(
    gaps.length > 0
      ? {
          id: "flights-gap",
          level: "warn",
          label: "Some handicaps have no flight",
          detail: `${gaps.join("; ")}. Those players wait for review rather than being guessed into a flight.`,
        }
      : {
          id: "flights-gap",
          level: "ok",
          label: "Every category has flights up to the maximum index",
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
          detail: `${tournament.registration.responseEmail} (shown as the response address only; no mail is sent by this demo).`,
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
        "Bank transfer details are shown to the desk. Nothing is charged, checked or confirmed by this demo.",
    });
  }

  return checks;
}
