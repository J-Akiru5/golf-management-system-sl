/**
 * Chooses what an export contains. The print center passes in the day scope it is showing, and this
 * returns the book for exactly that scope, so the file and the screen cannot disagree about the day.
 * Pure: no DOM, no files.
 */
import type { PublicPairings } from "@/lib/data/types";
import type { DayCountBlock, DayGroupBlock } from "./day-counts";
import {
  type CourseDataState,
  countsTables,
  type ExportBook,
  type ExportGroup,
  type ExportTable,
  exportFileName,
  groupCountsTables,
  pairingTables,
  type ScorecardPage,
  scorecardPages,
  startSheetTable,
} from "./export-model";
import type { PrintStartFormat } from "./start-sheet";

export type ExportKind = "start" | "counts" | "pairings" | "scorecards";

export const KIND_LABEL: Record<ExportKind, string> = {
  start: "Start sheet",
  counts: "Counts",
  pairings: "Pairings",
  scorecards: "Scorecards",
};

export interface BoardScope {
  dayNumber: number | null;
  dayLabel: string | null;
  playDate: string | null;
  /** The date line printed under the title, e.g. "Saturday, 14 Nov 2026". */
  dateLabel: string;
  groups: readonly ExportGroup[];
}

export interface PrintBookInput {
  kind: ExportKind;
  eventName: string;
  /** "Draft · not published" or "Published". */
  status: string;
  startFormat: PrintStartFormat;
  course: CourseDataState;
  /** One entry for a single day, one per playing day for "all days". */
  boards: readonly BoardScope[];
  /** The published list, already cut to the same days as `boards`. */
  pairingDays: readonly { dayLabel: string | null; pairings: PublicPairings }[];
  countBlocks: readonly DayCountBlock[];
  groupBlocks: readonly DayGroupBlock[];
  groupBy: "session" | "group";
  holes: readonly { number: number; par: number | null; strokeIndex: number | null }[];
}

export interface PrintBook {
  book: ExportBook;
  /** Set for scorecards: they are a card layout, so only the PDF writer can draw them. */
  scorecards: ScorecardPage[] | null;
  fileStem: { kind: string; dayLabel: string | null; playDate: string | null };
}

/** "Day 3" for one day, null for several. Drives the file name and the label. */
function scopeOf(boards: readonly BoardScope[]): {
  dayLabel: string | null;
  playDate: string | null;
} {
  const only = boards.length === 1 ? boards[0] : undefined;
  return { dayLabel: only?.dayLabel ?? null, playDate: only?.playDate ?? null };
}

export function buildPrintBook(input: PrintBookInput): PrintBook | null {
  const scope = scopeOf(input.boards);
  const label = `${KIND_LABEL[input.kind]} · ${scope.dayLabel ?? "All days"}`;
  const fileStem = { kind: KIND_LABEL[input.kind], ...scope };
  const book = (tables: ExportTable[]): ExportBook => ({
    eventName: input.eventName,
    label,
    status: input.status,
    tables,
  });

  if (input.kind === "start") {
    const tables = input.boards
      .filter((board) => board.groups.some((group) => group.players.length > 0))
      .map((board) =>
        startSheetTable({
          eventName: input.eventName,
          dayLabel: board.dayLabel,
          dateLabel: board.dateLabel,
          startFormat: input.startFormat,
          groups: board.groups,
          course: input.course,
        }),
      );
    return tables.length === 0 ? null : { book: book(tables), scorecards: null, fileStem };
  }

  if (input.kind === "pairings") {
    const tables = input.pairingDays.flatMap((day) => pairingTables(day.pairings, day.dayLabel));
    return tables.length === 0 ? null : { book: book(tables), scorecards: null, fileStem };
  }

  if (input.kind === "counts") {
    const tables =
      input.groupBy === "group"
        ? groupCountsTables(input.groupBlocks)
        : countsTables(input.countBlocks);
    const hasRows =
      input.groupBy === "group" ? input.groupBlocks.length > 0 : input.countBlocks.length > 0;
    return hasRows ? { book: book(tables), scorecards: null, fileStem } : null;
  }

  const scorecards = input.boards.flatMap((board) =>
    scorecardPages({
      eventName: input.eventName,
      dayLabel: board.dayLabel,
      dateLabel: board.dateLabel,
      startFormat: input.startFormat,
      groups: board.groups,
      holes: input.holes,
    }),
  );
  return scorecards.length === 0 ? null : { book: book([]), scorecards, fileStem };
}

export function printFileName(book: PrintBook, extension: "pdf" | "xlsx"): string {
  return exportFileName({
    eventName: book.book.eventName,
    kind: book.fileStem.kind,
    dayLabel: book.fileStem.dayLabel,
    playDate: book.fileStem.playDate,
    extension,
  });
}
