import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryRule, FlightRule, Tee, TournamentConfig } from "@/lib/routing";
import type { Published } from "@/lib/store/desk-store";
import type { Database, Json } from "@/lib/supabase/types";
import { mapCategoryRow, mapFlightRow, mapTeeRow, mapTournamentConfig } from "./mappers";

type TournamentRow = Database["public"]["Tables"]["tournaments"]["Row"];

export interface TournamentContext {
  tournament: TournamentRow;
  config: TournamentConfig;
  tees: Tee[];
  categories: CategoryRule[];
  flights: FlightRule[];
  holes: { number: number; par: number; strokeIndex: number }[];
}

/** Picks the nearest upcoming event, or the most recent past event when none is upcoming. */
export function chooseActiveTournament(rows: TournamentRow[], today: string): TournamentRow | null {
  if (!rows.length) return null;
  const upcoming = rows
    .filter((row) => row.play_date >= today)
    .sort(
      (a, b) => a.play_date.localeCompare(b.play_date) || b.created_at.localeCompare(a.created_at),
    );
  if (upcoming[0]) return upcoming[0];
  return (
    [...rows].sort(
      (a, b) => b.play_date.localeCompare(a.play_date) || b.created_at.localeCompare(a.created_at),
    )[0] ?? null
  );
}

export async function loadTournamentContext(
  client: SupabaseClient<Database>,
  clubId: string,
  today = new Date().toISOString().slice(0, 10),
): Promise<TournamentContext> {
  const { data: tournaments, error: tournamentError } = await client
    .from("tournaments")
    .select("*")
    .eq("club_id", clubId)
    .order("play_date", { ascending: true });
  if (tournamentError) throw new Error(`Could not load tournaments: ${tournamentError.message}`);

  const tournament = chooseActiveTournament(tournaments ?? [], today);
  if (!tournament) throw new Error("No tournament has been set up for this club yet.");

  const { data: course, error: courseError } = await client
    .from("courses")
    .select("*")
    .eq("club_id", clubId)
    .eq("id", tournament.course_id)
    .single();
  if (courseError || !course) {
    throw new Error(`Could not load the tournament course: ${courseError?.message ?? "not found"}`);
  }

  const [teeResult, categoryResult, holeResult] = await Promise.all([
    client.from("tees").select("*").eq("club_id", clubId).eq("course_id", course.id).order("name"),
    client
      .from("categories")
      .select("*")
      .eq("club_id", clubId)
      .eq("tournament_id", tournament.id)
      .order("sort_order"),
    client
      .from("holes")
      .select("*")
      .eq("club_id", clubId)
      .eq("course_id", course.id)
      .order("number"),
  ]);
  if (teeResult.error) throw new Error(`Could not load course tees: ${teeResult.error.message}`);
  if (categoryResult.error) {
    throw new Error(`Could not load tournament categories: ${categoryResult.error.message}`);
  }
  if (holeResult.error) throw new Error(`Could not load course holes: ${holeResult.error.message}`);

  const categories = (categoryResult.data ?? []).map(mapCategoryRow);
  const categoryIds = categories.map((category) => category.id);
  let flights: FlightRule[] = [];
  if (categoryIds.length) {
    const { data: flightRows, error: flightError } = await client
      .from("flights")
      .select("*")
      .eq("club_id", clubId)
      .in("category_id", categoryIds)
      .order("min_value");
    if (flightError) throw new Error(`Could not load tournament flights: ${flightError.message}`);
    flights = (flightRows ?? []).map(mapFlightRow);
  }

  return {
    tournament,
    config: mapTournamentConfig(tournament, course),
    tees: (teeResult.data ?? []).map(mapTeeRow),
    categories,
    flights,
    holes: (holeResult.data ?? []).map((row) => ({
      number: row.number,
      par: row.par,
      strokeIndex: row.stroke_index,
    })),
  };
}

export async function saveTournamentConfig(
  client: SupabaseClient<Database>,
  clubId: string,
  tournamentId: string,
  config: TournamentConfig,
): Promise<void> {
  const { data, error } = await client
    .from("tournaments")
    .update({
      play_date: config.date,
      start_format: config.startFormat,
      first_tee_time: config.firstTeeTime,
      interval_minutes: config.intervalMinutes,
      wave_gap_minutes: config.waveGapMinutes,
      group_size: config.groupSize,
      min_group_size: config.minGroupSize,
      max_index: config.maxIndex,
      allowance: config.allowance,
      flight_basis: config.flightBasis === "courseHandicap" ? "course_handicap" : "index",
    })
    .eq("club_id", clubId)
    .eq("id", tournamentId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not save tournament settings: ${error.message}`);
  if (!data) throw new Error("The tournament was not found while saving settings.");
}

export async function saveTournamentPublication(
  client: SupabaseClient<Database>,
  clubId: string,
  tournamentId: string,
  published: Published | null,
): Promise<void> {
  if (
    published &&
    (!published.eventName || !published.date || !published.startFormat || !published.firstTeeTime)
  ) {
    throw new Error("The published copy is missing frozen tournament metadata.");
  }
  const { data, error } = await client
    .from("tournaments")
    .update({
      published: published !== null,
      published_snapshot: published ? (JSON.parse(JSON.stringify(published)) as Json) : null,
    })
    .eq("club_id", clubId)
    .eq("id", tournamentId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not save published pairings: ${error.message}`);
  if (!data) throw new Error("The tournament was not found while saving published pairings.");
}
