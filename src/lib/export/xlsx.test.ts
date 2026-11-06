import { describe, expect, it } from "vitest";
import { buildXlsx, crc32, safeSheetName } from "./xlsx";

/** Reads the entries of a stored (uncompressed) zip back out, so the writer is checked end to end. */
function readStoredZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let central = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  for (let i = 0; i < count; i += 1) {
    expect(view.getUint32(central, true)).toBe(0x02014b50);
    const nameLength = view.getUint16(central + 28, true);
    const localOffset = view.getUint32(central + 42, true);
    const name = decoder.decode(bytes.subarray(central + 46, central + 46 + nameLength));
    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    const size = view.getUint32(localOffset + 22, true);
    const localName = view.getUint16(localOffset + 26, true);
    const start = localOffset + 30 + localName;
    files.set(name, decoder.decode(bytes.subarray(start, start + size)));
    central += 46 + nameLength;
  }
  return files;
}

describe("xlsx", () => {
  it("writes a workbook with every part Excel needs", () => {
    const bytes = buildXlsx([
      {
        name: "Summary",
        rows: [
          ["Day", "AM"],
          ["Day 1", 29],
        ],
      },
      {
        name: "By group",
        rows: [
          ["Group", "Players"],
          ["1", "A, B"],
        ],
      },
    ]);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);

    const files = readStoredZip(bytes);
    expect([...files.keys()].sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
    expect(files.get("xl/workbook.xml")).toContain('name="Summary"');
    expect(files.get("xl/workbook.xml")).toContain('name="By group"');
    expect(files.get("xl/worksheets/sheet1.xml")).toContain(
      '<c r="A2" t="inlineStr"><is><t xml:space="preserve">Day 1</t></is></c>',
    );
    expect(files.get("xl/worksheets/sheet1.xml")).toContain('<c r="B2"><v>29</v></c>');
    expect(files.get("xl/worksheets/sheet2.xml")).toContain(
      '<col min="2" max="2" width="20" customWidth="1"/>',
    );
  });

  it("escapes text so the XML stays well formed", () => {
    const files = readStoredZip(
      buildXlsx([{ name: "S", rows: [["Belen & Sons <pro>", 'say "hi"']] }]),
    );
    const sheet = files.get("xl/worksheets/sheet1.xml") ?? "";
    expect(sheet).toContain("Belen &amp; Sons &lt;pro&gt;");
    expect(sheet).toContain("say &quot;hi&quot;");
    expect(sheet).not.toContain("<pro>");
  });

  it("writes beyond column Z and past row 9", () => {
    const wide = Array.from({ length: 28 }, (_, index) => `c${index}`);
    const rows = Array.from({ length: 12 }, () => wide);
    const files = readStoredZip(buildXlsx([{ name: "Wide", rows }]));
    const sheet = files.get("xl/worksheets/sheet1.xml") ?? "";
    expect(sheet).toContain('<c r="AB1"');
    expect(sheet).toContain('<c r="A12"');
  });

  it("computes the standard CRC32 of a known string", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("keeps sheet names legal and unique", () => {
    expect(safeSheetName("By group/AM:PM*?", [])).toBe("By group AM PM");
    expect(safeSheetName("a".repeat(40), [])).toHaveLength(31);
    expect(safeSheetName("Summary", ["Summary"])).toBe("Summary (2)");
    expect(safeSheetName("Summary", ["Summary", "Summary (2)"])).toBe("Summary (3)");
  });
});
