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
      <div className="player-column grid gap-4">
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

  // The round list and the player's own record do not depend on each other, so they are asked for
  // together. Waiting for one before starting the other is what made this screen feel slow.
  const [roundsResult, portalResult] = await Promise.allSettled([
    playerRounds(client),
    loadPortal(client),
  ]);
  // A rejected read is not an empty board: the club's copy says "nothing published yet", which
  // would be a lie about a request that never arrived. Keep the failure so the screen can say so.
  const roundsFailed = roundsResult.status === "rejected";
  const rounds: PublicRoundSummary[] =
    roundsResult.status === "fulfilled" ? roundsResult.value : [];

  const selected = rounds.find((round) => round.roundId === params.round) ?? rounds[0] ?? null;

  let board: Awaited<ReturnType<typeof playerBoard>> = null;
  let boardFailed = false;
  if (selected) {
    try {
      board = await playerBoard(client, selected);
    } catch {
      board = null;
      boardFailed = true;
    }
  }
  const readFailed = roundsFailed || boardFailed;

  const portal = portalResult.status === "fulfilled" ? portalResult.value : null;
  const you = portal?.player ? { playerId: portal.player.id, name: portal.player.name } : null;

  return (
    <div className="player-column grid gap-4">
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
              className="pill inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-[13px] whitespace-nowrap no-underline"
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
            {readFailed
              ? t("player.board.loadFailed")
              : rounds.length > 0
                ? t("player.board.empty")
                : t("player.board.emptyAll")}
          </p>
          <div className="flex flex-wrap gap-3">
            {readFailed && (
              /* The same screen, fetched again. A failure gets an action; an empty board does not. */
              <Link
                href={next}
                className="inline-flex min-h-11 w-fit items-center font-semibold underline"
              >
                {t("player.board.retry")}
              </Link>
            )}
            <Link
              href="/pairings"
              className="inline-flex min-h-11 w-fit items-center font-semibold underline"
            >
              {t("player.app.openPairings")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
