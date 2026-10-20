import { describe, expect, it } from "vitest";
import { parseAiMapping, suggestMapping, validateMapping } from "./mapping";

const headers = [
  "MEMBER",
  "GUEST",
  "GAME DATES",
  "GENDER",
  "DATE OF BIRTH",
  "WHS ID/HANDICAP",
  "CONTACT NO.",
  "EMAIL",
  "HOME COURSE",
  "T-shirt size",
  "PAID",
];

const samples = {
  MEMBER: ["Juan Dela Cruz", "Maria Santos"],
  GUEST: ["Pedro Reyes", ""],
  "GAME DATES": ["Day 1 & 2", "Nov 13-14"],
  GENDER: ["M", "F"],
  "DATE OF BIRTH": ["1/2/1980", "3/4/1985"],
  "WHS ID/HANDICAP": ["12.3", "5.1"],
  "CONTACT NO.": ["0917 123 4567", "0918 765 4321"],
  EMAIL: ["juan@example.com", "maria@example.com"],
  "HOME COURSE": ["IGCC", "IGCC"],
  "T-shirt size": ["L", "M"],
  PAID: ["Yes", "No"],
};

describe("suggestMapping", () => {
  it("maps the club's workbook columns, including member and guest names", () => {
    const result = suggestMapping(headers, { samples });
    expect(result.mapping.memberName).toBe("MEMBER");
    expect(result.mapping.guestName).toBe("GUEST");
    expect(result.mapping.gameDates).toBe("GAME DATES");
    expect(result.mapping.gender).toBe("GENDER");
    expect(result.mapping.birthdate).toBe("DATE OF BIRTH");
    expect(result.mapping.contactNumber).toBe("CONTACT NO.");
    expect(result.mapping.email).toBe("EMAIL");
    expect(result.mapping.homeCourse).toBe("HOME COURSE");
    expect(result.mapping.shirtSize).toBe("T-shirt size");
    expect(result.mapping.paymentStatus).toBe("PAID");
    expect(result.fixedMembershipType).toBeNull();
  });

  it("treats a lone MEMBER column of names as a name column and fixes the type", () => {
    const result = suggestMapping(["MEMBER", "GAME DATES"], {
      samples: { MEMBER: ["Juan Dela Cruz"], "GAME DATES": ["Day 1"] },
    });
    expect(result.mapping.memberName).toBe("MEMBER");
    expect(result.fixedMembershipType).toBe("member");
  });

  it("treats a MEMBER column of Yes/No values as the classification", () => {
    const result = suggestMapping(["PLAYER", "MEMBER"], {
      samples: { PLAYER: ["Juan Dela Cruz"], MEMBER: ["Yes", "No"] },
    });
    expect(result.mapping.name).toBe("PLAYER");
    expect(result.mapping.membershipType).toBe("MEMBER");
  });

  it("does not invent a column that is not there", () => {
    const result = suggestMapping(["NAME", "INDEX"]);
    expect(result.mapping.name).toBe("NAME");
    expect(result.mapping.handicap).toBe("INDEX");
    expect(result.mapping.email).toBeUndefined();
  });
});

describe("validateMapping", () => {
  it("accepts a mapping whose source columns exist", () => {
    const result = validateMapping(
      { name: "NAME", membershipType: "MEMBER" },
      ["NAME", "MEMBER"],
      null,
    );
    expect(result.ok).toBe(true);
    expect(result.mapping.name).toBe("NAME");
  });

  it("refuses a column that is not in the sheet", () => {
    const result = validateMapping({ name: "NOPE" }, ["NAME", "MEMBER"], null);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("not in this sheet");
  });

  it("refuses an unknown field", () => {
    const result = validateMapping(
      { name: "NAME", sql: "drop table players" },
      ["NAME", "MEMBER"],
      null,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("Unknown mapping field");
  });
});

describe("parseAiMapping", () => {
  it("accepts a valid proposal and ignores unknown confidence keys", () => {
    const result = parseAiMapping(
      {
        mapping: { name: "NAME", membershipType: "MEMBER" },
        confidence: { name: 0.9, nope: 0.5 },
        reasons: { name: "The header says name." },
        notes: ["Checked against the headers."],
      },
      ["NAME", "MEMBER"],
    );
    expect(result.ok).toBe(true);
    expect(result.suggestion?.mapping.name).toBe("NAME");
    expect(result.suggestion?.confidence.name).toBe(0.9);
  });

  it("rejects a proposal with SQL or an unexpected top-level key", () => {
    const result = parseAiMapping({ mapping: { name: "NAME" }, sql: "delete from players" }, [
      "NAME",
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("unexpected field");
  });

  it("rejects a proposal that maps a column that is not in the sheet", () => {
    const result = parseAiMapping({ mapping: { name: "GHOST" } }, ["NAME"]);
    expect(result.ok).toBe(false);
  });
});
