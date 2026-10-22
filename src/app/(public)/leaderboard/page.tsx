import Link from "next/link";
import { Avatar } from "@/components/bits";
import { HelpButton } from "@/components/help";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import {
  loadPublicPhotos,
  loadPublishedRounds,
  loadRoundResults,
  PublicResultRow,
} from "@/lib/data/public-results";
import { publicPhotoUrl } from "@/lib/photo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

const dateLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "long" });

function ResultTable({ title, rows }: { title: string; rows: PublicResultRow[] }) {
  return (
    <section className="card grid gap-3">
      <h2 className="text-[18px] leading-6">{title}</h2>
      {rows.length === 0 ? (
        <p className="muted text-[14px]">No published {title.toLowerCase()} results yet.</p>
      ) : (
        <div className="table-wrap !shadow-none">
          <table>
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Player</th>
                <th>Flight</th>
                <th className="num">Points</th>
                <th className="num">Strokes</th>
                <th className="num">Holes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.playerId ?? row.playerName}-${index}`}>
                  <td className="num">{index + 1}</td>
                  <td>
                    <span className="who">
                      <Avatar name={row.playerName} photo={publicPhotoUrl(row.photoPath)} />
                      <span>{row.playerName}</span>
                    </span>
                  </td>
                  <td>{row.flightName ?? "—"}</td>
                  <td className="num">{row.points}</td>
                  <td className="num">{row.strokes ?? "—"}</td>
                  <td className="num">
                    {row.holesCounted}/{row.holesTotal || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string }>;
}) {
  const params = await searchParams;
  if (!isSupabaseConfigured()) {
    return (
      <div className="public public-pairings mobile-bar-space">
        <header className="public-head">
          <TeeLineLogo variant="reverse" width={172} />
          <h1 className="mt-4 font-serif text-[34px] leading-10 font-semibold !text-on-forest">
            Leaderboard
          </h1>
        </header>
        <div className="notice" role="status">
          The public leaderboard is available when the club is connected to its event database.
        </div>
      </div>
    );
  }

  const client = createSupabasePublicClient();
  let rounds: Awaited<ReturnType<typeof loadPublishedRounds>> = [];
  let board: Awaited<ReturnType<typeof loadRoundResults>> = null;
  let failure = "";
  try {
    rounds = await loadPublishedRounds(client);
    const selected = rounds.find((round) => round.roundId === params.round) ?? rounds[0] ?? null;
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
    <div className="public public-pairings mobile-bar-space">
      <header className="public-head">
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
        {board && (
          <>
            <p className="overline mt-3 !text-gold">
              {board.round.state === "final" ? "Final" : "Provisional"} · Day{" "}
              {board.round.dayNumber}
            </p>
            <h1 className="font-serif text-[28px] leading-8 font-semibold !text-on-forest sm:text-[44px] sm:leading-[48px]">
              {board.round.eventName}
            </h1>
            <p className="text-on-forest-muted">{dateLabel(board.round.playDate)}</p>
          </>
        )}
      </header>

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
          <nav className="seg no-print" aria-label="Published rounds">
            {rounds.map((round) => (
              <Link
                key={round.roundId}
                href={`/leaderboard?round=${encodeURIComponent(round.roundId)}`}
                aria-current={round.roundId === board?.round.roundId ? "page" : undefined}
                className={round.roundId === board?.round.roundId ? "active" : undefined}
              >
                {round.eventName} · Day {round.dayNumber}
              </Link>
            ))}
          </nav>
          {board && (
            <div className="grid gap-4">
              <p className="hint">
                Published{" "}
                {new Date(board.round.publishedAt).toLocaleString("en-PH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                · Version {board.round.version}. Only consented player photos are shown.
              </p>
              <ResultTable title="Gross leaderboard" rows={board.gross} />
              <ResultTable title="Net leaderboard" rows={board.net} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
