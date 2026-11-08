/**
 * Writes an `ExportBook` as a styled Excel workbook, in the browser.
 *
 * exceljs is loaded on first use. Every sheet gets a title block, a frozen and filterable header,
 * A4 print setup that fits the width and repeats the header, and the same banding as the PDF.
 */
import type { ExportBook, ExportCell, ExportTable } from "@/lib/print/export-model";
import { uniqueSheetNames } from "@/lib/print/export-model";
import { XLSX_MIME } from "./download";

const FOREST = "FF104230";
const GOLD = "FFB9943E";
const BAND = "FFF3F6F2";
const MUTED = "FF606C66";
const WARN = "FF963C1E";

/**
 * A cell that starts with = + - @ would be read by Excel as a formula if it were typed in. Player
 * names come from sign-ups, so text is always written as a string cell (with the text number
 * format), which Excel never evaluates.
 */
export function cellValue(cell: ExportCell): string | number | null {
  if (cell === null) return null;
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  return cell;
}

export async function buildBookXlsx(book: ExportBook): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TeeLine Golf";
  workbook.title = `${book.eventName} · ${book.label}`;
  workbook.created = new Date();

  const names = uniqueSheetNames(book.tables.map((table) => table.sheetName));
  for (const [index, table] of book.tables.entries()) {
    addSheet(workbook, names[index] ?? `Sheet ${index + 1}`, book, table);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer as ArrayBuffer], { type: XLSX_MIME });
}

type Workbook = import("exceljs").Workbook;

function addSheet(workbook: Workbook, name: string, book: ExportBook, table: ExportTable): void {
  const sheet = workbook.addWorksheet(name, {
    pageSetup: {
      paperSize: 9,
      orientation: table.orientation ?? "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 },
    },
    headerFooter: {
      oddFooter: `&L&8${book.label} · ${book.status}&R&8Page &P of &N`.replace(
        /&(?![LRPN8])/g,
        "&&",
      ),
    },
  });
  const width = Math.max(1, table.columns.length);
  sheet.columns = table.columns.map((column) => ({ width: Math.max(6, column.width) }));

  let row = 1;
  const titleRow = sheet.getRow(row);
  titleRow.getCell(1).value = table.title;
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: FOREST } };
  row += 1;
  sheet.getRow(row).getCell(1).value = table.subtitle;
  sheet.getRow(row).getCell(1).font = { size: 10, color: { argb: MUTED } };
  row += 1;
  if (table.note) {
    const noteRow = sheet.getRow(row);
    noteRow.getCell(1).value = table.note;
    noteRow.getCell(1).font = { bold: true, size: 9, color: { argb: WARN } };
    row += 1;
  }
  row += 1;

  const headerRowNumber = row;
  const header = sheet.getRow(headerRowNumber);
  for (const [i, column] of table.columns.entries()) {
    const cell = header.getCell(i + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOREST } };
    cell.alignment = { vertical: "middle", horizontal: column.align ?? "left", wrapText: true };
  }
  header.height = 20;
  row += 1;

  const bands = table.bands;
  for (const [r, cells] of table.rows.entries()) {
    const excelRow = sheet.getRow(row + r);
    const band = bands?.[r] ?? 0;
    const lastOfBand = bands !== undefined && bands[r + 1] !== undefined && bands[r + 1] !== band;
    for (const [i, column] of table.columns.entries()) {
      const cell = excelRow.getCell(i + 1);
      const value = cellValue(cells[i] ?? null);
      // A string is written as a string cell, so "=SUM(...)" in a name is text, not a formula.
      cell.value = value;
      if (typeof value === "string") cell.numFmt = "@";
      cell.alignment = { vertical: "middle", horizontal: column.align ?? "left", wrapText: true };
      if (bands && band % 2 === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
      }
      cell.border = lastOfBand
        ? { bottom: { style: "thin", color: { argb: GOLD } } }
        : { bottom: { style: "hair", color: { argb: "FFD0D6D0" } } };
    }
  }

  sheet.views = [{ state: "frozen", ySplit: headerRowNumber, xSplit: 0 }];
  if (table.rows.length > 0) {
    sheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber + table.rows.length, column: width },
    };
  }
  sheet.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`;
}
