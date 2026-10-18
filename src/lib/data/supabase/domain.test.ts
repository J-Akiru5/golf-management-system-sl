import { describe, expect, it } from "vitest";
import type {
  HandicapRecordRow,
  PlayerRow,
  RegistrationRow,
  TournamentRow,
} from "@/lib/supabase/types";
import {
  joinName,
  splitName,
  toHandicapRecord,
  toPlayerInsert,
  toPlayerRecord,
  toRegistrationAnswers,
  toRegistrationEntry,
  toTournament,
  toTournamentRegistration,
} from "./domain";

const playerRow = (over: Partial<PlayerRow> = {}): PlayerRow => ({
  id: "player-1",
  club_id: "club-1",
  full_name: "Carmela Dela Cruz Reyes",
  birthdate: "1980-05-12",
  gender: "F",
  ngap_id: "NG-12",
  phone: "+63 900 000 0000",
  photo_path: "club-1/player-1/a.jpg",
  photo_consent_at: "2026-10-17T10:00:00Z",
  created_at: "2026-10-17T10:00:00Z",
  first_name: null,
  last_name: null,
  nickname: null,
  home_course: null,
  email: null,
  ...over,
});

describe("name handling", () => {
  it("splits on the last word and joins back losslessly", () => {
    expect(splitName("Carmela Dela Cruz Reyes")).toEqual({
      firstName: "Carmela Dela Cruz",
      lastName: "Reyes",
    });
    expect(splitName("Fe")).toEqual({ firstName: "Fe", lastName: "" });
    expect(joinName("Carmela Dela Cruz", "Reyes")).toBe("Carmela Dela Cruz Reyes");
  });
});

describe("toPlayerRecord", () => {
  it("prefers the structured name parts when the row has them", () => {
    const record = toPlayerRecord(playerRow({ first_name: "Carmela", last_name: "Reyes" }));
    expect(record.firstName).toBe("Carmela");
    expect(record.lastName).toBe("Reyes");
    // full_name stays the display name used on sheets.
    expect(record.name).toBe("Carmela Dela Cruz Reyes");
  });

  it("falls back to splitting the display name when parts are absent", () => {
    const record = toPlayerRecord(playerRow());
    expect(record.firstName).toBe("Carmela Dela Cruz");
    expect(record.lastName).toBe("Reyes");
  });

  it("never exposes a photo without recorded consent", () => {
    expect(toPlayerRecord(playerRow(), "https://signed.example/p.jpg").photo).toBe(
      "https://signed.example/p.jpg",
    );
    expect(toPlayerRecord(playerRow({ photo_consent_at: null }), "https://x/p.jpg").photo).toBe(
      undefined,
    );
  });

  it("leaves unknown fields null rather than inventing them", () => {
    const record = toPlayerRecord(playerRow({ ngap_id: null, phone: null }));
    expect(record.ngapId).toBeNull();
    expect(record.contactNumber).toBeNull();
    expect(record.homeCourse).toBeNull();
    expect(record.email).toBeNull();
  });
});

describe("toPlayerInsert", () => {
  it("round-trips a record through the row shape", () => {
    const record = toPlayerRecord(playerRow({ first_name: "Carmela", last_name: "Reyes" }));
    const insert = toPlayerInsert(record);
    expect(insert).toMatchObject({
      club_id: "club-1",
      full_name: "Carmela Dela Cruz Reyes",
      first_name: "Carmela",
      last_name: "Reyes",
      gender: "F",
    });
  });
});

describe("toHandicapRecord", () => {
  it("keeps NH as null instead of dropping the revision", () => {
    const row: HandicapRecordRow = {
      id: "rec-1",
      club_id: "club-1",
      player_id: "player-1",
      handicap_index: null,
      effective_date: "2026-10-01",
      source: "ngap_import",
      created_at: "2026-10-01T00:00:00Z",
    };
    expect(toHandicapRecord(row).index).toBeNull();
  });

  it("maps the manual source to the domain name", () => {
    const row: HandicapRecordRow = {
      id: "rec-2",
      club_id: "club-1",
      player_id: "player-1",
      handicap_index: 12.4,
      effective_date: "2026-10-01",
      source: "manual",
      created_at: "2026-10-01T00:00:00Z",
    };
    expect(toHandicapRecord(row)).toMatchObject({ index: 12.4, source: "manual_fix" });
  });
});

const registrationRow = (over: Partial<RegistrationRow> = {}): RegistrationRow => ({
  id: "reg-1",
  club_id: "club-1",
  tournament_id: "tournament-1",
  player_id: "player-1",
  status: "ok",
  reasons: [],
  frozen_index: 14.2,
  category_id: "regular",
  tee_id: "white",
  playing_handicap: 14,
  flight_id: "r-a",
  payment_status: "paid",
  answers: {},
  overridden: false,
  created_at: "2026-10-17T00:00:00Z",
  registered_by: "user-1",
  updated_at: "2026-10-17T00:00:00Z",
  updated_by: "user-1",
  frozen_record_id: "rec-1",
  frozen_effective_date: "2026-10-01",
  frozen_at: "2026-10-17T00:00:00Z",
  ...over,
});

describe("toRegistrationEntry", () => {
  it("reads the jsonb answers back into domain fields", () => {
    const entry = toRegistrationEntry(
      registrationRow({
        answers: {
          role: "guest",
          sponsor: true,
          shirt: "L",
          teePreferences: { "2026-11-12": "07:30" },
          declaredWshId: "WSH-9",
          declaredWshHandicap: "12.0",
          extra: { "cart-rental": "yes" },
        },
      }),
    );
    expect(entry).toMatchObject({
      role: "guest",
      sponsor: true,
      shirt: "L",
      teePreferences: { "2026-11-12": "07:30" },
      declaredWshId: "WSH-9",
      extra: { "cart-rental": "yes" },
      paymentStatus: "recorded_paid",
    });
  });

  it("defaults to member and no sponsor when answers are empty, without inventing values", () => {
    const entry = toRegistrationEntry(registrationRow());
    expect(entry.role).toBe("member");
    expect(entry.sponsor).toBeNull();
    expect(entry.shirt).toBeNull();
    expect(entry.extra).toEqual({});
  });

  it("carries the whole frozen index, not just the number", () => {
    expect(toRegistrationEntry(registrationRow()).frozen).toEqual({
      index: 14.2,
      recordId: "rec-1",
      effectiveDate: "2026-10-01",
      frozenAt: "2026-10-17T00:00:00Z",
    });
  });
});

describe("toRegistrationAnswers", () => {
  it("is the inverse of the jsonb read for the fields it owns", () => {
    const entry = toRegistrationEntry(
      registrationRow({ answers: { role: "guest", sponsor: false, shirt: "M" } }),
    );
    expect(toRegistrationAnswers(entry)).toMatchObject({
      role: "guest",
      sponsor: false,
      shirt: "M",
    });
  });
});

const tournamentRow = (over: Partial<TournamentRow> = {}): TournamentRow => ({
  id: "tournament-1",
  club_id: "club-1",
  course_id: "course-1",
  name: "Bamboo Tee (demo sample title)",
  play_date: "2026-11-12",
  cutoff_date: "2026-11-01",
  start_format: "shotgun",
  first_tee_time: "06:30:00",
  interval_minutes: 12,
  wave_gap_minutes: 300,
  group_size: 4,
  min_group_size: 3,
  max_index: 30,
  allowance: 1,
  flight_basis: "index",
  published: false,
  published_snapshot: null,
  created_at: "2026-10-01T00:00:00Z",
  dates: null,
  state: "open",
  name_needs_confirmation: true,
  schedule_needs_confirmation: true,
  stale_index_days: 120,
  registration: null,
  board_overrides: null,
  draw_revision: 0,
  ...over,
});

describe("toTournament", () => {
  it("falls back to a one-day schedule when dates is empty", () => {
    expect(toTournament(tournamentRow(), [], []).dates).toEqual(["2026-11-12"]);
  });

  it("keeps the full multi-day schedule and the confirmation flags", () => {
    const tournament = toTournament(tournamentRow({ dates: ["2026-11-12", "2026-11-13"] }), [], []);
    expect(tournament.dates).toEqual(["2026-11-12", "2026-11-13"]);
    expect(tournament.nameNeedsConfirmation).toBe(true);
    expect(tournament.scheduleNeedsConfirmation).toBe(true);
    expect(tournament.state).toBe("open");
  });
});

describe("toTournamentRegistration", () => {
  it("returns empty defaults rather than invented copy when the block is missing", () => {
    expect(toTournamentRegistration(null)).toMatchObject({
      responseEmail: "",
      sponsorQuestion: "",
      payment: null,
      teeTimes: [],
      shirtSizes: [],
      fields: [],
      instructions: null,
    });
  });

  it("reads the supplied block back", () => {
    const block = {
      responseEmail: "golf@example.org",
      sponsorQuestion: "Sponsored by?",
      payment: {
        method: "Bank transfer",
        bank: "BPI",
        accountName: "IGCC",
        accountNumber: "000-0",
        note: "Send the slip",
      },
      teeTimes: [
        {
          day: 1,
          label: "Day 1",
          date: "2026-11-12",
          options: ["06:30", "07:30"],
          needsConfirmation: true,
        },
      ],
      shirtSizes: ["M", "L"],
      fields: [],
      instructions: "Register at the pro shop",
    };
    const parsed = toTournamentRegistration(block);
    expect(parsed.responseEmail).toBe("golf@example.org");
    expect(parsed.payment?.bank).toBe("BPI");
    expect(parsed.teeTimes[0]).toMatchObject({ day: 1, needsConfirmation: true });
    expect(parsed.shirtSizes).toEqual(["M", "L"]);
  });
});
