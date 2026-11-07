import type { Metadata } from "next";
import Link from "next/link";
import { LiveBoard } from "@/components/player/LiveBoard";
import { PlayerOfflineNotice } from "@/components/player/OfflinePortal";
import { PlayerPageHeader } from "@/components/player/PlayerPageHeader";
import type { PublicRoundSummary } from "@/lib/data/public-results";
import { getI18n } from "@/lib/i18n/server";
import { playerBoard, playerRounds } from "@/lib/player/board-data";
import { loadPortal } from "@/lib/player/portal";
import { signedInClient } from "@/lib/player/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

const dayText = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "medium" });

/**
 * The player's board. It reads the published rounds with the player's own session, highlights
 * their row and hands the rows to the live component, which polls for the next published version.
 */
export default async function PlayerBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string }>;
}) {
  const { t } = await getI18n();
  const params = await searchParams;
  const next = params.round ? `/my/board?round=${params.round}` : "/my/board";

  if (!isSupabaseConfigured()) {
    return (
      <div className="grid gap-4">
        <h1 className="font-serif text-[30px] leading-9 font-semibold">
          {t("player.board.title")}
        </h1>
        <p className="notice" role="status">
          {t("player.demo.body")}
        </p>
      </div>
    );
  }

  const client = await signedInClient(next);

  let rounds: PublicRoundSummary[] = [];
  try {
    rounds = await playerRounds(client);
  } catch {
    rounds = [];
  }

  const selected = rounds.find((round) => round.roundId === params.round) ?? rounds[0] ?? null;

  let board: Awaited<ReturnType<typeof playerBoard>> = null;
  if (selected) {
    try {
      board = await playerBoard(client, selected);
    } catch {
      board = null;
    }
  }

  let you: { playerId: string | null; name: string } | null = null;
  try {
    const portal = await loadPortal(client);
    if (portal.player) you = { playerId: portal.player.id, name: portal.player.name };
  } catch {
    you = null;
  }

  return (
    <div className="grid gap-4">
      <PlayerOfflineNotice path="/my/board" />
      <PlayerPageHeader title={t("player.board.title")} intro={t("player.board.intro")} />

      {rounds.length > 1 && (
        <nav aria-label={t("player.board.round")} className="round-pills">
          {rounds.map((round) => (
            <Link
              key={round.roundId}
              href={`/my/board?round=${round.roundId}`}
              aria-current={selected?.roundId === round.roundId ? "page" : undefined}
              className="pill no-underline"
            >
              {t("player.scorecard.day", { day: round.dayNumber })} · {dayText(round.playDate)}
            </Link>
          ))}
        </nav>
      )}

      {board ? (
        <>
          <LiveBoard initial={board} you={you} />
          <p className="hint">{t("player.board.help")}</p>
        </>
      ) : (
        <p className="notice" role="status">
          {rounds.length > 0 ? t("player.board.empty") : t("player.board.emptyAll")}
        </p>
      )}

      <p className="hint">
        <Link href="/pairings">{t("player.app.openPairings")}</Link>
      </p>
    </div>
  );
}
