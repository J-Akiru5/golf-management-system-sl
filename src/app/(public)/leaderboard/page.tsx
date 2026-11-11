import type { Metadata } from "next";
import Link from "next/link";
import { HeldNotice } from "@/components/public/HeldNotice";
import { ResultTable } from "@/components/public/LeaderboardResults";
import { LeaderboardShell } from "@/components/public/LeaderboardShell";
import { TeamLeaderboard } from "@/components/public/TeamLeaderboard";
import {
  loadPublicPhotos,
  loadPublishedRounds,
  loadRoundResults,
  type PublicResultRow,
} from "@/lib/data/public-results";
import {
  buildTeamLeaderboard,
  filterTeams,
  loadPublicTeamLeaderboard,
  rankTeams,
  teamOptions,
  topTeams,
} from "@/lib/data/public-team-leaderboard";
import { loadPublicProgramme, loadPublicReleaseState } from "@/lib/data/supabase/public-programme";
import { getI18n } from "@/lib/i18n/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { DemoLeaderboard } from "./DemoLeaderboard";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

const dateLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "long" });

/**
 * The public cumulative team leaderboard.
 *
 * It reads the frozen publication snapshots through `public_team_leaderboard()` and adds the two
 * partners together here. A database that has not applied the new function yet falls back to the
 * per-round gross and net tables, with a notice, so the page never breaks on an older project.
 */
export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[]; flight?: string | string[] }>;
}) {
  const params = await searchParams;
  const filters = {
    category: typeof params.category === "string" ? params.category : "",
    flight: typeof params.flight === "string" ? params.flight : "",
  };
  const { t } = await getI18n();

  if (!isSupabaseConfigured()) {
    return <DemoLeaderboard filters={filters} />;
  }

  const client = createSupabasePublicClient();
  let data: Awaited<ReturnType<typeof loadPublicTeamLeaderboard>> = null;
  let failure = "";
  try {
    data = await loadPublicTeamLeaderboard(client);
  } catch (error) {
    failure = error instanceof Error ? error.message : "Could not load the leaderboard.";
  }

  const [releaseResult, programmeResult] = await Promise.allSettled([
    loadPublicReleaseState(client),
    loadPublicProgramme(client),
  ]);
  const release = releaseResult.status === "fulfilled" ? releaseResult.value : null;
  const programme = programmeResult.status === "fulfilled" ? programmeResult.value : null;

  if (!data && !failure) {
    if (!programme) {
      return (
        <LeaderboardShell>
          <section className="pairings-empty" role="status" data-testid="leaderboard-unpublished">
            <h2>{t("pairings.notOutTitle")}</h2>
            <p>{t("pairings.notOutBody")}</p>
          </section>
        </LeaderboardShell>
      );
    }
    if (release?.leaderboard === false) {
      return (
        <LeaderboardShell>
          <HeldNotice testId="leaderboard-held" />
        </LeaderboardShell>
      );
    }
    // The function is missing, so this database predates the team leaderboard. Keep the published
    // per-round tables readable and say why the team view is not there yet.
    return <RoundLeaderboardFallback notice={t("programme.leaderboardNotDeployed")} />;
  }

  if (failure || !data) {
    return (
      <LeaderboardShell>
        <div className="notice" role="alert">
          {failure || t("programme.leaderboardFailed")}
        </div>
      </LeaderboardShell>
    );
  }

  if (data.rows.length === 0 && data.rounds.length > 0) {
    // Old publications carry totals but not the cards the team table needs. Keep the per-round
    // tables readable instead of claiming there are no results.
    return <RoundLeaderboardFallback notice={t("programme.leaderboardNoCards")} />;
  }

  const { teams, unpaired } = buildTeamLeaderboard(data);
  const shown = topTeams(rankTeams(filterTeams(teams, filters)), 10);

  return (
    <LeaderboardShell
      eventName={data.eventName}
      dateText={data.rounds.map((round) => dateLabel(round.playDate)).join(" · ")}
    >
      <TeamLeaderboard
        teams={shown}
        options={teamOptions(data)}
        filters={filters}
        rounds={data.rounds}
        tieBreak={data.tieBreak}
        unpaired={unpaired}
        eventName={data.eventName}
      />
      <p className="hint no-print">
        <Link href="/pairings" className="inline-flex min-h-11 items-center">
          {t("programme.navPairings")}
        </Link>{" "}
        ·{" "}
        <Link href="/roster" className="inline-flex min-h-11 items-center">
          {t("programme.navPlayers")}
        </Link>
      </p>
    </LeaderboardShell>
  );
}

/**
 * The per-round gross and net tables that shipped before the cumulative team view. It reads the
 * same published snapshots and disappears once the database has the new function.
 */
async function RoundLeaderboardFallback({ notice }: { notice: string }) {
  const client = createSupabasePublicClient();
  let rounds: Awaited<ReturnType<typeof loadPublishedRounds>> = [];
  let board: Awaited<ReturnType<typeof loadRoundResults>> = null;
  let failure = "";
  try {
    rounds = await loadPublishedRounds(client);
    const selected = rounds[0] ?? null;
    if (selected) {
      board = await loadRoundResults(client, selected);
      if (board) {
        const ids = [...board.gross, ...board.net]
          .map((row) => row.playerId)
          .filter((id): id is string => Boolean(id));
        const photos = await loadPublicPhotos(client, ids);
        const attach = (rows: PublicResultRow[]) =>
          rows.map((row) => ({
            ...row,
            photoPath: row.playerId ? (photos[row.playerId] ?? null) : null,
          }));
        board = { ...board, gross: attach(board.gross), net: attach(board.net) };
      }
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : "Could not load the leaderboard.";
  }

  return (
    <LeaderboardShell
      eventName={board?.round.eventName ?? null}
      dateText={board ? dateLabel(board.round.playDate) : undefined}
    >
      <div className="notice" role="status">
        {notice}
      </div>
      {failure ? (
        <div className="notice" role="alert">
          {failure}
        </div>
      ) : rounds.length === 0 ? (
        <section className="pairings-empty" role="status">
          <h2>No results are published yet</h2>
          <p>The organizer publishes a round after the scores have been checked.</p>
        </section>
      ) : (
        <div className="grid gap-4">
          <p className="hint m-0">
            Showing the latest published round. The cumulative team view appears after the database
            update is applied.
          </p>
          {board && (
            <div className="grid gap-4">
              <ResultTable title="Gross leaderboard" rows={board.gross} />
              <ResultTable title="Net leaderboard" rows={board.net} />
            </div>
          )}
        </div>
      )}
      <p className="hint no-print">
        <Link href="/pairings" className="inline-flex min-h-11 items-center">
          Pairings
        </Link>{" "}
        ·{" "}
        <Link href="/roster" className="inline-flex min-h-11 items-center">
          Players
        </Link>
      </p>
    </LeaderboardShell>
  );
}
