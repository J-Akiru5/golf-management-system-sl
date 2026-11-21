/**
 * A tournament's rules as a saved preset.
 *
 * The owner's rule (21 Nov 2026): the standard must be easy to calibrate for different tournaments.
 * A preset holds every rule an event runs on, a new event starts from one, and any rule can then be
 * changed for that event. Applying a preset copies it into the event: the preset is never linked
 * live, so editing the event afterwards cannot change the preset and editing the preset cannot
 * change an event that already copied it.
 *
 * This module is the typed shape and its validation. It is pure: no I/O, no database. The database
 * repeats the same checks in `public.preset_settings_problem` (migration 20261123000400) so a
 * payload the desk builds is one the database accepts, and a malformed payload cannot be stored.
 *
 * What a preset does not hold: the calendar dates, the event name and state, entry questions and
 * contact wording. Those belong to one event, not to a standard.
 */

import type { CategoryRule, StartFormat, Tee } from "@/lib/routing";
import { TEE_COLOURS, type TeeColour } from "./concerns";
import type { Tournament } from "./types";

/** Who plays a tee marker. The club stores one tee row per marker, so a colour rated for both
 * genders is two rows, for example Blue and Ladies Red. */
export type PresetGender = "M" | "F" | "any";

export const PRESET_GENDER_LABELS: Record<PresetGender, string> = {
  M: "Men",
  F: "Women",
  any: "Everyone",
};

/** One tee row: the marker's colour and the rating numbers the handicap is worked out from. */
export interface PresetTee {
  /** The stored tee name, for example "Blue" or "Ladies Red". Categories point at it by name. */
  name: string;
  colour: TeeColour;
  gender: PresetGender;
  /** Course Rating from the club card, for example 69.6. */
  rating: number;
  slope: number;
  par: number;
}

/** One category: a gender and an inclusive age band, playing one tee. */
export interface PresetCategory {
  name: string;
  gender: PresetGender;
  minAge: number;
  maxAge: number | null;
  /** The tee this category plays, by name. Must name one of the preset's tees. */
  teeName: string;
}

/** One class (flight): an inclusive band of the event's class basis. */
export interface PresetFlight {
  name: string;
  min: number;
  max: number;
}

/**
 * One playing day's starts. The date is not part of a preset: a preset says how a day starts, not
 * which calendar day it is. Null means the day has no start of its own and the event's start applies.
 */
export interface PresetDay {
  dayNumber: number;
  label: string;
  /** "HH:MM" morning start of that day, or null to use the event's first tee time. */
  morning: string | null;
  /** "HH:MM" afternoon start of that day, or null to use the event's afternoon start. */
  afternoon: string | null;
}

export interface TournamentSettings {
  tees: PresetTee[];
  categories: PresetCategory[];
  flights: PresetFlight[];
  /** 1 = 100%. The database stores the fraction, for example 1 or 0.85. */
  allowance: number;
  /** The highest handicap index the event accepts. */
  maxIndex: number;
  /**
   * The most strokes an event hands out. The draw caps the playing handicap at this number.
   * The engine today caps at the highest index allowed, so the two are equal in practice; a preset
   * that sets them apart needs the handicap rule to read the cap (issue #342).
   */
  playingHandicapCap: number;
  /** Most players in one group. */
  groupSize: number;
  /** A group smaller than this is flagged for the organizer, not blocked. */
  minGroupSize: number;
  startFormat: StartFormat;
  /** "HH:MM" first tee time of the event. */
  firstTeeTime: string;
  /** "HH:MM" afternoon start of the event, or null to keep the club default. */
  afternoonStart: string | null;
  /** Minutes between two start times inside one session (the batch gap). */
  batchGapMinutes: number;
  /** Minutes between shotgun start times once every hole is full. */
  waveGapMinutes: number;
  days: PresetDay[];
}

export const PRESET_LIMITS = {
  name: 80,
  description: 400,
  teeName: 60,
  categoryName: 60,
  flightName: 40,
  dayLabel: 40,
  rating: { min: 50, max: 90 },
  slope: { min: 55, max: 155 },
  par: { min: 27, max: 80 },
  age: { min: 0, max: 120 },
  index: { min: 0, max: 54 },
  allowance: { min: 0.1, max: 1 },
  groupSize: { min: 2, max: 5 },
  minGroupSize: { min: 1, max: 5 },
  /** The gap between two start times inside one session. */
  gap: { min: 1, max: 240 },
  /** The gap between shotgun start times once every hole is full. A shotgun morning can be hours. */
  waveGap: { min: 1, max: 600 },
  /** The largest class basis a preset may cover. The event's own maximum index decides the top. */
  class: { min: 0, max: 54 },
} as const;

const CLOCK = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** The colour a stored tee name carries, or null when the name does not say one. */
export function teeColourOf(name: string): TeeColour | null {
  const lower = name.trim().toLowerCase();
  for (const colour of TEE_COLOURS) {
    const re = new RegExp(`\\b${colour}\\b`);
    if (re.test(lower)) return colour;
  }
  // "Ladies Red" and "Red ladies" both arrive above; a compound name like "Red/White" takes the
  // first colour it names, which is the order the club writes it in.
  for (const colour of TEE_COLOURS) {
    if (lower.includes(colour)) return colour;
  }
  return null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const number = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const integral = (value: number): boolean => Number.isInteger(value);

const clock = (value: unknown): string | null => {
  const raw = text(value);
  return CLOCK.test(raw) ? raw : null;
};

const gender = (value: unknown): PresetGender | null => {
  const raw = text(value);
  if (raw === "M" || raw === "F" || raw === "any") return raw;
  if (raw === "men" || raw === "male") return "M";
  if (raw === "women" || raw === "female" || raw === "ladies") return "F";
  if (raw === "" || raw === "both" || raw === "all") return "any";
  return null;
};

const inRange = (value: number, range: { min: number; max: number }): boolean =>
  value >= range.min && value <= range.max;

/** The result of reading a preset's settings: the typed rules, or the problems to show. */
export type PresetSettingsResult =
  | { ok: true; settings: TournamentSettings }
  | { ok: false; problems: string[] };

/**
 * Checks a stored or built payload and returns the typed settings.
 *
 * Every message names the value that is wrong and what a valid one looks like: the desk shows them
 * as they are, and the database raises its own version of the same first problem.
 */
export function readSettings(value: unknown): PresetSettingsResult {
  const problems: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, problems: ["The preset's settings are not readable."] };
  }

  // Tees ----------------------------------------------------------------------------------------
  const tees: PresetTee[] = [];
  const rawTees = Array.isArray(value.tees) ? value.tees : null;
  if (rawTees === null) problems.push("The preset has no list of tees.");
  for (const item of rawTees ?? []) {
    if (!isRecord(item)) {
      problems.push("One tee in the preset is not readable.");
      continue;
    }
    const name = text(item.name);
    const colour = text(item.colour);
    const who = gender(item.gender);
    const rating = number(item.rating);
    const slope = number(item.slope);
    const par = number(item.par);
    if (!name) {
      problems.push("A tee has no name.");
      continue;
    }
    if (name.length > PRESET_LIMITS.teeName) {
      problems.push(`The tee name "${name}" is longer than ${PRESET_LIMITS.teeName} characters.`);
    }
    if (!(TEE_COLOURS as readonly string[]).includes(colour)) {
      problems.push(`Tee "${name}" needs a colour: Blue, Silver, White or Red.`);
      continue;
    }
    if (who === null) {
      problems.push(`Tee "${name}" needs who plays it: Men, Women or Everyone.`);
      continue;
    }
    if (rating === null || !inRange(rating, PRESET_LIMITS.rating)) {
      problems.push(
        `Tee "${name}" needs a Course Rating between ${PRESET_LIMITS.rating.min} and ${PRESET_LIMITS.rating.max}.`,
      );
    }
    if (slope === null || !integral(slope) || !inRange(slope, PRESET_LIMITS.slope)) {
      problems.push(
        `Tee "${name}" needs a whole-number Slope between ${PRESET_LIMITS.slope.min} and ${PRESET_LIMITS.slope.max}.`,
      );
    }
    if (par === null || !integral(par) || !inRange(par, PRESET_LIMITS.par)) {
      problems.push(
        `Tee "${name}" needs a whole-number Par between ${PRESET_LIMITS.par.min} and ${PRESET_LIMITS.par.max}.`,
      );
    }
    tees.push({
      name,
      colour: colour as TeeColour,
      gender: who,
      rating: rating ?? 0,
      slope: slope ?? 0,
      par: par ?? 0,
    });
  }
  if (tees.length === 0 && rawTees !== null) problems.push("A preset needs at least one tee.");

  const teeNames = new Set<string>();
  const colourGenders = new Set<string>();
  for (const tee of tees) {
    const key = tee.name.toLowerCase();
    if (teeNames.has(key)) problems.push(`The tee name "${tee.name}" is used twice.`);
    teeNames.add(key);
    const marker = `${tee.colour}/${tee.gender}`;
    if (colourGenders.has(marker)) {
      problems.push(
        `${PRESET_GENDER_LABELS[tee.gender]} are given two tees in ${tee.colour}. Keep one row per colour and gender.`,
      );
    }
    colourGenders.add(marker);
  }

  // Categories ----------------------------------------------------------------------------------
  const categories: PresetCategory[] = [];
  const rawCategories = Array.isArray(value.categories) ? value.categories : null;
  if (rawCategories === null) problems.push("The preset has no list of categories.");
  for (const item of rawCategories ?? []) {
    if (!isRecord(item)) {
      problems.push("One category in the preset is not readable.");
      continue;
    }
    const name = text(item.name);
    const who = gender(item.gender);
    const minAge = number(item.minAge);
    const maxAgeRaw =
      item.maxAge === null || item.maxAge === undefined ? null : number(item.maxAge);
    const teeName = text(item.teeName);
    if (!name) {
      problems.push("A category has no name.");
      continue;
    }
    if (name.length > PRESET_LIMITS.categoryName) {
      problems.push(`The category name "${name}" is too long.`);
    }
    if (who === null) {
      problems.push(`Category "${name}" needs who it is for: Men, Women or Everyone.`);
      continue;
    }
    if (minAge === null || !integral(minAge) || !inRange(minAge, PRESET_LIMITS.age)) {
      problems.push(`Category "${name}" needs a whole-number starting age from 0 to 120.`);
    }
    if (item.maxAge !== null && item.maxAge !== undefined) {
      if (maxAgeRaw === null || !integral(maxAgeRaw) || !inRange(maxAgeRaw, PRESET_LIMITS.age)) {
        problems.push(`Category "${name}" needs a whole-number age limit, or none.`);
      } else if (minAge !== null && maxAgeRaw < minAge) {
        problems.push(`Category "${name}" ends before it starts.`);
      }
    }
    if (!teeName || !teeNames.has(teeName.toLowerCase())) {
      problems.push(
        `Category "${name}" names the tee "${teeName || "(none)"}", which is not in the preset.`,
      );
    }
    categories.push({
      name,
      gender: who,
      minAge: minAge ?? 0,
      maxAge: maxAgeRaw,
      teeName,
    });
  }
  if (categories.length === 0 && rawCategories !== null) {
    problems.push("A preset needs at least one category.");
  }

  // Two categories that can hold the same player at the same age are ambiguous, and the event
  // leaves that player for review rather than guessing. A preset is a standard, so it is refused.
  for (let i = 0; i < categories.length; i += 1) {
    const a = categories[i];
    if (!a) continue;
    for (let j = i + 1; j < categories.length; j += 1) {
      const b = categories[j];
      if (!b) continue;
      if (!samePlayerScope(a.gender, b.gender)) continue;
      const aTop = a.maxAge ?? Number.POSITIVE_INFINITY;
      const bTop = b.maxAge ?? Number.POSITIVE_INFINITY;
      if (a.minAge <= bTop && b.minAge <= aTop) {
        problems.push(`Categories "${a.name}" and "${b.name}" cover the same players.`);
      }
    }
  }

  // Classes -------------------------------------------------------------------------------------
  const flights: PresetFlight[] = [];
  const rawFlights = Array.isArray(value.flights) ? value.flights : [];
  for (const item of rawFlights) {
    if (!isRecord(item)) {
      problems.push("One class in the preset is not readable.");
      continue;
    }
    const name = text(item.name);
    const min = number(item.min);
    const max = number(item.max);
    if (!name) {
      problems.push("A class has no name.");
      continue;
    }
    if (min === null || !inRange(min, PRESET_LIMITS.class)) {
      problems.push(`Class "${name}" needs a starting value from 0 to 54.`);
      continue;
    }
    if (max === null || !inRange(max, PRESET_LIMITS.class)) {
      problems.push(`Class "${name}" needs an ending value from 0 to 54.`);
      continue;
    }
    if (max < min) {
      problems.push(`Class "${name}" ends before it starts.`);
      continue;
    }
    flights.push({ name, min, max });
  }
  for (let i = 0; i < flights.length; i += 1) {
    const a = flights[i];
    if (!a) continue;
    for (let j = i + 1; j < flights.length; j += 1) {
      const b = flights[j];
      if (!b) continue;
      if (a.min <= b.max && b.min <= a.max) {
        problems.push(`Classes "${a.name}" and "${b.name}" overlap.`);
      }
    }
  }

  // Rules ---------------------------------------------------------------------------------------
  const allowance = number(value.allowance);
  if (allowance === null || !inRange(allowance, PRESET_LIMITS.allowance)) {
    problems.push("The handicap allowance needs a value from 10% to 100%.");
  }
  const maxIndex = number(value.maxIndex);
  if (maxIndex === null || !inRange(maxIndex, PRESET_LIMITS.index)) {
    problems.push("The highest index allowed needs a value from 0 to 54.");
  }
  const cap = number(value.playingHandicapCap);
  if (cap === null || !integral(cap) || !inRange(cap, PRESET_LIMITS.index)) {
    problems.push("The playing-handicap cap needs a whole number of strokes from 0 to 54.");
  } else if (maxIndex !== null && cap > maxIndex) {
    problems.push("The playing-handicap cap cannot be above the highest index allowed.");
  }

  const groupSize = number(value.groupSize);
  if (groupSize === null || !integral(groupSize) || !inRange(groupSize, PRESET_LIMITS.groupSize)) {
    problems.push(
      `The group size needs a whole number from ${PRESET_LIMITS.groupSize.min} to ${PRESET_LIMITS.groupSize.max}.`,
    );
  }
  const minGroupSize = number(value.minGroupSize);
  if (
    minGroupSize === null ||
    !integral(minGroupSize) ||
    !inRange(minGroupSize, PRESET_LIMITS.minGroupSize)
  ) {
    problems.push(
      `The smallest group needs a whole number from ${PRESET_LIMITS.minGroupSize.min} to ${PRESET_LIMITS.minGroupSize.max}.`,
    );
  } else if (groupSize !== null && minGroupSize > groupSize) {
    problems.push("The smallest group cannot be larger than the group size.");
  }

  const startFormat = text(value.startFormat);
  if (startFormat !== "shotgun" && startFormat !== "two_tee") {
    problems.push("Choose a start format: shotgun or two-tee.");
  }

  const firstTeeTime = clock(value.firstTeeTime);
  if (firstTeeTime === null) problems.push('The first tee time needs a time such as "06:30".');

  const afternoonStart =
    value.afternoonStart === null || value.afternoonStart === undefined
      ? null
      : clock(value.afternoonStart);
  if (
    value.afternoonStart !== null &&
    value.afternoonStart !== undefined &&
    afternoonStart === null
  ) {
    problems.push('The afternoon start needs a time such as "12:30", or none.');
  }

  const batchGapMinutes = number(value.batchGapMinutes);
  if (
    batchGapMinutes === null ||
    !integral(batchGapMinutes) ||
    !inRange(batchGapMinutes, PRESET_LIMITS.gap)
  ) {
    problems.push("The batch gap needs a whole number of minutes from 1 to 240.");
  }
  const waveGapMinutes = number(value.waveGapMinutes);
  if (
    waveGapMinutes === null ||
    !integral(waveGapMinutes) ||
    !inRange(waveGapMinutes, PRESET_LIMITS.waveGap)
  ) {
    problems.push("The gap between start times needs a whole number of minutes from 1 to 600.");
  }

  // Days ----------------------------------------------------------------------------------------
  const days: PresetDay[] = [];
  const rawDays = Array.isArray(value.days) ? value.days : null;
  if (rawDays === null) problems.push("The preset has no list of playing days.");
  for (const item of rawDays ?? []) {
    if (!isRecord(item)) {
      problems.push("One playing day in the preset is not readable.");
      continue;
    }
    const dayNumber = number(item.dayNumber);
    const label = text(item.label) || (dayNumber !== null ? `Day ${dayNumber}` : "");
    if (dayNumber === null || !integral(dayNumber) || dayNumber < 1) {
      problems.push("A playing day needs a whole-number day number from 1.");
      continue;
    }
    if (label.length > PRESET_LIMITS.dayLabel)
      problems.push(`The day label "${label}" is too long.`);
    const morning =
      item.morning === null || item.morning === undefined ? null : clock(item.morning);
    if (item.morning !== null && item.morning !== undefined && morning === null) {
      problems.push(`Day ${dayNumber} needs a first start time such as "06:30", or none.`);
    }
    const afternoon =
      item.afternoon === null || item.afternoon === undefined ? null : clock(item.afternoon);
    if (item.afternoon !== null && item.afternoon !== undefined && afternoon === null) {
      problems.push(`Day ${dayNumber} needs an afternoon start time such as "12:30", or none.`);
    }
    days.push({ dayNumber, label, morning, afternoon });
  }
  if (days.length === 0 && rawDays !== null)
    problems.push("A preset needs at least one playing day.");
  const dayNumbers = new Set<number>();
  for (const day of days) {
    if (dayNumbers.has(day.dayNumber)) problems.push(`Day ${day.dayNumber} is listed twice.`);
    dayNumbers.add(day.dayNumber);
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    settings: {
      tees,
      categories,
      flights,
      allowance: allowance as number,
      maxIndex: maxIndex as number,
      playingHandicapCap: cap as number,
      groupSize: groupSize as number,
      minGroupSize: minGroupSize as number,
      startFormat: startFormat as StartFormat,
      firstTeeTime: firstTeeTime as string,
      afternoonStart,
      batchGapMinutes: batchGapMinutes as number,
      waveGapMinutes: waveGapMinutes as number,
      days,
    },
  };
}

/** True when two categories can describe the same player. */
function samePlayerScope(a: PresetGender, b: PresetGender): boolean {
  return a === b || a === "any" || b === "any";
}

/** The JSON a preset stores for its settings. Same shape as the typed object, plain values only. */
export function settingsJson(settings: TournamentSettings): Record<string, unknown> {
  return {
    tees: settings.tees.map((tee) => ({ ...tee })),
    categories: settings.categories.map((category) => ({ ...category })),
    flights: settings.flights.map((flight) => ({ ...flight })),
    allowance: settings.allowance,
    maxIndex: settings.maxIndex,
    playingHandicapCap: settings.playingHandicapCap,
    groupSize: settings.groupSize,
    minGroupSize: settings.minGroupSize,
    startFormat: settings.startFormat,
    firstTeeTime: settings.firstTeeTime,
    afternoonStart: settings.afternoonStart,
    batchGapMinutes: settings.batchGapMinutes,
    waveGapMinutes: settings.waveGapMinutes,
    days: settings.days.map((day) => ({ ...day })),
  };
}

/**
 * The settings an event runs on now, as a preset.
 *
 * Saving the current event is how the club keeps a standard after a live event. Nothing is guessed:
 * a tee whose name does not say one of the four colours stops the save with a message naming the
 * tee, because storing a colour nobody chose would be inventing data.
 */
export function settingsFromTournament(
  tournament: Tournament,
  tees: readonly Tee[],
): PresetSettingsResult {
  const problems: string[] = [];
  const categoriesByTee = new Map<string, CategoryRule[]>();
  for (const category of tournament.categories) {
    const list = categoriesByTee.get(category.teeId) ?? [];
    list.push(category);
    categoriesByTee.set(category.teeId, list);
  }

  const presetTees: PresetTee[] = [];
  for (const tee of tees) {
    const colour = teeColourOf(tee.name);
    if (colour === null) {
      problems.push(
        `Tee "${tee.name}" does not name one of the four colours (Blue, Silver, White, Red). Rename it in Course & tees before saving a preset.`,
      );
      continue;
    }
    const using = categoriesByTee.get(tee.id) ?? [];
    const presetGender: PresetGender = /ladies|women|woman/i.test(tee.name)
      ? "F"
      : using.length > 0 && using.every((category) => category.gender === "F")
        ? "F"
        : using.length > 0 && using.every((category) => category.gender === "M")
          ? "M"
          : "any";
    presetTees.push({
      name: tee.name.trim(),
      colour,
      gender: presetGender,
      rating: tee.courseRating,
      slope: tee.slope,
      par: tee.par,
    });
  }

  const teeNameById = new Map(tees.map((tee) => [tee.id, tee.name.trim()]));
  const categories: PresetCategory[] = tournament.categories.map((category) => ({
    name: category.name,
    gender: category.gender,
    minAge: category.minAge,
    maxAge: category.maxAge,
    teeName: teeNameById.get(category.teeId) ?? "",
  }));
  for (const category of categories) {
    if (!category.teeName) {
      problems.push(`Category "${category.name}" has no tee this event can save.`);
    }
  }

  const storedDays = tournament.days ?? [];
  const days: PresetDay[] = storedDays.length
    ? storedDays
        .filter((day) => day.isPlayingDay)
        .map((day) => ({
          dayNumber: day.dayNumber,
          label: day.label,
          morning: day.startTime ?? null,
          afternoon: day.pmStartTime ?? null,
        }))
    : tournament.dates.map((_, index) => ({
        dayNumber: index + 1,
        label: `Day ${index + 1}`,
        morning: index === 0 ? tournament.config.firstTeeTime : null,
        afternoon: null,
      }));

  const settings: TournamentSettings = {
    tees: presetTees,
    categories,
    flights: tournament.flights.map((flight) => ({
      name: flight.name,
      min: flight.min,
      max: flight.max,
    })),
    allowance: tournament.config.allowance,
    maxIndex: tournament.config.maxIndex,
    // The draw caps the playing handicap at the highest index allowed, so that is what the event
    // runs on today. A preset may set a lower cap once the handicap rule reads one.
    playingHandicapCap: tournament.config.maxIndex,
    groupSize: tournament.config.groupSize,
    minGroupSize: tournament.config.minGroupSize,
    startFormat: tournament.config.startFormat,
    firstTeeTime: tournament.config.firstTeeTime,
    afternoonStart: tournament.config.pmFirstTeeTime ?? null,
    batchGapMinutes: tournament.config.intervalMinutes,
    waveGapMinutes: tournament.config.waveGapMinutes,
    days,
  };

  if (problems.length > 0) return { ok: false, problems };
  return readSettings(settingsJson(settings));
}

export interface PresetLine {
  label: string;
  detail: string;
}

/** The rules in plain lines, for the preview and the confirm. */
export function settingsSummary(settings: TournamentSettings): PresetLine[] {
  const lines: PresetLine[] = [];
  const teesByGender = new Map<PresetGender, string[]>();
  for (const tee of settings.tees) {
    const list = teesByGender.get(tee.gender) ?? [];
    list.push(`${tee.name} ${tee.rating}/${tee.slope}/par ${tee.par}`);
    teesByGender.set(tee.gender, list);
  }
  const teeText = (["M", "F", "any"] as const)
    .filter((who) => (teesByGender.get(who) ?? []).length > 0)
    .map((who) => `${PRESET_GENDER_LABELS[who]}: ${(teesByGender.get(who) ?? []).join("; ")}`)
    .join(" · ");
  lines.push({ label: "Tees", detail: teeText || "None" });

  lines.push({
    label: "Categories",
    detail: settings.categories
      .map(
        (category) =>
          `${category.name} (${PRESET_GENDER_LABELS[category.gender]}, ${ageBand(category)}) on ${category.teeName}`,
      )
      .join(" · "),
  });

  lines.push({
    label: "Classes",
    detail:
      settings.flights
        .map((flight) => `${flight.name} ${flight.min} to ${flight.max}`)
        .join(" · ") || "No classes: players are filed by category only.",
  });

  lines.push({
    label: "Handicap",
    detail: `${allowancePercent(settings.allowance)} allowance, index limit ${settings.maxIndex}, playing handicap capped at ${settings.playingHandicapCap}`,
  });

  lines.push({
    label: "Groups",
    detail: `Up to ${settings.groupSize} players, a group below ${settings.minGroupSize} is flagged`,
  });

  lines.push({
    label: "Start",
    detail: `${settings.startFormat === "two_tee" ? "Two-tee start" : "Shotgun start"} from ${settings.firstTeeTime}${
      settings.afternoonStart ? `, afternoon from ${settings.afternoonStart}` : ""
    }, batches ${settings.batchGapMinutes} min apart, start times ${settings.waveGapMinutes} min apart`,
  });

  lines.push({
    label: "Days",
    detail: settings.days
      .map(
        (day) =>
          `${day.label} ${day.morning ?? "event start"} to ${day.afternoon ?? "event afternoon"}`,
      )
      .join(" · "),
  });

  return lines;
}

/** "0 to 59", "70 and over". */
export function ageBand(category: Pick<PresetCategory, "minAge" | "maxAge">): string {
  return category.maxAge === null
    ? `${category.minAge} and over`
    : `${category.minAge} to ${category.maxAge}`;
}

/** 1 as "100%", 0.85 as "85%". */
export function allowancePercent(allowance: number): string {
  return `${Math.round(allowance * 100)}%`;
}

/**
 * What applying a preset replaces, in plain lines. The confirm shows these before anything is
 * written, so the organizer knows what the event loses as well as what it gains.
 */
export function replacementLines(
  current: TournamentSettings,
  next: TournamentSettings,
  entries: number,
): string[] {
  const lines = [
    `Tees: ${current.tees.length} replaced by ${next.tees.length}`,
    `Categories: ${current.categories.length} replaced by ${next.categories.length}`,
    `Classes: ${current.flights.length} replaced by ${next.flights.length}`,
    `Handicap allowance and index limit: ${allowancePercent(current.allowance)} / ${current.maxIndex} becomes ${allowancePercent(next.allowance)} / ${next.maxIndex}`,
    `Group size: up to ${current.groupSize} becomes up to ${next.groupSize}`,
    `Start: ${current.startFormat} from ${current.firstTeeTime} becomes ${next.startFormat} from ${next.firstTeeTime}`,
    `Playing days: ${current.days.length} keeps its dates, with the start times from the preset`,
  ];
  if (entries > 0) {
    lines.push(
      `${entries} ${entries === 1 ? "entry is" : "entries are"} already filed. A category one of them uses is kept; a tee or class one of them still uses stops the replacement and names what is in the way.`,
    );
  }
  return lines;
}

/** One preset as the desk reads it. */
export interface SavedPreset {
  id: string;
  name: string;
  description: string | null;
  settings: TournamentSettings;
  createdAt: string;
  updatedAt: string;
}

/**
 * Reads one row of `public.tournament_presets`.
 *
 * A row whose settings no longer pass validation is returned with the problems instead of being
 * dropped, so the desk can say which preset needs attention rather than list a preset that cannot
 * be applied.
 */
export function readPresetRow(
  value: unknown,
): { ok: true; preset: SavedPreset } | { ok: false; problems: string[] } {
  if (!isRecord(value)) return { ok: false, problems: ["The preset row is not readable."] };
  const id = text(value.id);
  const name = text(value.name);
  if (!id || !name) return { ok: false, problems: ["The preset row has no id or name."] };
  const read = readSettings(value.settings);
  if (!read.ok) return { ok: false, problems: read.problems };
  return {
    ok: true,
    preset: {
      id,
      name,
      description: text(value.description) || null,
      settings: read.settings,
      createdAt: text(value.created_at),
      updatedAt: text(value.updated_at),
    },
  };
}

/** The message the migration-missing case produces, kept in one place for the card and its test. */
export const PRESETS_UNAVAILABLE =
  "Presets are available after the next database update (migration 20261123000400). Everything else on this screen works.";

/** Names the first database problem in plain words. */
export function presetProblemMessage(message: string): string {
  if (/tournament_presets|schema cache|does not exist/i.test(message)) return PRESETS_UNAVAILABLE;
  return message;
}
