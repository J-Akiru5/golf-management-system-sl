import type { SupabaseClient } from "@supabase/supabase-js";
import { type DeskMember, getDeskMember } from "@/lib/auth/member";
import type { DeskPlayer } from "@/lib/demo/data";
import type { DrawGroup } from "@/lib/draw/validate";
import type { CategoryRule, FlightRule, Tee, TournamentConfig } from "@/lib/routing";
import { route } from "@/lib/routing";
import type { Published } from "@/lib/store/desk-store";
import type { Database } from "@/lib/supabase/types";
import { loadTournamentGroups } from "./groups";
import { countImportedHandicapRecords } from "./handicap-records";
import { mapDrawGroups, mapPublishedSnapshot } from "./mappers";
import { loadTournamentPlayers } from "./players";
import { loadTournamentRegistrations } from "./registrations";
import { loadTournamentContext } from "./tournaments";

export interface LoadedDesk {
  clubId: string;
  tournamentId: string;
  cutoffDate: string;
  member: DeskMember;
  name: string;
  config: TournamentConfig;
  players: DeskPlayer[];
  draw: DrawGroup[] | null;
  drawWarnings: string[];
  published: Published | null;
  importedCount: number;
  tees: Tee[];
  categories: CategoryRule[];
  flights: FlightRule[];
  holes: { number: number; par: number; strokeIndex: number }[];
  photoPaths: Record<string, string | null>;
}

export async function loadDesk(client: SupabaseClient<Database>): Promise<LoadedDesk> {
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) throw new Error("Sign in to load the tournament desk.");

  const member = await getDeskMember(client, authData.user.id);
  const context = await loadTournamentContext(client, member.clubId);
  const registrations = await loadTournamentRegistrations(
    client,
    member.clubId,
    context.tournament.id,
  );
  const { players, photoPaths } = await loadTournamentPlayers(client, member.clubId, registrations);
  const groupRows = await loadTournamentGroups(client, member.clubId, context.tournament.id);
  const mappedGroups = mapDrawGroups(groupRows.groups, groupRows.members, registrations);
  const importedCount = await countImportedHandicapRecords(
    client,
    member.clubId,
    registrations.map((registration) => registration.player_id),
    context.tournament.cutoff_date,
  );
  const publishedSnapshot = mapPublishedSnapshot(context.tournament.published_snapshot);

  if (context.tournament.published && !publishedSnapshot) {
    throw new Error("This tournament is marked published but has no saved pairing snapshot.");
  }

  const routeResult = route({
    players,
    config: context.config,
    tees: context.tees,
    categories: context.categories,
    flights: context.flights,
  });

  return {
    clubId: member.clubId,
    tournamentId: context.tournament.id,
    cutoffDate: context.tournament.cutoff_date,
    member,
    name: context.tournament.name,
    config: context.config,
    players,
    draw: groupRows.groups.length ? mappedGroups.draw : null,
    drawWarnings: groupRows.groups.length
      ? routeResult.warnings.filter((warning) => !/a group has only/.test(warning))
      : [],
    published: context.tournament.published ? publishedSnapshot : null,
    importedCount,
    tees: context.tees,
    categories: context.categories,
    flights: context.flights,
    holes: context.holes,
    photoPaths,
  };
}
