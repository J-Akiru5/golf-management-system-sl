import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { HelpButton } from "@/components/help";
import { PlayerBottomBar } from "@/components/MobileTabBar";
import { ResultTable } from "@/components/public/LeaderboardResults";
import { PublicBackLink } from "@/components/public/PublicBackLink";
import { PublicTournamentNav } from "@/components/public/PublicTournamentNav";
import { TeamLeaderboard } from "@/components/public/TeamLeaderboard";
import { TeeLineLogo } from "@/components/TeeLineLogo";
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
import { sampleTeamLeaderboardData } from "@/lib/demo/public-leaderboard";
import { getI18n } from "@/lib/i18n/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";

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
    const data = sampleTeamLeaderboardData();
    const { teams, unpaired } = buildTeamLeaderboard(data);
    return (
      <LeaderboardShell
        eventName={data.eventName}
        dateText={data.rounds.map((round) => dateLabel(round.playDate)).join(" · ")}
      >
        <TeamLeaderboard
          teams={topTeams(rankTeams(filterTeams(teams, filters)), 10)}
          options={teamOptions(data)}
          filters={filters}
          rounds={data.rounds}
          tieBreak={data.tieBreak}
          unpaired={unpaired}
          eventName={data.eventName}
        />
      </LeaderboardShell>
    );
  }

  const client = createSupabasePublicClient();
  let data: Awaited<ReturnType<typeof loadPublicTeamLeaderboard>> = null;
  let failure = "";
  try {
    data = await loadPublicTeamLeaderboard(client);
  } catch (error) {
    failure = error instanceof Error ? error.message : "Could not load the leaderboard.";
  }

  if (!data && !failure) {
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
        <Link href="/pairings">{t("programme.navPairings")}</Link> ·{" "}
        <Link href="/roster">{t("programme.navPlayers")}</Link> ·{" "}
        <Link href="/pairings?tab=profile">{t("programme.navProfile")}</Link>
      </p>
    </LeaderboardShell>
  );
}

async function LeaderboardShell({
  eventName,
  dateText,
  children,
}: {
  eventName?: string | null;
  dateText?: string;
  children: ReactNode;
}) {
  const { t } = await getI18n();
  return (
    <main className="public public-pairings mobile-bar-space">
      <header className="public-head !p-4 sm:!p-5">
        <PublicBackLink label={t("pairings.backHome")} />
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <TeeLineLogo variant="reverse" width={172} />
            <span className="leading-tight">
              <b className="block font-display text-[13px] font-semibold">Leaderboard</b>
              <span className="text-xs text-on-forest-muted">Iloilo Golf &amp; Country Club</span>
            </span>
          </div>
          <HelpButton audience="player" screen="pairings" />
        </div>
        <h1 className="mt-3 font-serif text-[28px] leading-8 font-semibold !text-on-forest sm:text-[44px] sm:leading-[48px]">
          {eventName ?? "Leaderboard"}
        </h1>
        {dateText && <p className="text-on-forest-muted">{dateText}</p>}
      </header>

      <PublicTournamentNav active="leaderboard" />
      {children}
      <PlayerBottomBar />
    </main>
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
        <Link href="/pairings">Pairings</Link> · <Link href="/roster">Players</Link>
      </p>
    </LeaderboardShell>
  );
}
