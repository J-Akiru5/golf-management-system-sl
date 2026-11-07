import { describe, expect, it } from "vitest";
import type {
  CategoryRow,
  CourseRow,
  GroupMemberRow,
  GroupRow,
  PlayerRow,
  PublicPairing,
  RegistrationRow,
  TournamentRow,
} from "@/lib/supabase/types";
import {
  mapCategoryRow,
  mapDrawGroups,
  mapPlayerRow,
  mapPublicPairingRows,
  mapPublishedSnapshot,
  mapTournamentConfig,
} from "./mappers";

const player: PlayerRow = {
  id: "player-1",
  club_id: "club-1",
  full_name: "Carmela Reyes",
  birthdate: "1980-05-12",
  gender: "F",
  ngap_id: "NG-12",
  phone: null,
  photo_path: "club-1/player-1/photo.jpg",
  photo_consent_at: "2026-10-17T10:00:00Z",
  first_name: null,
  last_name: null,
  nickname: null,
  home_course: null,
  email: null,
  user_id: null,
  created_at: "2026-10-17T10:00:00Z",
};

describe("database row mappers", () => {
  it("maps player fields and only exposes a consented private photo URL", () => {
    expect(mapPlayerRow(player, 14.2, { photoUrl: "https://signed.example/photo" })).toMatchObject({
      id: "player-1",
      name: "Carmela Reyes",
      gender: "F",
      index: 14.2,
      ngapId: "NG-12",
      photo: "https://signed.example/photo",
      photoConsent: true,
    });

    expect(
      mapPlayerRow({ ...player, photo_consent_at: null }, 14.2, { photoUrl: "url" }).photo,
    ).toBe(undefined);
  });

  it("keeps the pair a player was entered with, so the draw can hold the two together", () => {
    expect(mapPlayerRow(player, 14.2, { teamKey: "team-7" }).teamKey).toBe("team-7");
    expect(mapPlayerRow(player, 14.2).teamKey).toBe(null);
  });

  it("maps an event's database values without rounding or inventing tournament rules", () => {
    const tournament: TournamentRow = {
      id: "tournament-1",
      club_id: "club-1",
      course_id: "course-1",
      name: "October Medal",
      play_date: "2026-10-31",
      cutoff_date: "2026-10-25",
      start_format: "two_tee",
      first_tee_time: "07:12:00",
      interval_minutes: 12,
      wave_gap_minutes: 300,
      group_size: 4,
      min_group_size: 3,
      max_index: 30,
      allowance: 1,
      flight_basis: "course_handicap",
      published: false,
      published_snapshot: null,
      created_at: "2026-10-01T00:00:00Z",
      dates: ["2026-10-31", "2026-11-01"],
      state: "open",
      name_needs_confirmation: false,
      schedule_needs_confirmation: true,
      stale_index_days: 120,
      registration: null,
      board_overrides: null,
      draw_revision: 0,
    };
    const course: CourseRow = { id: "course-1", club_id: "club-1", name: "IGCC", holes: 18 };
    expect(mapTournamentConfig(tournament, course)).toEqual({
      date: "2026-10-31",
      maxIndex: 30,
      allowance: 1,
      flightBasis: "courseHandicap",
      startFormat: "two_tee",
      holes: 18,
      groupSize: 4,
      minGroupSize: 3,
      firstTeeTime: "07:12",
      intervalMinutes: 12,
      waveGapMinutes: 300,
    });
  });

  it("maps category gender and preserves nullable age limits", () => {
    const row: CategoryRow = {
      id: "ladies",
      club_id: "club-1",
      tournament_id: "tournament-1",
      tee_id: "red",
      name: "Ladies",
      gender: "F",
      min_age: 0,
      max_age: null,
      sort_order: 3,
    };
    expect(mapCategoryRow(row)).toEqual({
      id: "ladies",
      name: "Ladies",
      gender: "F",
      minAge: 0,
      maxAge: null,
      teeId: "red",
    });
  });

  it("rebuilds the draw in group and player position order", () => {
    const groups: GroupRow[] = [
      {
        id: "group-1",
        club_id: "club-1",
        tournament_id: "tournament-1",
        flight_id: "flight-1",
        number: 1,
        start_hole: 4,
        wave: "A",
        tee_time: "07:00:00",
        locked: true,
      },
    ];
    const members: GroupMemberRow[] = [
      { club_id: "club-1", group_id: "group-1", registration_id: "reg-2", position: 2 },
      { club_id: "club-1", group_id: "group-1", registration_id: "reg-1", position: 1 },
    ];
    const registrations: RegistrationRow[] = [
      {
        id: "reg-1",
        club_id: "club-1",
        tournament_id: "tournament-1",
        player_id: "player-1",
        status: "ok",
        reasons: [],
        frozen_index: 12,
        category_id: null,
        tee_id: null,
        playing_handicap: null,
        flight_id: null,
        payment_status: "unpaid",
        answers: {},
        overridden: false,
        created_at: "2026-10-17T00:00:00Z",
        registered_by: null,
        updated_at: "2026-10-17T00:00:00Z",
        updated_by: null,
        frozen_record_id: null,
        frozen_effective_date: null,
        frozen_at: "2026-10-17T00:00:00Z",
      },
      {
        id: "reg-2",
        club_id: "club-1",
        tournament_id: "tournament-1",
        player_id: "player-2",
        status: "ok",
        reasons: [],
        frozen_index: 15,
        category_id: null,
        tee_id: null,
        playing_handicap: null,
        flight_id: null,
        payment_status: "unpaid",
        answers: {},
        overridden: false,
        created_at: "2026-10-17T00:00:00Z",
        registered_by: null,
        updated_at: "2026-10-17T00:00:00Z",
        updated_by: null,
        frozen_record_id: null,
        frozen_effective_date: null,
        frozen_at: "2026-10-17T00:00:00Z",
      },
    ];
    const mapped = mapDrawGroups(groups, members, registrations);
    expect(mapped.draw[0]).toMatchObject({
      number: 1,
      playerIds: ["player-1", "player-2"],
      startHole: 4,
      time: "07:00",
      locked: true,
    });
    expect(mapped.groupIds).toEqual({ 1: "group-1" });
  });

  it("validates a stored published snapshot before exposing it", () => {
    expect(
      mapPublishedSnapshot({
        at: "2026-10-17T10:00:00Z",
        signature: "1:player-1",
        eventName: "October Medal",
        date: "2026-10-31",
        startFormat: "shotgun",
        firstTeeTime: "07:00",
        groups: [
          { number: 1, startHole: 1, wave: "A", time: "07:00", flight: "A", players: ["Carmela"] },
        ],
      }),
    ).toMatchObject({
      eventName: "October Medal",
      date: "2026-10-31",
      startFormat: "shotgun",
      firstTeeTime: "07:00",
      groups: [{ players: ["Carmela"] }],
    });
    expect(() => mapPublishedSnapshot({ groups: [] })).toThrow("snapshot is invalid");
  });

  it("keeps the day fields a snapshot carries and still reads one without them", () => {
    const withDays = mapPublishedSnapshot({
      at: "2026-10-17T10:00:00Z",
      signature: "1:player-1",
      eventName: "October Medal",
      date: "2026-10-31",
      startFormat: "shotgun",
      firstTeeTime: "07:00",
      groups: [
        {
          number: 1,
          dayNumber: 2,
          dayLabel: "Round 2",
          playDate: "2026-11-01",
          startHole: 1,
          wave: "A",
          time: "07:00",
          flight: "A",
          players: ["Carmela"],
        },
      ],
    });
    expect(withDays?.groups[0]).toMatchObject({
      dayNumber: 2,
      dayLabel: "Round 2",
      playDate: "2026-11-01",
    });

    const withoutDays = mapPublishedSnapshot({
      at: "2026-10-17T10:00:00Z",
      signature: "1:player-1",
      eventName: "October Medal",
      date: "2026-10-31",
      startFormat: "shotgun",
      firstTeeTime: "07:00",
      groups: [
        { number: 1, startHole: 1, wave: "A", time: "07:00", flight: "A", players: ["Carmela"] },
      ],
    });
    expect(withoutDays?.groups[0]).not.toHaveProperty("dayNumber");
    expect(withoutDays?.groups[0]?.number).toBe(1);
  });

  it("maps public RPC rows without exposing a live board", () => {
    const rows: PublicPairing[] = [
      {
        tournament_id: "tournament-1",
        tournament_name: "October Medal",
        play_date: "2026-10-31",
        start_format: "shotgun",
        first_tee_time: "07:00:00",
        published_at: "2026-10-17T10:00:00Z",
        version: 3,
        group_number: 1,
        wave: "A",
        start_hole: 1,
        tee_time: "07:00:00",
        flight_name: "Ladies A",
        player_id: "player-1",
        player_name: "Carmela Reyes",
        photo_path: "club-1/player-1.jpg",
      },
      {
        tournament_id: "tournament-1",
        tournament_name: "October Medal",
        play_date: "2026-10-31",
        start_format: "shotgun",
        first_tee_time: "07:00:00",
        published_at: "2026-10-17T10:00:00Z",
        version: 3,
        group_number: 1,
        wave: "A",
        start_hole: 1,
        tee_time: "07:00:00",
        flight_name: "Ladies A",
        player_id: "player-2",
        player_name: "Elena Tan",
        photo_path: null,
      },
    ];
    expect(mapPublicPairingRows(rows)).toMatchObject({
      name: "October Medal",
      date: "2026-10-31",
      startFormat: "shotgun",
      firstTeeTime: "07:00",
      published: {
        version: 3,
        groups: [{ players: ["Carmela Reyes", "Elena Tan"], playerIds: ["player-1", "player-2"] }],
      },
      photoByPlayerId: { "player-1": "club-1/player-1.jpg" },
    });
  });

  it("keeps two days' group number one apart and lists both days", () => {
    const rows: PublicPairing[] = [
      {
        tournament_id: "tournament-1",
        tournament_name: "October Medal",
        play_date: "2026-10-31",
        start_format: "shotgun",
        first_tee_time: "07:00:00",
        published_at: "2026-10-17T10:00:00Z",
        version: 3,
        group_number: 1,
        day_number: 1,
        day_label: "Round 1",
        wave: "A",
        start_hole: 1,
        tee_time: "07:00:00",
        flight_name: "Ladies A",
        player_id: "player-1",
        player_name: "Carmela Reyes",
        photo_path: null,
      },
      {
        tournament_id: "tournament-1",
        tournament_name: "October Medal",
        play_date: "2026-11-01",
        start_format: "shotgun",
        first_tee_time: "07:00:00",
        published_at: "2026-10-17T10:00:00Z",
        version: 3,
        group_number: 1,
        day_number: 2,
        day_label: "Round 2",
        wave: "A",
        start_hole: 1,
        tee_time: "07:00:00",
        flight_name: "Ladies A",
        player_id: "player-2",
        player_name: "Elena Tan",
        photo_path: null,
      },
    ];

    const mapped = mapPublicPairingRows(rows);
    expect(mapped?.published?.groups).toHaveLength(2);
    expect(mapped?.published?.groups?.map((group) => [group.dayNumber, group.number])).toEqual([
      [1, 1],
      [2, 1],
    ]);
    expect(mapped?.published?.groups?.[1]?.players).toEqual(["Elena Tan"]);
    expect(mapped?.days).toEqual([
      { dayNumber: 1, label: "Round 1", playDate: "2026-10-31" },
      { dayNumber: 2, label: "Round 2", playDate: "2026-11-01" },
    ]);
  });

  it("treats an old response without day columns as day one", () => {
    const rows: PublicPairing[] = [
      {
        tournament_id: "tournament-1",
        tournament_name: "October Medal",
        play_date: "2026-10-31",
        start_format: "shotgun",
        first_tee_time: "07:00:00",
        published_at: "2026-10-17T10:00:00Z",
        version: 3,
        group_number: 1,
        wave: "A",
        start_hole: 1,
        tee_time: "07:00:00",
        flight_name: "Ladies A",
        player_id: "player-1",
        player_name: "Carmela Reyes",
        photo_path: null,
      },
    ];

    const mapped = mapPublicPairingRows(rows);
    expect(mapped?.published?.groups?.[0]).toMatchObject({ number: 1, dayNumber: 1 });
    expect(mapped?.days).toEqual([{ dayNumber: 1, label: "Day 1", playDate: "2026-10-31" }]);
  });

  it("returns event metadata but no public list before publishing", () => {
    const row: PublicPairing = {
      tournament_id: "tournament-1",
      tournament_name: "October Medal",
      play_date: "2026-10-31",
      start_format: "shotgun",
      first_tee_time: "07:00:00",
      published_at: null,
      version: null,
      group_number: null,
      wave: null,
      start_hole: null,
      tee_time: null,
      flight_name: null,
      player_name: null,
    };
    expect(mapPublicPairingRows([row])).toMatchObject({
      name: "October Medal",
      published: null,
    });
  });
});
