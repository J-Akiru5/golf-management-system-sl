import { describe, expect, it } from "vitest";
import { buildImportPlan, nameKey, parseCsv, parseDate, parseIndex, suggestMapping } from "./index";
import type { ImportOptions, KnownPlayer } from "./types";

const known: KnownPlayer[] = [
  { id: "p1", fullName: "Juan P. Dela Cruz", ngapId: "1001" },
  { id: "p2", fullName: "Maria Santos", ngapId: null },
  { id: "p3", fullName: "Jose Reyes", ngapId: null },
  { id: "p4", fullName: "Jose Reyes", ngapId: null },
];

const opts = (over: Partial<ImportOptions> = {}): ImportOptions => ({
  mapping: { name: "Name", index: "Index", ngapId: "NGAP ID", effectiveDate: "Date" },
  dateFormat: "mdy",
  defaultEffectiveDate: "2026-11-01",
  ...over,
});

describe("parseIndex", () => {
  it("reads normal, comma and plus handicaps", () => {
    expect(parseIndex("14.2")).toEqual({ ok: true, value: 14.2 });
    expect(parseIndex("14,2")).toEqual({ ok: true, value: 14.2 });
    expect(parseIndex("+2.3")).toEqual({ ok: true, value: -2.3 });
    expect(parseIndex("0")).toEqual({ ok: true, value: 0 });
  });
  it("treats NH and blanks as no handicap", () => {
    for (const v of ["NH", "nh", "N/A", "", " "])
      expect(parseIndex(v)).toEqual({ ok: true, value: null });
  });
  it("rejects junk and out-of-range values", () => {
    expect(parseIndex("abc").ok).toBe(false);
    expect(parseIndex("54.1").ok).toBe(false);
    expect(parseIndex("14.25").ok).toBe(false);
  });
});

describe("parseDate", () => {
  it("never guesses slash dates", () => {
    expect(parseDate("03/04/2026", "mdy")).toEqual({ ok: true, value: "2026-03-04" });
    expect(parseDate("03/04/2026", "dmy")).toEqual({ ok: true, value: "2026-04-03" });
  });
  it("accepts ISO and rejects impossible dates", () => {
    expect(parseDate("2026-11-01", "mdy")).toEqual({ ok: true, value: "2026-11-01" });
    expect(parseDate("02/30/2026", "mdy").ok).toBe(false);
    expect(parseDate("13/01/2026", "mdy").ok).toBe(false);
    expect(parseDate("Nov 1", "mdy").ok).toBe(false);
  });
});

describe("nameKey", () => {
  it("ignores order, case, accents and punctuation", () => {
    expect(nameKey("DELA CRUZ, Juan P.")).toBe(nameKey("Juan P. Dela Cruz"));
    expect(nameKey("Peña, José")).toBe(nameKey("Jose Pena"));
  });
});

describe("suggestMapping", () => {
  it("finds common headers and reports what is missing", () => {
    const s = suggestMapping(["Player Name", "NGAP No.", "Handicap Index", "Revision Date"]);
    expect(s.mapping).toEqual({
      name: "Player Name",
      ngapId: "NGAP No.",
      index: "Handicap Index",
      effectiveDate: "Revision Date",
    });
    expect(s.missing).toEqual([]);
    expect(suggestMapping(["Surname", "Score"]).missing).toEqual(["name", "index"]);
  });
});

describe("parseCsv", () => {
  it("handles BOM, quoted commas and blank lines", () => {
    const f = parseCsv('﻿Name,Index\n"DELA CRUZ, Juan",14.2\n\nMaria Santos,8\n');
    expect(f.headers).toEqual(["Name", "Index"]);
    expect(f.rows).toHaveLength(2);
    expect(f.rows[0]?.Name).toBe("DELA CRUZ, Juan");
  });
});

describe("buildImportPlan", () => {
  const csv = (body: string) => parseCsv(`Name,NGAP ID,Index,Date\n${body}`);

  it("matches by NGAP ID first, then by name", () => {
    const plan = buildImportPlan(
      csv(
        "Dela Cruz Juan,1001,14.2,11/01/2026\nMaria Santos,,8.0,11/01/2026\nNew Golfer,2002,20,11/01/2026",
      ),
      known,
      opts(),
    );
    expect(plan.records.map((r) => [r.playerId, r.matchedBy])).toEqual([
      ["p1", "ngap_id"],
      ["p2", "name"],
      [null, "none"],
    ]);
    expect(plan.summary).toMatchObject({ total: 3, matched: 2, newPlayers: 1, errors: 0 });
  });

  it("refuses an ambiguous name instead of guessing", () => {
    const plan = buildImportPlan(csv("Jose Reyes,,10,11/01/2026"), known, opts());
    expect(plan.records).toHaveLength(0);
    expect(plan.errors[0]?.message).toContain("more than one player");
  });

  it("refuses a name match whose NGAP ID disagrees", () => {
    const plan = buildImportPlan(csv("Juan P. Dela Cruz,9999,14,11/01/2026"), known, opts());
    expect(plan.errors[0]?.message).toContain("Check before importing");
  });

  it("collects row errors without stopping the import", () => {
    const plan = buildImportPlan(
      csv("Maria Santos,,abc,11/01/2026\n,,5,11/01/2026\nJuan P. Dela Cruz,1001,12,11/01/2026"),
      known,
      opts(),
    );
    expect(plan.errors.map((e) => e.row)).toEqual([1, 2]);
    expect(plan.records).toHaveLength(1);
  });

  it("keeps the newest line when a golfer appears twice", () => {
    const plan = buildImportPlan(
      csv("Maria Santos,,9,10/01/2026\nMaria Santos,,8,11/01/2026"),
      known,
      opts(),
    );
    expect(plan.records).toHaveLength(1);
    expect(plan.records[0]?.index).toBe(8);
    expect(plan.warnings).toHaveLength(1);
  });

  it("counts no-handicap players and uses the default date when there is no date column", () => {
    const file = parseCsv("Name,Index\nMaria Santos,NH\nJuan P. Dela Cruz,+1.5");
    const plan = buildImportPlan(file, known, {
      mapping: { name: "Name", index: "Index" },
      dateFormat: "iso",
      defaultEffectiveDate: "2026-11-01",
    });
    expect(plan.summary.noHandicap).toBe(1);
    expect(plan.records[1]?.index).toBe(-1.5);
    expect(plan.records.every((r) => r.effectiveDate === "2026-11-01")).toBe(true);
  });

  it("fails loudly when a mapped column is not in the file", () => {
    expect(() => buildImportPlan(parseCsv("Name,Index\nA,1"), known, opts())).toThrow(/not found/);
  });
});

describe("parseCsv errors", () => {
  it("rejects a file with a single column instead of importing garbage", () => {
    expect(() => parseCsv("Name\nA\nB")).toThrow(/Could not read/);
  });
});
