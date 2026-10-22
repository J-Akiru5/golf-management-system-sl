import { describe, expect, it } from "vitest";
import { normalizeRows, parseGender, parseMembership, parsePayment } from "./normalize";
import type { TournamentDayRef } from "./types";

const days: TournamentDayRef[] = [
  { dayNumber: 1, playDate: "2026-11-12", label: "Day 1", startTime: "06:30", isPlayingDay: true },
  { dayNumber: 2, playDate: "2026-11-13", label: "Day 2", startTime: null, isPlayingDay: true },
  { dayNumber: 3, playDate: "2026-11-14", label: "Day 3", startTime: null, isPlayingDay: true },
  { dayNumber: 4, playDate: "2026-11-15", label: "Day 4", startTime: null, isPlayingDay: true },
];

const headers = [
  "MEMBER",
  "GUEST",
  "GAME DATES",
  "GENDER",
  "DATE OF BIRTH",
  "CONTACT NO.",
  "T-shirt size",
  "PAID",
];

const mapping = {
  memberName: "MEMBER",
  guestName: "GUEST",
  gameDates: "GAME DATES",
  gender: "GENDER",
  birthdate: "DATE OF BIRTH",
  contactNumber: "CONTACT NO.",
  shirtSize: "T-shirt size",
  paymentStatus: "PAID",
};

describe("value parsers", () => {
  it("reads member and guest words", () => {
    expect(parseMembership("Member")).toBe("member");
    expect(parseMembership("G")).toBe("guest");
    expect(parseMembership("maybe")).toBeNull();
  });

  it("reads common gender words", () => {
    expect(parseGender("Male")).toBe("M");
    expect(parseGender("F")).toBe("F");
    expect(parseGender("x")).toBeNull();
  });

  it("reads payment status and amounts without inventing a status", () => {
    expect(parsePayment("Yes").status).toBe("paid");
    expect(parsePayment("No").status).toBe("unpaid");
    expect(parsePayment("1,500").status).toBe("paid");
    expect(parsePayment("1,500").amount).toBe(1500);
    expect(parsePayment("maybe").status).toBeNull();
  });
});

describe("normalizeRows", () => {
  it("expands a member + guest row into two players and does not copy the member's details to the guest", () => {
    const rows = normalizeRows(
      {
        headers,
        rows: [
          [
            "Juan Dela Cruz",
            "Pedro Reyes",
            "Day 1 & 2",
            "M",
            "1/2/1980",
            "0917 111 2222",
            "L",
            "Yes",
          ],
        ],
      },
      {
        mapping,
        fixedMembershipType: null,
        dateFormat: "mdy",
        days,
        dayRule: { required: 2, max: 2 },
        existingPlayers: [],
        existingRegistrations: [],
      },
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.name).toBe("Juan Dela Cruz");
    expect(rows[0]?.membershipType).toBe("member");
    expect(rows[0]?.birthdate).toBe("1980-01-02");
    expect(rows[0]?.gender).toBe("M");
    expect(rows[0]?.days).toEqual([1, 2]);
    expect(rows[0]?.action).toBe("insert");

    expect(rows[1]?.name).toBe("Pedro Reyes");
    expect(rows[1]?.membershipType).toBe("guest");
    expect(rows[1]?.birthdate).toBeNull();
    expect(rows[1]?.gender).toBeNull();
    expect(rows[1]?.days).toEqual([1, 2]);
    expect(rows[1]?.action).toBe("insert");
    expect(rows[1]?.issues.some((i) => i.message.includes("Needs review"))).toBe(true);
  });

  it("links a guest to an existing player without needing their birthdate again", () => {
    const rows = normalizeRows(
      {
        headers,
        rows: [["Juan Dela Cruz", "Pedro Reyes", "Day 1 & 2", "M", "1/2/1980", "", "L", ""]],
      },
      {
        mapping,
        fixedMembershipType: null,
        dateFormat: "mdy",
        days,
        dayRule: { required: null, max: null },
        existingPlayers: [
          {
            id: "p-pedro",
            name: "Pedro Reyes",
            ngapId: null,
            birthdate: "1975-01-01",
            gender: "M",
            contactNumber: null,
            email: null,
          },
        ],
        existingRegistrations: [],
      },
    );
    expect(rows[1]?.match.candidates[0]?.playerId).toBe("p-pedro");
    expect(rows[1]?.action).toBe("insert");
  });

  it("skips a player already registered in this event", () => {
    const rows = normalizeRows(
      { headers, rows: [["Juan Dela Cruz", "", "Day 1 & 2", "M", "1/2/1980", "", "L", ""]] },
      {
        mapping,
        fixedMembershipType: null,
        dateFormat: "mdy",
        days,
        dayRule: { required: null, max: null },
        existingPlayers: [
          {
            id: "p-juan",
            name: "Juan Dela Cruz",
            ngapId: null,
            birthdate: "1980-01-02",
            gender: "M",
            contactNumber: null,
            email: null,
          },
        ],
        existingRegistrations: [{ id: "r-juan", playerId: "p-juan" }],
      },
    );
    expect(rows[0]?.action).toBe("skip");
    expect(rows[0]?.existingRegistrationId).toBe("r-juan");
  });

  it("flags a repeated player instead of merging the rows silently", () => {
    const rows = normalizeRows(
      {
        headers,
        rows: [
          ["Juan Dela Cruz", "", "Day 1", "M", "1/2/1980", "", "L", ""],
          ["Juan Dela Cruz", "", "Day 2", "M", "1/2/1980", "", "L", ""],
        ],
      },
      {
        mapping,
        fixedMembershipType: null,
        dateFormat: "mdy",
        days,
        dayRule: { required: null, max: null },
        existingPlayers: [],
        existingRegistrations: [],
      },
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]?.requiresDecision).toBe(true);
    expect(rows[1]?.issues.some((i) => i.message.includes("more than once"))).toBe(true);
  });

  it("reports a day rule breach rather than trimming the days", () => {
    const rows = normalizeRows(
      {
        headers,
        rows: [["Juan Dela Cruz", "", "Day 1, 2 & 3", "M", "1/2/1980", "", "L", ""]],
      },
      {
        mapping,
        fixedMembershipType: null,
        dateFormat: "mdy",
        days,
        dayRule: { required: 2, max: 2 },
        existingPlayers: [],
        existingRegistrations: [],
      },
    );
    expect(rows[0]?.days).toEqual([1, 2, 3]);
    expect(rows[0]?.action).toBe("reject");
    expect(rows[0]?.issues.some((i) => i.message.includes("exactly 2"))).toBe(true);
  });

  it("reads separate day columns and applies the same day rule", () => {
    const rows = normalizeRows(
      {
        headers: [
          "PLAYER NAME",
          "PLAYER TYPE",
          "DAY 1",
          "DAY 2",
          "DAY 3",
          "DAY 4",
          "GENDER",
          "DATE OF BIRTH",
        ],
        rows: [["Juan Dela Cruz", "Member", "FALSE", "FALSE", "TRUE", "TRUE", "M", "1/2/1980"]],
      },
      {
        mapping: {
          name: "PLAYER NAME",
          membershipType: "PLAYER TYPE",
          gender: "GENDER",
          birthdate: "DATE OF BIRTH",
        },
        dayColumns: [
          { dayNumber: 1, header: "DAY 1" },
          { dayNumber: 2, header: "DAY 2" },
          { dayNumber: 3, header: "DAY 3" },
          { dayNumber: 4, header: "DAY 4" },
        ],
        fixedMembershipType: null,
        dateFormat: "mdy",
        days,
        dayRule: { required: 2, max: 4 },
        existingPlayers: [],
        existingRegistrations: [],
      },
    );

    expect(rows[0]?.days).toEqual([3, 4]);
    expect(rows[0]?.action).toBe("insert");
    expect(
      rows[0]?.issues.some((issue) => issue.field === "days" && issue.severity === "error"),
    ).toBe(false);
  });
});
