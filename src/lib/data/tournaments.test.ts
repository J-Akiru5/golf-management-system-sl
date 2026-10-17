import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/types";
import { chooseActiveTournament } from "./tournaments";

type Tournament = Database["public"]["Tables"]["tournaments"]["Row"];

const makeTournament = (id: string, playDate: string, createdAt: string): Tournament => ({
  id,
  club_id: "club-1",
  course_id: "course-1",
  name: `Tournament ${id}`,
  play_date: playDate,
  cutoff_date: playDate,
  start_format: "shotgun",
  first_tee_time: "07:00:00",
  interval_minutes: 12,
  wave_gap_minutes: 300,
  group_size: 4,
  min_group_size: 3,
  max_index: 30,
  allowance: 1,
  flight_basis: "index",
  published: false,
  published_snapshot: null,
  created_at: createdAt,
});

describe("chooseActiveTournament", () => {
  it("chooses the nearest upcoming event, not the newest record", () => {
    const rows = [
      makeTournament("past", "2026-10-10", "2026-10-01T00:00:00Z"),
      makeTournament("later", "2026-12-10", "2026-10-02T00:00:00Z"),
      makeTournament("soon", "2026-11-10", "2026-10-01T00:00:00Z"),
    ];
    expect(chooseActiveTournament(rows, "2026-10-18")?.id).toBe("soon");
  });

  it("falls back to the most recent past event and returns null for no events", () => {
    const rows = [
      makeTournament("old", "2026-09-01", "2026-08-01T00:00:00Z"),
      makeTournament("recent", "2026-10-17", "2026-10-01T00:00:00Z"),
    ];
    expect(chooseActiveTournament(rows, "2026-10-18")?.id).toBe("recent");
    expect(chooseActiveTournament([], "2026-10-18")).toBeNull();
  });
});
