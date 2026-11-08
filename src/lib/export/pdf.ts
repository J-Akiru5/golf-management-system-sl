/**
 * Writes an `ExportBook` or a set of scorecards as a PDF, in the browser.
 *
 * jsPDF and its table plugin are loaded on first use, so the print center costs nothing until
 * someone presses Export. Only the PDF standard fonts are used: nothing is fetched, so the file
 * builds with the network off and no club data leaves the desk.
 */
import type { ExportBook, ExportCell, ExportTable, ScorecardPage } from "@/lib/print/export-model";

const FOREST: [number, number, number] = [16, 66, 48];
const GOLD: [number, number, number] = [185, 148, 62];
const INK: [number, number, number] = [30, 38, 34];
const MUTED: [number, number, number] = [96, 108, 102];
const BAND: [number, number, number] = [243, 246, 242];
const RULE: [number, number, number] = [208, 214, 208];

const MARGIN = 14;

/**
 * The PDF standard fonts cover Western European letters, not everything a player name can hold. A
 * character outside that set would print as garbage, so it is replaced rather than guessed at.
 */
export function pdfSafe(text: string): string {
  let out = "";
  for (const char of text.normalize("NFC")) {
    const code = char.codePointAt(0) ?? 63;
    out += code <= 0xff && (code >= 32 || code === 9) ? char : code === 0x2019 ? "'" : "?";
  }
  return out;
}

const cellText = (cell: ExportCell): string => (cell === null ? "" : pdfSafe(String(cell)));

type Doc = import("jspdf").jsPDF;
type AutoTable = (doc: Doc, options: Record<string, unknown>) => void;

async function load(): Promise<{ doc: (o: Record<string, unknown>) => Doc; autoTable: AutoTable }> {
  const [{ jsPDF }, tableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = (tableModule.default ?? tableModule.autoTable) as AutoTable;
  return { doc: (options) => new jsPDF(options), autoTable };
}

interface Logo {
  /** PNG data URL. */
  data: string;
  /** Width over height. */
  ratio: number;
}

/** Set by each builder before it draws, so every page header carries the same logo. */
let brandLogo: Logo | null = null;

/**
 * The reversed (light on dark) TeeLine logo as a PNG, because jsPDF cannot draw an SVG. It is read
 * from the app's own bundled files. Without a browser, or if the file will not load, the header
 * falls back to the word mark: a missing logo never stops an export.
 */
export async function loadLogo(): Promise<Logo | null> {
  if (typeof document === "undefined") return null;
  try {
    const reply = await fetch("/brand/teeline-horizontal-reverse.svg");
    if (!reply.ok) return null;
    const svg = await reply.text();
    // The file has a viewBox but no width or height, so its true ratio comes from the viewBox.
    const box = /viewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg);
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const ratio = box ? Number(box[1]) / Number(box[2]) : 3.75;
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = Math.round(1200 / ratio);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      return { data: canvas.toDataURL("image/png"), ratio };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

function pageHeader(doc: Doc, width: number, book: { eventName: string; status: string }): void {
  doc.setFillColor(...FOREST);
  doc.rect(0, 0, width, 11, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (brandLogo) {
    const height = 6.4;
    doc.addImage(brandLogo.data, "PNG", MARGIN, 2.3, height * brandLogo.ratio, height);
  } else {
    doc.setFont("helvetica", "bold");
    doc.text("TeeLine Golf", MARGIN, 7);
    doc.setFont("helvetica", "normal");
  }
  doc.text(pdfSafe(book.eventName), width - MARGIN, 7, { align: "right" });
}

/** "Page 2 of 5" and the status on every page, once the page count is known. */
function stamp(doc: Doc, book: { status: string; label: string }): void {
  const total = doc.getNumberOfPages();
  const generated = new Date().toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...RULE);
    doc.line(MARGIN, height - 11, width - MARGIN, height - 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(pdfSafe(`${book.label} · ${book.status}`), MARGIN, height - 6.5);
    doc.text(
      pdfSafe(`Printed ${generated} · Page ${page} of ${total}`),
      width - MARGIN,
      height - 6.5,
      {
        align: "right",
      },
    );
  }
}

function drawTable(doc: Doc, autoTable: AutoTable, book: ExportBook, table: ExportTable): void {
  const width = doc.internal.pageSize.getWidth();
  const usable = width - MARGIN * 2;
  const totalChars = table.columns.reduce((sum, column) => sum + column.width, 0);
  const columnStyles: Record<number, Record<string, unknown>> = {};
  for (const [index, column] of table.columns.entries()) {
    columnStyles[index] = {
      cellWidth: (column.width / totalChars) * usable,
      halign: column.align ?? "left",
    };
  }
  const bands = table.bands;
  let titleBottom = 0;

  pageHeader(doc, width, book);
  doc.setTextColor(...FOREST);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(pdfSafe(table.title), MARGIN, 19);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const subtitle = doc.splitTextToSize(pdfSafe(table.subtitle), usable) as string[];
  doc.text(subtitle, MARGIN, 25);
  titleBottom = 25 + subtitle.length * 4;
  if (table.note) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(150, 60, 30);
    const note = doc.splitTextToSize(pdfSafe(table.note), usable) as string[];
    doc.text(note, MARGIN, titleBottom + 1);
    titleBottom += note.length * 3.6 + 1;
  }

  autoTable(doc, {
    startY: titleBottom + 3,
    margin: { top: 16, left: MARGIN, right: MARGIN, bottom: 15 },
    head: [table.columns.map((column) => pdfSafe(column.header))],
    body: table.rows.map((row) => row.map(cellText)),
    columnStyles,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: { top: 1.7, bottom: 1.7, left: 2, right: 2 },
      textColor: INK,
      lineColor: RULE,
      lineWidth: { bottom: 0.15 },
      overflow: "linebreak",
    },
    headStyles: { fillColor: FOREST, textColor: [255, 255, 255], fontStyle: "bold", lineWidth: 0 },
    // A header on every page, and a row never split across two.
    showHead: "everyPage",
    rowPageBreak: "avoid",
    didParseCell: (data: {
      section: string;
      row: { index: number };
      cell: { styles: Record<string, unknown> };
    }) => {
      if (data.section !== "body" || !bands) return;
      const band = bands[data.row.index] ?? 0;
      if (band % 2 === 0) data.cell.styles.fillColor = BAND;
      const next = bands[data.row.index + 1];
      // A heavier rule where one group ends and the next begins.
      if (next !== undefined && next !== band) {
        data.cell.styles.lineWidth = { bottom: 0.4 };
        data.cell.styles.lineColor = GOLD;
      }
    },
    didDrawPage: (data: { pageNumber: number }) => {
      if (data.pageNumber > 1 || doc.getCurrentPageInfo().pageNumber > 1) {
        pageHeader(doc, width, book);
      }
    },
  });
}

/** An export book as a PDF: each table starts on its own page, in its own orientation. */
export async function buildBookPdf(book: ExportBook): Promise<Blob> {
  brandLogo = await loadLogo();
  const { doc: make, autoTable } = await load();
  const first = book.tables[0]?.orientation ?? "portrait";
  const doc = make({ unit: "mm", format: "a4", orientation: first, compress: true });
  doc.setProperties({ title: `${book.eventName} · ${book.label}`, creator: "TeeLine Golf" });
  for (const [index, table] of book.tables.entries()) {
    if (index > 0) doc.addPage("a4", table.orientation ?? "portrait");
    drawTable(doc, autoTable, book, table);
  }
  stamp(doc, book);
  return doc.output("blob");
}

const NINE = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];

/** One landscape page per group: the hole grid with a score row for each player. */
export async function buildScorecardsPdf(
  book: { eventName: string; label: string; status: string; note?: string },
  pages: readonly ScorecardPage[],
): Promise<Blob> {
  brandLogo = await loadLogo();
  const { doc: make, autoTable } = await load();
  const doc = make({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
  doc.setProperties({ title: `${book.eventName} · ${book.label}`, creator: "TeeLine Golf" });
  const width = doc.internal.pageSize.getWidth();
  const usable = width - MARGIN * 2;

  for (const [index, page] of pages.entries()) {
    if (index > 0) doc.addPage("a4", "landscape");
    pageHeader(doc, width, book);
    doc.setTextColor(...FOREST);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(pdfSafe(page.title), MARGIN, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(pdfSafe(`${page.subtitle} · ${page.flight}`), MARGIN, 25.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(pdfSafe(page.startLabel), width - MARGIN, 20, { align: "right" });
    if (book.note) {
      doc.setFontSize(8);
      doc.setTextColor(150, 60, 30);
      doc.text(pdfSafe(book.note), MARGIN, 30.5);
    }

    const holeOf = (n: number) => page.holes.find((hole) => hole.number === n);
    const sum = (numbers: number[], pick: (n: number) => number | null | undefined) => {
      const values = numbers.map(pick);
      return values.every((value) => typeof value === "number")
        ? String(values.reduce<number>((total, value) => total + (value as number), 0))
        : "";
    };
    const par = (n: number) => holeOf(n)?.par ?? null;
    const head = [
      "Player",
      ...NINE.map(String),
      "OUT",
      ...BACK.map(String),
      "IN",
      "TOT",
      "HCP",
      "NET",
    ];
    const rowOf = (
      label: string,
      pick: (n: number) => string,
      outTotal: string,
      inTotal: string,
      total: string,
    ) => [label, ...NINE.map(pick), outTotal, ...BACK.map(pick), inTotal, total, "", ""];
    const parOut = sum(NINE, par);
    const parIn = sum(BACK, par);
    const body: string[][] = [
      rowOf(
        "Par",
        (n) => String(par(n) ?? ""),
        parOut,
        parIn,
        parOut && parIn ? String(Number(parOut) + Number(parIn)) : "",
      ),
      rowOf("Stroke index", (n) => String(holeOf(n)?.strokeIndex ?? ""), "", "", ""),
      ...page.players.flatMap((player) => [
        [
          `${pdfSafe(player.name)}\n${player.teeName ? `${pdfSafe(player.teeName)} tee · ` : ""}HI ${
            player.handicapIndex === null ? "NH" : player.handicapIndex
          } · PH ${player.playingHandicap ?? "-"}`,
          ...Array.from({ length: 21 }, () => ""),
          player.playingHandicap === null ? "" : String(player.playingHandicap),
          "",
        ],
      ]),
    ];
    const first = 1 + 10 + 1;
    const columnStyles: Record<number, Record<string, unknown>> = {
      0: { cellWidth: 46, halign: "left" },
    };
    const remaining = usable - 46;
    for (let column = 1; column <= 24; column += 1) {
      const wide = column === 10 || column === 20 || column === 21;
      columnStyles[column] = {
        halign: "center",
        cellWidth: remaining / 24 + (wide ? 1.4 : -0.1),
      };
    }
    autoTable(doc, {
      startY: book.note ? 34 : 31,
      margin: { left: MARGIN, right: MARGIN, bottom: 16 },
      head: [head],
      body,
      columnStyles,
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 1.4,
        textColor: INK,
        lineColor: RULE,
        lineWidth: 0.2,
        valign: "middle",
      },
      headStyles: { fillColor: FOREST, textColor: [255, 255, 255], halign: "center" },
      didParseCell: (data: {
        section: string;
        row: { index: number };
        column: { index: number };
        cell: { styles: Record<string, unknown> };
      }) => {
        if (data.section !== "body") return;
        if (data.row.index < 2) {
          data.cell.styles.fillColor = BAND;
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.minCellHeight = 6;
        } else {
          data.cell.styles.minCellHeight = 14;
          if (data.column.index === 0) data.cell.styles.fontStyle = "bold";
        }
        if ([10, 20, 21].includes(data.column.index)) data.cell.styles.fillColor = [236, 241, 236];
        void first;
      },
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const signY =
      (doc as Doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;
    doc.text("Marker's signature: ______________________________", MARGIN, signY + 14);
    doc.text("Player's signature: ______________________________", MARGIN + usable / 2, signY + 14);
  }
  stamp(doc, book);
  return doc.output("blob");
}
