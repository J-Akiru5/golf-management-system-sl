"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/bits";
import { useI18n } from "@/lib/i18n/context";
import { publicPhotoUrl } from "@/lib/photo";
import { boardKey, findYou, type LiveBoardPayload, rankMoves } from "@/lib/player/ranks";
import { cn } from "@/lib/ui/cn";

const ROW = 64;
const POLL_MS = 20_000;
const MOVE_MS = 7_000;

const dayText = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "medium" });

/**
 * The live board.
 *
 * The rows are absolutely positioned at their rank, so when the club publishes a new version a
 * player's row slides to its new place instead of jumping. Movement is measured between the two
 * published versions, which is why a correction can move a player down as well as up.
 *
 * The poll reads the same published snapshot the public page does. Nothing unpublished is in it.
 */
export function LiveBoard({
  initial,
  you,
}: {
  initial: LiveBoardPayload;
  you: { playerId: string | null; name: string } | null;
}) {
  const { t } = useI18n();
  const [board, setBoard] = useState(initial);
  const [moves, setMoves] = useState<Record<string, number>>({});
  const [takeover, setTakeover] = useState<{
    delta: number;
    rank: number;
    field: number;
  } | null>(null);

  const boardRef = useRef(board);
  const youRef = useRef(you);
  const clearRef = useRef<number | null>(null);
  youRef.current = you;

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    let stopped = false;

    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      const previous = boardRef.current;
      try {
        const response = await fetch(
          `/api/player/board?round=${encodeURIComponent(previous.roundId)}`,
          { cache: "no-store" },
        );
        // A round that is no longer published answers 404; old rows stay on screen.
        if (!response.ok) return;
        const next = (await response.json()) as LiveBoardPayload;
        if (stopped) return;
        if (next.version === previous.version && next.rows.length === previous.rows.length) {
          if (JSON.stringify(next.rows) === JSON.stringify(previous.rows)) return;
        }

        const changed = rankMoves(previous.rows, next.rows);
        setBoard(next);

        if (changed.length > 0) {
          setMoves(Object.fromEntries(changed.map((move) => [move.key, move.delta])));

          const player = youRef.current;
          const after = player ? findYou(next.rows, player) : null;
          if (player && after) {
            const before = findYou(previous.rows, player);
            const from = before?.rank ?? after.rank;
            const delta = from - after.rank;
            setTakeover(delta === 0 ? null : { delta, rank: after.rank, field: next.rows.length });
          }

          if (clearRef.current !== null) window.clearTimeout(clearRef.current);
          clearRef.current = window.setTimeout(() => {
            setMoves({});
            setTakeover(null);
            clearRef.current = null;
          }, MOVE_MS);
        }
      } catch {
        // A dropped poll is not an error on screen; the next one catches up.
      }
    };

    const interval = window.setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      if (clearRef.current !== null) window.clearTimeout(clearRef.current);
    };
  }, []);

  const youRow = you ? findYou(board.rows, you) : null;
  const youKey = youRow ? boardKey(youRow.row) : null;
  const total = board.rows.length;
  const moveLabel = (delta: number) => {
    if (delta > 0) {
      return delta === 1
        ? t("player.board.movedUpOne")
        : t("player.board.movedUp", { places: delta });
    }
    return Math.abs(delta) === 1
      ? t("player.board.movedDownOne")
      : t("player.board.movedDown", { places: Math.abs(delta) });
  };

  return (
    <section className="grid gap-3" aria-labelledby="live-board-h">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-0.5">
          <h2 id="live-board-h" className="text-[18px] leading-6">
            {board.eventName}
          </h2>
          <p className="hint">
            {t("player.scorecard.day", { day: board.dayNumber })} · {dayText(board.playDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill info flex items-center gap-1.5">
            {board.state !== "final" && <span className="live-dot" aria-hidden="true" />}
            {board.state === "final" ? t("player.board.final") : t("player.board.live")}
          </span>
          <span className="hint tnum">
            {t("player.board.updated", {
              version: board.version,
              when: dayText(board.playDate),
            })}
          </span>
        </div>
      </header>

      <ol className="live-board" style={{ height: total * ROW }} data-testid="live-board">
        {board.rows.map((row, index) => {
          const key = boardKey(row);
          const delta = moves[key] ?? 0;
          const isYou = youKey !== null && key === youKey;
          return (
            <li
              key={key}
              className={cn("live-row", isYou && "is-you")}
              style={{ top: index * ROW, height: ROW - 6 }}
            >
              <span className="live-rank tnum">{index + 1}</span>
              {delta !== 0 && (
                <span className={cn("live-move", delta > 0 ? "up" : "down")}>
                  {delta > 0 ? (
                    <ArrowUp className="size-3" aria-hidden="true" />
                  ) : (
                    <ArrowDown className="size-3" aria-hidden="true" />
                  )}
                  <span className="sr-only">{moveLabel(delta)}</span>
                  <span aria-hidden="true">{Math.abs(delta)}</span>
                </span>
              )}
              <Avatar name={row.playerName} photo={publicPhotoUrl(row.photoPath)} />
              <span className="grid min-w-0 flex-1">
                <b className="truncate text-[14px]">
                  {row.playerName}
                  {isYou && (
                    <span className="text-[11px] font-semibold text-[var(--ink-muted)]">
                      {" "}
                      · {t("player.board.you")}
                    </span>
                  )}
                </b>
                <span className="truncate text-[11px] text-[var(--ink-muted)]">
                  {row.flightName ?? "—"} ·{" "}
                  {t("player.board.holes", {
                    count: row.holesCounted,
                    total: row.holesTotal,
                  })}
                </span>
              </span>
              <span className="grid shrink-0 text-right">
                <b className="text-[17px] leading-5 tnum">{row.points}</b>
                <span className="text-[10px] text-[var(--ink-muted)]">
                  {t("player.board.points")}
                </span>
                <span className="text-[10px] text-[var(--ink-muted)] tnum">
                  {row.strokes ?? "—"} {t("player.board.strokes")}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {you === null && <p className="hint">{t("player.board.noYou")}</p>}

      {takeover && (
        <div className="rank-takeover" role="status" aria-live="polite" data-testid="rank-takeover">
          <span className={cn("rank-takeover-icon", takeover.delta > 0 ? "up" : "down")}>
            {takeover.delta > 0 ? (
              <ArrowUp className="size-5" aria-hidden="true" />
            ) : (
              <ArrowDown className="size-5" aria-hidden="true" />
            )}
          </span>
          <span className="grid">
            <b className="text-[14px]">{moveLabel(takeover.delta)}</b>
            <span className="hint">
              {t("player.board.place", { rank: takeover.rank, field: takeover.field })}
            </span>
          </span>
          <button
            type="button"
            className="btn small ghost"
            onClick={() => setTakeover(null)}
            aria-label={t("player.board.dismiss")}
          >
            ×
          </button>
        </div>
      )}
    </section>
  );
}
