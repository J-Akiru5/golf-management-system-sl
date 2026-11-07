import type { Metadata } from "next";
import Link from "next/link";
import { LiveBoard } from "@/components/player/LiveBoard";
import { PlayerOfflineNotice } from "@/components/player/OfflinePortal";
import type { PublicRoundSummary } from "@/lib/data/public-results";
import { getI18n } from "@/lib/i18n/server";
import { playerBoard, playerRounds } from "@/lib/player/board-data";
import { manilaToday } from "@/lib/player/dashboard";
import { demoBoard, demoPortalState } from "@/lib/player/demo";
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
    const today = manilaToday();
    const sample = demoPortalState();
    return (
      <div className="grid gap-4">
        <h1 className="font-serif text-[26px] leading-8 font-semibold sm:text-[30px] sm:leading-9">
          {t("player.board.title")}
        </h1>
        <p className="notice" role="status">
          {t("player.demo.body")}{" "}
          <Link href="/pairings" className="font-semibold underline">
            {t("player.demo.link")}
          </Link>
          .
        </p>
        <LiveBoard
          initial={demoBoard(today)}
          you={sample.player ? { playerId: sample.player.id, name: sample.player.name } : null}
        />
        <p className="hint">{t("player.board.help")}</p>
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
      <header className="grid gap-1">
        <h1 className="font-serif text-[26px] leading-8 font-semibold sm:text-[30px] sm:leading-9">
          {t("player.board.title")}
        </h1>
        <p className="hint">{t("player.board.intro")}</p>
      </header>

      {rounds.length > 1 && (
        /* One scrolling row: a stack of three wrapped pills pushed the board below the fold. */
        <nav
          aria-label={t("player.board.round")}
          className="round-pills -mx-1 flex-nowrap gap-2 overflow-x-auto px-1 py-1"
        >
          {rounds.map((round) => (
            <Link
              key={round.roundId}
              href={`/my/board?round=${round.roundId}`}
              aria-current={selected?.roundId === round.roundId ? "page" : undefined}
              className="pill inline-flex min-h-11 shrink-0 items-center whitespace-nowrap px-3 no-underline"
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
          <p className="hint">
            <Link
              href="/pairings"
              className="inline-flex min-h-11 items-center font-semibold underline"
            >
              {t("player.app.openPairings")}
            </Link>
          </p>
        </>
      ) : (
        <div className="notice grid gap-2">
          <p role="status">
            {rounds.length > 0 ? t("player.board.empty") : t("player.board.emptyAll")}
          </p>
          <Link
            href="/pairings"
            className="inline-flex min-h-11 w-fit items-center font-semibold underline"
          >
            {t("player.app.openPairings")}
          </Link>
        </div>
      )}
    </div>
  );
}
