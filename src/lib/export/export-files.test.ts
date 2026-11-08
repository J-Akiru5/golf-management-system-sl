// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ExportBook } from "@/lib/print/export-model";
import { buildBookPdf, pdfSafe } from "./pdf";
import { buildBookXlsx } from "./xlsx-book";

const book: ExportBook = {
  eventName: "24th Bamboo Tee",
  label: "Start sheet · Day 3",
  status: "Draft · not published",
  tables: [
    {
      sheetName: "Day 3",
      title: "Start sheet",
      subtitle: "Saturday, 14 Nov 2026",
      columns: [
        { header: "Tee off", width: 10 },
        { header: "Player", width: 28 },
        { header: "HI", width: 6, align: "right" },
      ],
      rows: [
        ["6:30 AM", '=HYPERLINK("http://x","Click")', 12.4],
        ["6:30 AM", "Peña, Juan", null],
        ["6:40 AM", "Cruz, Ana", 9],
      ],
      bands: [1, 1, 2],
      orientation: "landscape",
      note: "PLACEHOLDER COURSE DATA.",
    },
    {
      sheetName: "Day 3",
      title: "Counts",
      subtitle: "x",
      columns: [{ header: "Class", width: 10 }],
      rows: [["A"]],
    },
  ],
};

async function bytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe("pdfSafe", () => {
  it("keeps Latin-1 letters and swaps anything the standard fonts cannot draw", () => {
    expect(pdfSafe("Peña")).toBe("Peña");
    expect(pdfSafe("Li林")).toBe("Li?");
    expect(pdfSafe("O’Neil")).toBe("O'Neil");
  });
});

describe("buildBookPdf", { timeout: 30_000 }, () => {
  it("writes a PDF with a page per table", async () => {
    const blob = await buildBookPdf(book);
    const head = new TextDecoder().decode((await bytes(blob)).slice(0, 5));
    expect(head).toBe("%PDF-");
    expect(blob.size).toBeGreaterThan(1500);
  });
});

describe("buildBookXlsx", { timeout: 30_000 }, () => {
  it("writes a styled workbook whose cells are text, not formulas", async () => {
    const blob = await buildBookXlsx(book);
    const data = await bytes(blob);
    expect(String.fromCharCode(data[0] ?? 0, data[1] ?? 0)).toBe("PK");

    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data.buffer as ArrayBuffer);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(["Day 3", "Day 3 (2)"]);

    const sheet = workbook.worksheets[0];
    expect(sheet?.getCell("A1").value).toBe("Start sheet");
    // Title, subtitle, note, blank row, then the header on row 5.
    expect(sheet?.getCell("A5").value).toBe("Tee off");
    expect(sheet?.views[0]).toMatchObject({ state: "frozen", ySplit: 5 });
    expect(sheet?.autoFilter).toBeTruthy();
    const injected = sheet?.getCell("B6").value;
    expect(typeof injected).toBe("string");
    expect(sheet?.getCell("C6").value).toBe(12.4);
    expect(sheet?.getCell("C7").value).toBeNull();
    expect(sheet?.getCell("B7").border?.bottom?.color?.argb).toBe("FFB9943E");
    expect(sheet?.pageSetup.orientation).toBe("landscape");
  });
});
