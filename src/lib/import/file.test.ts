import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv, parseWorkbook, parseXlsx, tableFromMatrix } from "./file";
import { suggestMapping } from "./mapping";

const fixture = readFileSync(path.join(import.meta.dirname, "__fixtures__", "registration.xlsx"));

describe("tableFromMatrix", () => {
  it("finds the header row below a title and keeps every data row", () => {
    const { table, warnings } = tableFromMatrix([
      ["24th Bamboo Tee"],
      ["MEMBER", "GUEST", "GAME DATES"],
      ["Juan Dela Cruz", "Pedro Reyes", "Day 1 & 2"],
    ]);
    expect(table.headers).toEqual(["MEMBER", "GUEST", "GAME DATES"]);
    expect(table.rows).toHaveLength(1);
    expect(warnings.join(" ")).toContain("row 2");
  });

  it("makes duplicate headers distinct instead of losing a column", () => {
    const { table } = tableFromMatrix([
      ["NAME", "NAME", "EMAIL"],
      ["Juan", "Maria", "j@example.com"],
    ]);
    expect(table.headers).toEqual(["NAME", "NAME (2)", "EMAIL"]);
  });
});

describe("parseCsv", () => {
  it("reads a quoted CSV and skips blank lines", () => {
    const parsed = parseCsv(
      Buffer.from('NAME,INDEX\n"Juan Dela Cruz",12.3\n\n"Maria Santos",5.1\n'),
    );
    expect(parsed.table.headers).toEqual(["NAME", "INDEX"]);
    expect(parsed.table.rows).toHaveLength(2);
    expect(parsed.table.rows[0]).toEqual(["Juan Dela Cruz", "12.3"]);
  });
});

describe("parseXlsx", () => {
  it("lists the worksheets and reads the selected one", async () => {
    const parsed = await parseXlsx(fixture, "Roster");
    expect(parsed.sheets).toEqual(["Roster", "Notes"]);
    expect(parsed.sheetName).toBe("Roster");
    expect(parsed.table.headers).toContain("MEMBER");
    expect(parsed.table.headers).toContain("GAME DATES");
    expect(parsed.table.rows).toHaveLength(2);
    const mapping = suggestMapping(parsed.table.headers, {
      samples: Object.fromEntries(
        parsed.table.headers.map((header) => [
          header,
          parsed.table.rows
            .slice(0, 2)
            .map((row) => row[parsed.table.headers.indexOf(header)] ?? ""),
        ]),
      ),
    });
    expect(mapping.mapping.memberName).toBe("MEMBER");
    expect(mapping.mapping.guestName).toBe("GUEST");
    expect(mapping.mapping.gameDates).toBe("GAME DATES");
    expect(mapping.mapping.handicap).toBe("WHS ID/HANDICAP");
  });

  it("refuses an unknown worksheet and names the ones that exist", async () => {
    await expect(parseXlsx(fixture, "Missing")).rejects.toThrow(/Roster, Notes/);
  });

  it("selects the first sheet by default and accepts a CSV through the same entry point", async () => {
    const xlsx = await parseWorkbook(fixture, "registration.xlsx");
    expect(xlsx.sheetName).toBe("Roster");
    const csv = await parseWorkbook(
      Buffer.from("NAME,MEMBER\nJuan Dela Cruz,Yes\n"),
      "register.csv",
    );
    expect(csv.sheetName).toBe("CSV");
    expect(csv.table.rows).toHaveLength(1);
  });
});
