import { describe, expect, it } from "vitest";
import { buildPreview, previewBlocksCommit, toCommitRows } from "./preview";
import type { MappingSuggestion, TournamentDayRef } from "./types";

const days: TournamentDayRef[] = [
  { dayNumber: 1, playDate: "2026-11-12", label: "Day 1", startTime: "06:30", isPlayingDay: true },
  { dayNumber: 2, playDate: "2026-11-13", label: "Day 2", startTime: null, isPlayingDay: true },
  { dayNumber: 3, playDate: "2026-11-14", label: "Day 3", startTime: null, isPlayingDay: true },
  { dayNumber: 4, playDate: "2026-11-15", label: "Day 4", startTime: null, isPlayingDay: true },
];

const mapping: MappingSuggestion = {
  mapping: {
    memberName: "MEMBER",
    guestName: "GUEST",
    gameDates: "GAME DATES",
    gender: "GENDER",
    birthdate: "DATE OF BIRTH",
    contactNumber: "CONTACT NO.",
    shirtSize: "T-shirt size",
    paymentStatus: "PAID",
  },
  confidence: {},
  reasons: {},
  unmappedHeaders: [],
  fixedMembershipType: null,
  source: "deterministic",
  notes: [],
};

const table = {
  headers: [
    "MEMBER",
    "GUEST",
    "GAME DATES",
    "GENDER",
    "DATE OF BIRTH",
    "CONTACT NO.",
    "T-shirt size",
    "PAID",
  ],
  rows: [
    ["Juan Dela Cruz", "Pedro Reyes", "Day 1 & 2", "M", "1/2/1980", "0917 111 2222", "L", "Yes"],
    ["Maria Santos", "", "Day 2 & 3", "F", "3/4/1985", "0918 222 3333", "M", "No"],
  ],
};

function build(overrides: Record<string, unknown> = {}) {
  return buildPreview(table, {
    fileName: "register.csv",
    worksheet: "CSV",
    fileSha256: "a".repeat(64),
    fileSize: 100,
    tournamentId: "t1",
    mapping,
    dateFormat: "mdy",
    days,
    dayRule: { required: null, max: null },
    existingPlayers: [],
    existingRegistrations: [],
    schemaReady: true,
    ...overrides,
  });
}

describe("buildPreview", () => {
  it("counts the member and guest rows separately and shows the days", () => {
    const preview = build();
    expect(preview.summary.total).toBe(3);
    expect(preview.summary.insert).toBe(3);
    expect(preview.summary.reject).toBe(0);
    expect(preview.summary.selectedDays).toBe(6);
    expect(preview.rows[0]?.days).toEqual([1, 2]);
    expect(preview.rows[2]?.days).toEqual([2, 3]);
  });

  it("blocks the commit when the database has not applied the model", () => {
    const preview = build({ schemaReady: false });
    expect(preview.schemaReady).toBe(false);
    expect(previewBlocksCommit(preview)).toBe(true);
    expect(preview.warnings.join(" ")).toContain("database update");
  });

  it("blocks the commit while a match still needs a decision", () => {
    const preview = build({
      existingPlayers: [
        {
          id: "p1",
          name: "Juan Dela Cruz",
          ngapId: null,
          birthdate: "1980-01-02",
          gender: "M",
          contactNumber: null,
          email: null,
        },
        {
          id: "p2",
          name: "Juan Dela Cruz",
          ngapId: null,
          birthdate: "1970-01-02",
          gender: "M",
          contactNumber: null,
          email: null,
        },
      ],
    });
    expect(preview.summary.needsDecision).toBeGreaterThan(0);
    expect(previewBlocksCommit(preview)).toBe(true);
  });

  it("accepts a decision that links to one candidate", () => {
    const first = build({
      existingPlayers: [
        {
          id: "p1",
          name: "Juan Dela Cruz",
          ngapId: null,
          birthdate: "1980-01-02",
          gender: "M",
          contactNumber: null,
          email: null,
        },
        {
          id: "p2",
          name: "Juan Dela Cruz",
          ngapId: null,
          birthdate: "1970-01-02",
          gender: "M",
          contactNumber: null,
          email: null,
        },
      ],
    });
    const row = first.rows.find((r) => r.name === "Juan Dela Cruz");
    expect(row).toBeDefined();
    const preview = build({
      existingPlayers: [
        {
          id: "p1",
          name: "Juan Dela Cruz",
          ngapId: null,
          birthdate: "1980-01-02",
          gender: "M",
          contactNumber: null,
          email: null,
        },
        {
          id: "p2",
          name: "Juan Dela Cruz",
          ngapId: null,
          birthdate: "1970-01-02",
          gender: "M",
          contactNumber: null,
          email: null,
        },
      ],
      decisions: { [row?.row ?? 0]: { action: "link", playerId: "p1" } },
    });
    expect(preview.summary.needsDecision).toBe(0);
    expect(previewBlocksCommit(preview)).toBe(false);
    expect(preview.rows.find((r) => r.name === "Juan Dela Cruz")?.linkPlayerId).toBe("p1");
  });
});

describe("toCommitRows", () => {
  it("sends a named projection, never the raw AI answer", () => {
    const preview = build();
    const rows = toCommitRows(preview.rows);
    expect(rows[0]).toMatchObject({
      row: 1,
      sourceRow: 2,
      action: "insert",
      name: "Juan Dela Cruz",
      membershipType: "member",
      days: [1, 2],
    });
    expect(rows[0]).not.toHaveProperty("sql");
  });
});
