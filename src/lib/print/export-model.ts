/**
 * What the print center exports, as plain tables.
 *
 * The PDF and the workbook are both written from these tables, so a day's start sheet, pairings and
 * counts say the same thing in the browser, on paper, in a PDF and in Excel. Nothing here touches
 * the DOM or a file: it reads the data the print center already holds and returns rows.
 */

import type { PublicPairingGroup, PublicPairings } from "@/lib/data/types";
import { fmtHcp, fmtIndex, fmtTime } from "@/lib/format";
import type { DayCountBlock, DayGroupBlock } from "./day-counts";
import { groupRowLabels, pairingsColumns } from "./pairings";
import { groupStartGroups, type PrintStartFormat } from "./start-sheet";

export type ExportCell = string | number | null;

export interface ExportColumn {
  header: string;
  /** Width in characters, the unit Excel uses. The PDF scales it to the page. */
  width: number;
  align?: "left" | "center" | "right";
}

export interface ExportTable {
  /** The worksheet tab. Unique in a book, at most 31 characters, none of []:*?/\ */
  sheetName: string;
  title: string;
  subtitle: string;
  columns: ExportColumn[];
  rows: ExportCell[][];
  /** One number per row. Rows that share a number are one group and share a band in the PDF. */
  bands?: number[];
  /** Each table starts on a new page in the PDF. */
  orientation?: "portrait" | "landscape";
  /** Text under the table, such as the course-data warning. */
  note?: string;
}

export interface ExportBook {
  eventName: string;
  /** A short label for what is in the book, e.g. "Start sheet · Day 3". */
  label: string;
  /** "Draft · not published" or "Published". Printed on every page. */
  status: string;
  tables: ExportTable[];
}

/** A printable group: the print center's own shape, restated so this module has no UI imports. */
export interface ExportGroup {
  number: number;
  startHole: number;
  time: string;
  flight: string;
  players: {
    name: string;
    teeName: string | null;
    handicapIndex: number | null;
    playingHandicap: number | null;
  }[];
}

export type CourseDataState = "official" | "placeholder" | "missing";

export function courseNote(state: CourseDataState): string | undefined {
  if (state === "placeholder") {
    return "PLACEHOLDER COURSE DATA. Playing handicaps use sample tee ratings. Confirm before using this sheet for an event.";
  }
  if (state === "missing") {
    return "COURSE DATA NOT ENTERED. Confirm tee and hole data before using this sheet.";
  }
  return undefined;
}

const SHEET_NAME_BAD = /[[\]:*?/\\]/g;

/** An Excel-safe tab name: no forbidden characters, at most 31, never empty, never a repeat. */
export function uniqueSheetNames(wanted: readonly string[]): string[] {
  const used = new Set<string>();
  return wanted.map((name) => {
    const base = (name.replace(SHEET_NAME_BAD, " ").replace(/\s+/g, " ").trim() || "Sheet").slice(
      0,
      31,
    );
    let candidate = base;
    for (let n = 2; used.has(candidate.toLowerCase()); n += 1) {
      const suffix = ` (${n})`;
      candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

/** "24th Bamboo Tee" becomes "24th-bamboo-tee": a file name that survives every operating system. */
export function slug(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "event"
  );
}

/**
 * `<event>_<what>_<day>[_<date>]`, so two days exported side by side never overwrite each other and
 * the folder sorts by event, then sheet, then day.
 */
export function exportFileName(input: {
  eventName: string;
  kind: string;
  dayLabel: string | null;
  playDate: string | null;
  extension: "pdf" | "xlsx";
}): string {
  const day = input.dayLabel ? slug(input.dayLabel) : "all-days";
  const parts = [slug(input.eventName), slug(input.kind), day];
  if (input.dayLabel && input.playDate) parts.push(input.playDate.slice(0, 10));
  return `${parts.join("_")}.${input.extension}`;
}

const sessionOf = (time: string): "AM" | "PM" => {
  const hour = Number(time.split(":")[0]);
  return Number.isFinite(hour) && hour >= 12 ? "PM" : "AM";
};

/** One day's start sheet: a row per player, with the group's tee time and hole on every row. */
export function startSheetTable(input: {
  eventName: string;
  dayLabel: string | null;
  dateLabel: string;
  startFormat: PrintStartFormat;
  groups: readonly ExportGroup[];
  course: CourseDataState;
}): ExportTable {
  const withPlayers = input.groups.filter((group) => group.players.length > 0);
  const sections = groupStartGroups(withPlayers, input.startFormat);
  const noun = input.startFormat === "shotgun" ? "Hole" : "Tee";
  const rows: ExportCell[][] = [];
  const bands: number[] = [];
  let band = 0;
  for (const section of sections) {
    for (const group of section.groups) {
      band += 1;
      for (const [index, player] of group.players.entries()) {
        rows.push([
          index === 0 ? fmtTime(group.time) : "",
          index === 0 ? sessionOf(group.time) : "",
          index === 0 ? group.startHole : "",
          index === 0 ? group.number : "",
          index === 0 ? group.flight : "",
          player.name,
          player.teeName ?? "",
          fmtIndex(player.handicapIndex),
          fmtHcp(player.playingHandicap),
        ]);
        bands.push(band);
      }
    }
  }
  const day = input.dayLabel ? `${input.dayLabel} · ` : "";
  return {
    sheetName: input.dayLabel ? `Start ${input.dayLabel}` : "Start sheet",
    title: `Start sheet${input.dayLabel ? ` · ${input.dayLabel}` : ""}`,
    subtitle: `${input.eventName} · ${day}${input.dateLabel} · ${withPlayers.length} groups · ${rows.length} players`,
    columns: [
      { header: "Time", width: 10 },
      { header: "AM/PM", width: 7, align: "center" },
      { header: noun, width: 6, align: "center" },
      { header: "Group", width: 7, align: "center" },
      { header: "Flight", width: 12 },
      { header: "Player", width: 34 },
      { header: "Tee", width: 9 },
      { header: "HI", width: 7, align: "right" },
      { header: "PH", width: 6, align: "right" },
    ],
    rows,
    bands,
    orientation: "portrait",
    note: courseNote(input.course),
  };
}

/** Which groups of a published list belong to one playing day. A one-day list returns itself. */
export function pairingsForDay(pairings: PublicPairings, dayNumber: number | null): PublicPairings {
  if (dayNumber === null || !pairings.days || pairings.days.length === 0) return pairings;
  const day = pairings.days.find((candidate) => candidate.dayNumber === dayNumber);
  const groups: PublicPairingGroup[] = day ? day.groups : [];
  return { ...pairings, groups, days: day ? [day] : [] };
}

/** The club's own pairing sheet: one table per start time, a row per group, a name per column. */
export function pairingTables(pairings: PublicPairings, dayLabel: string | null): ExportTable[] {
  const shotgun = pairings.startFormat === "shotgun";
  const noun = shotgun ? "HOLE" : "TEE";
  const sections = groupStartGroups(pairings.groups, pairings.startFormat);
  const columns = pairingsColumns(pairings.groups.map((group) => group.players.length));
  const day = dayLabel ? `${dayLabel} · ` : "";
  return sections.map((section) => {
    const labels = groupRowLabels(section.groups, noun);
    return {
      sheetName: `${dayLabel ? `${dayLabel.replace(/^Day /, "D")} ` : ""}${fmtTime(section.time)}`,
      title: `Pairings · ${day}${fmtTime(section.time)}`,
      subtitle: `${pairings.tournamentName} · ${pairings.dateLabel} · ${
        shotgun ? "Shotgun" : "Two-tee"
      } start · ${section.groups.length} groups`,
      columns: [
        { header: shotgun ? "Hole" : "Tee", width: 10 },
        ...Array.from({ length: columns }, (_, column) => ({
          header: `Player ${column + 1}`,
          width: 26,
        })),
      ],
      rows: section.groups.map((group, index) => [
        labels[index] ?? "",
        ...Array.from({ length: columns }, (_, column) => group.players[column]?.name ?? ""),
      ]),
      orientation: "landscape" as const,
    };
  });
}

/** Headcount per day: the summary, then every player with the session and tee-off they hold. */
export function countsTables(blocks: readonly DayCountBlock[]): ExportTable[] {
  const summary: ExportTable = {
    sheetName: "Summary",
    title: "Players by day",
    subtitle: "Morning, afternoon and not yet set, for every playing day",
    columns: [
      { header: "Day", width: 14 },
      { header: "Date", width: 12 },
      { header: "AM", width: 7, align: "right" },
      { header: "PM", width: 7, align: "right" },
      { header: "Not set", width: 9, align: "right" },
      { header: "Players", width: 9, align: "right" },
    ],
    rows: blocks.map((block) => [
      block.label,
      block.playDate ?? "",
      block.tally.am,
      block.tally.pm,
      block.tally.unset,
      block.tally.total,
    ]),
    orientation: "portrait",
  };
  const days = blocks.map((block) => ({
    sheetName: `${block.label} players`,
    title: `${block.label} · players`,
    subtitle: `${block.playDate ?? ""} · AM ${block.tally.am} · PM ${block.tally.pm} · not set ${block.tally.unset} · total ${block.tally.total}`,
    columns: [
      { header: "AM/PM", width: 9, align: "center" as const },
      { header: "Time", width: 11 },
      { header: "Start hole", width: 11, align: "center" as const },
      { header: "Player", width: 36 },
    ],
    rows: block.rows.map((row) => [
      row.session ?? "Not set",
      row.teeTime ? fmtTime(row.teeTime.slice(0, 5)) : "",
      row.startHole ?? "",
      row.name,
    ]),
    orientation: "portrait" as const,
  }));
  return [summary, ...days];
}

/** The same day split by tee-off group instead of by session. */
export function groupCountsTables(blocks: readonly DayGroupBlock[]): ExportTable[] {
  return blocks.map((block) => ({
    sheetName: `${block.label} groups`,
    title: `${block.label} · groups`,
    subtitle: `${block.playDate ?? ""} · ${block.groups.length} groups`,
    columns: [
      { header: "Group", width: 7, align: "center" as const },
      { header: "Time", width: 11 },
      { header: "Hole", width: 7, align: "center" as const },
      { header: "AM/PM", width: 8, align: "center" as const },
      { header: "Flight", width: 12 },
      { header: "Players", width: 60 },
    ],
    rows: block.groups.map((group) => [
      group.number,
      group.time ? fmtTime(group.time.slice(0, 5)) : "",
      group.startHole ?? "",
      group.session ?? "Not set",
      group.flight,
      group.players.map((player) => player.name).join(", "),
    ]),
    orientation: "landscape" as const,
  }));
}

/** Two nines and the totals, the way a paper card is cut. */
export interface ScorecardPage {
  title: string;
  subtitle: string;
  startLabel: string;
  flight: string;
  players: {
    name: string;
    teeName: string | null;
    handicapIndex: number | null;
    playingHandicap: number | null;
  }[];
  holes: { number: number; par: number | null; strokeIndex: number | null }[];
}

/** One card per non-empty group, with all 18 holes present even when course data is incomplete. */
export function scorecardPages(input: {
  eventName: string;
  dayLabel: string | null;
  dateLabel: string;
  startFormat: PrintStartFormat;
  groups: readonly ExportGroup[];
  holes: readonly { number: number; par: number | null; strokeIndex: number | null }[];
}): ScorecardPage[] {
  const byNumber = new Map(input.holes.map((hole) => [hole.number, hole]));
  const holes = Array.from(
    { length: 18 },
    (_, index) => byNumber.get(index + 1) ?? { number: index + 1, par: null, strokeIndex: null },
  );
  const noun = input.startFormat === "shotgun" ? "Hole" : "Tee";
  return groupStartGroups(
    input.groups.filter((group) => group.players.length > 0),
    input.startFormat,
  ).flatMap((section) =>
    section.groups.map((group) => ({
      title: input.eventName,
      subtitle: `${input.dayLabel ? `${input.dayLabel} · ` : ""}${input.dateLabel}`,
      startLabel: `${noun} ${group.startHole} · Group ${group.number} · ${fmtTime(group.time)}`,
      flight: group.flight,
      players: group.players,
      holes,
    })),
  );
}
