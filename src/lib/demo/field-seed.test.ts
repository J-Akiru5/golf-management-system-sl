import { describe, expect, it } from "vitest";
import { type LocalFieldRow, makeFieldSeed, readLocalField } from "./field-seed";

// Made-up names only: the real field never goes into a test or into committed code.
const rows: LocalFieldRow[] = [
  {
    name: "ALPHA, ANNA MAE",
    index: 12.4,
    pair: 1,
    role: "member",
    days: [3, 4],
    sessions: { "3": "AM", "4": "PM" },
  },
  {
    name: "BETA, BEN",
    index: null,
    pair: 1,
    role: "guest",
    days: [3],
    sessions: { "3": "PM" },
  },
  {
    name: "DE LA GAMMA, CARLO-JOSE",
    index: 8,
    pair: null,
    role: "member",
    days: [1, 3, 3],
    sessions: { "1": "AM", "3": "AM" },
  },
];

const options = {
  clubId: "club",
  tournamentId: "t1",
  cutOffDate: "2026-11-11",
  now: "2026-10-20T09:00:00+08:00",
  homeCourse: "Home GC",
};

const encode = (value: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))));

describe("readLocalField", () => {
  it("answers null when the variable is not set, which is every deployed build", () => {
    expect(readLocalField(undefined)).toBeNull();
    expect(readLocalField("")).toBeNull();
  });

  it("reads a field written as base64 JSON, including accented names", () => {
    const field = readLocalField(encode([{ ...rows[0], name: "NUÑEZ, JOSÉ" }]));
    expect(field?.[0]?.name).toBe("NUÑEZ, JOSÉ");
    expect(field?.[0]?.sessions).toEqual({ "3": "AM", "4": "PM" });
  });

  it("answers null for anything it cannot read, so a bad file never breaks the demo", () => {
    expect(readLocalField("not base64 at all!!")).toBeNull();
    expect(readLocalField(encode({ not: "an array" }))).toBeNull();
    expect(readLocalField(encode([]))).toBeNull();
    expect(readLocalField(encode([{ name: "", role: "member" }]))).toBeNull();
  });

  it("drops a bad row and keeps the good ones, and cleans odd values", () => {
    const field = readLocalField(
      encode([
        {
          name: "OK, ONE",
          role: "member",
          index: "x",
          pair: 2.5,
          days: [1, "2", -3],
          sessions: { "1": "XX" },
        },
        { name: "BAD", role: "other" },
      ]),
    );
    expect(field).toEqual([
      { name: "OK, ONE", index: null, pair: null, role: "member", days: [1], sessions: {} },
    ]);
  });
});

describe("makeFieldSeed", () => {
  const seed = makeFieldSeed(rows, options);

  it("makes one player, one record and one entry per row", () => {
    expect(seed.players).toHaveLength(3);
    expect(seed.records).toHaveLength(3);
    expect(seed.entries).toHaveLength(3);
  });

  it("splits the sheet name into first and last and tidies the capitals", () => {
    expect(seed.players[0]).toMatchObject({ firstName: "Anna Mae", lastName: "Alpha" });
    expect(seed.players[2]).toMatchObject({ firstName: "Carlo-Jose", lastName: "De La Gamma" });
  });

  it("keeps the member and guest pair number and the roles", () => {
    expect(seed.entries.map((e) => [e.role, e.teamNo])).toEqual([
      ["member", 1],
      ["guest", 1],
      ["member", null],
    ]);
  });

  it("carries each player's own days and AM or PM, with each day listed once", () => {
    expect(seed.entries[0]).toMatchObject({
      selectedDays: [3, 4],
      daySessions: { 3: "AM", 4: "PM" },
    });
    expect(seed.entries[1]).toMatchObject({ selectedDays: [3], daySessions: { 3: "PM" } });
    expect(seed.entries[2]?.selectedDays).toEqual([1, 3]);
  });

  it("freezes the sheet's index and leaves a blank one blank", () => {
    expect(seed.entries[0]?.frozen.index).toBe(12.4);
    expect(seed.entries[1]?.frozen.index).toBeNull();
    expect(seed.entries[2]?.frozen.index).toBe(8);
  });

  it("gives everyone the same placeholder birthdate and gender, since the sheet has neither", () => {
    expect(new Set(seed.players.map((p) => p.birthdate)).size).toBe(1);
    expect(seed.players.every((p) => p.gender === "M")).toBe(true);
  });

  it("starts with no confirmed tee times and no photos or contact details", () => {
    expect(seed.entries.every((e) => Object.keys(e.dayTee ?? {}).length === 0)).toBe(true);
    expect(seed.players.every((p) => p.email === null && p.contactNumber === null)).toBe(true);
  });
});
