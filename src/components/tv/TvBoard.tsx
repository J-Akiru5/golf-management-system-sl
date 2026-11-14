"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Crest } from "@/components/Crest";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import type { TvBoard, TvColumn, TvPairLine, TvPlayerLine } from "@/lib/public/tv-board";
import { scrollPass } from "./scroll";
import styles from "./tv.module.css";

/**
 * The clubhouse TV board.
 *
 * A 16:9 screen for the clubhouse wall: today's field split into the morning and the afternoon,
 * each ranked by net points with the gross points beside it, and a pair view that adds the two
 * partners together. Both columns scroll themselves, so the whole field passes the room instead of
 * stopping at the first twenty names.
 *
 * Every figure comes from the frozen published card. The screen refreshes itself once a minute,
 * swaps between the player and pair views every twenty-four seconds, and holds still for anybody
 * who asked their device for reduced motion.
 */

type Mode = "players" | "pairs";

const REFRESH_MS = 60_000;
/** How long the finished list is held before the board changes to the next one. */
const END_HOLD_MS = 1_800;

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
// 12-hour with AM/PM, Philippine time: the clock on the wall says 1:39 PM, not 13:39.
const clockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function longDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? "" : dateFormat.format(parsed);
}

function manilaClock(): string {
  try {
    // Some ICU builds separate the hour and AM/PM with a narrow no-break space.
    return clockFormat.format(new Date()).replace(/[\u202f\u00a0]/g, " ");
  } catch {
    return "";
  }
}

/** "06:30" as the board prints it: "6:30 AM". */
function teeClock(time: string): string {
  const [hours, minutes] = time.split(":");
  const hour = Number(hours);
  const minute = Number(minutes);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time;
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** The player's tee line: the time, and the hole when the pairings publish one. */
function teeLabel(line: { teeTime: string | null; teeHole: number | null }): string | null {
  if (!line.teeTime) return null;
  const time = teeClock(line.teeTime);
  return line.teeHole === null ? time : `${time} · Hole ${line.teeHole}`;
}

export function TvBoardView({ board }: { board: TvBoard }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("players");
  const [pass, setPass] = useState(0);
  const [clock, setClock] = useState("");
  const [still, setStill] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setStill(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const tick = () => setClock(manilaClock());
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  // The board is on a wall for hours, so it keeps itself current: a minute is fresh enough for a
  // publish and cheap enough for a screen nobody is touching.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  const offersPairs = board.columns.some((column) => column.pairs.length > 0);
  const finishedColumns = useRef(new Set<string>());
  const switchTimer = useRef<number | null>(null);

  // A pass ends when every column has shown its last name at the top. Only then does the board
  // change to the next list, which starts empty in turn.
  const finishColumn = (key: string) => {
    if (still) return;
    finishedColumns.current.add(key);
    if (finishedColumns.current.size < board.columns.length || switchTimer.current !== null) return;
    switchTimer.current = window.setTimeout(() => {
      switchTimer.current = null;
      finishedColumns.current.clear();
      if (offersPairs) setMode((current) => (current === "players" ? "pairs" : "players"));
      setPass((value) => value + 1);
    }, END_HOLD_MS);
  };

  useEffect(
    () => () => {
      if (switchTimer.current !== null) window.clearTimeout(switchTimer.current);
    },
    [],
  );

  if (!board.day || board.columns.length === 0) {
    return (
      <TvIdle
        eventName={board.eventName}
        note="No scores have been published yet. The board starts when the first cards are verified."
      />
    );
  }

  return (
    <main className={styles.stage} data-testid="tv-board">
      <header className={styles.top}>
        <div className={styles.identity}>
          <Crest size={96} className={styles.crest} />
          <div>
            <p className={styles.club}>Iloilo Golf &amp; Country Club</p>
            <p className={styles.est}>Est. 1907 · Sta. Barbara, Iloilo</p>
          </div>
        </div>

        <div className={styles.event}>
          <span className={styles.eventKicker}>Gross and net Stableford points</span>
          <span className={styles.eventName}>{board.eventName ?? "Club tournament"}</span>
        </div>

        <div className={styles.when}>
          <div className={styles.dayBlock}>
            <span className={styles.dayNumber}>Day {board.day.dayNumber}</span>
            <span className={styles.dayDate}>{longDate(board.day.playDate)}</span>
            {board.isToday ? null : <span className={styles.dayNote}>Latest published day</span>}
          </div>
          <span className={styles.clock} aria-label="Philippine time">
            {clock}
          </span>
        </div>
      </header>

      <div className={styles.columns} data-count={board.columns.length}>
        {board.columns.map((column) => {
          const key = column.session ?? "all";
          return (
            <BoardColumn
              key={`${key}-${pass}`}
              column={column}
              mode={mode}
              onFinished={() => finishColumn(key)}
            />
          );
        })}
      </div>

      <footer className={styles.foot}>
        <span data-testid="tv-what">
          {mode === "players"
            ? "Every player with a published card today, ranked by net points"
            : "Two-man pairs from the draw, both partners' points added together"}
        </span>
        <span className={styles.modes}>
          <span className={mode === "players" ? styles.modeOn : styles.mode}>By player</span>
          <span className={mode === "pairs" ? styles.modeOn : styles.mode}>By pair</span>
        </span>
        <span className={styles.footRight}>
          {board.unplaced > 0
            ? `${board.unplaced} without a start`
            : "Scores update as they verify"}
          <span className={styles.powered}>
            <span className={styles.poweredLabel}>Powered by</span>
            <TeeLineLogo variant="reverse" width={146} className={styles.poweredLogo} />
            <span className={styles.poweredRule} aria-hidden="true" />
            {/* The club's connectivity partner, drawn in the same white as the platform lockup. */}
            <img src="/partners/converge-logo.svg" alt="Converge" className={styles.convergeLogo} />
          </span>
        </span>
      </footer>
    </main>
  );
}

function BoardColumn({
  column,
  mode,
  onFinished,
}: {
  column: TvColumn;
  mode: Mode;
  onFinished: () => void;
}) {
  const label =
    column.session === "AM" ? "Morning" : column.session === "PM" ? "Afternoon" : "All players";
  const count = mode === "players" ? column.players.length : column.pairs.length;
  const noun = mode === "players" ? "player" : "pair";

  return (
    <section className={`${styles.column} ${styles.fade}`} aria-label={label}>
      <div className={styles.colHead}>
        {column.session ? <span className={styles.chip}>{column.session}</span> : null}
        <h2 className={styles.colTitle}>{label}</h2>
        <span className={styles.colCount}>
          {count} {count === 1 ? noun : `${noun}s`}
        </span>
      </div>

      <div className={styles.labels} data-pair={mode === "pairs"} aria-hidden="true">
        <span>{mode === "players" ? "Pos" : "Pair"}</span>
        <span>{mode === "players" ? "Player" : "Partners"}</span>
        <span className={styles.num}>Gross</span>
        <span className={styles.num}>Net</span>
      </div>

      {count === 0 ? (
        <p className={styles.empty}>No published card in this session yet.</p>
      ) : (
        <AutoScroll onFinished={onFinished}>
          {mode === "players"
            ? column.players.map((line) => <PlayerRow key={line.playerId} line={line} />)
            : column.pairs.map((line) => <PairRow key={line.key} line={line} />)}
        </AutoScroll>
      )}
    </section>
  );
}

function PlayerRow({ line }: { line: TvPlayerLine }) {
  const partial = line.holesTotal > 0 && line.holesCounted < line.holesTotal;
  const tee = teeLabel(line);
  return (
    <div className={styles.row} data-rank={line.rank} data-testid="tv-player-row">
      <span className={styles.rank}>{line.tied ? `T${line.rank}` : line.rank}</span>
      <span className={styles.nameCell}>
        <span className={styles.nameWrap}>
          <span className={styles.name}>{line.name}</span>
          {partial ? (
            <span className={styles.thru}>
              thru {line.holesCounted}/{line.holesTotal}
            </span>
          ) : null}
        </span>
        {tee ? <span className={styles.tee}>{tee}</span> : null}
      </span>
      <span className={styles.gross}>{line.grossPoints ?? "—"}</span>
      <span className={styles.net}>{line.netPoints ?? "—"}</span>
    </div>
  );
}

function PairRow({ line }: { line: TvPairLine }) {
  const tee = teeLabel(line);
  return (
    <div className={styles.row} data-rank={line.rank} data-pair="true" data-testid="tv-pair-row">
      <span className={styles.pairCell}>
        <span className={styles.pairLabel}>Pair</span>
        <span className={styles.pairNo}>{line.pairNumber === null ? "—" : line.pairNumber}</span>
      </span>
      <span className={styles.pairNames}>
        {line.names.map((name) => (
          <span key={name} className={styles.pairName}>
            {name}
          </span>
        ))}
        {tee ? <span className={styles.tee}>{tee}</span> : null}
      </span>
      <span className={styles.gross}>{line.grossPoints ?? "—"}</span>
      <span className={styles.net}>{line.netPoints ?? "—"}</span>
    </div>
  );
}

/**
 * A column that scrolls itself, one list at a time.
 *
 * A pass starts with the column empty and the list just below it. The list then rises from the
 * bottom edge, and the pass ends when its last row has left the top, so the column is empty again.
 * It waits there for the other columns, then the board changes to the next list.
 *
 * A short list that fits the column is shown whole, and a visitor who asked for reduced motion gets
 * a still board.
 */
function AutoScroll({ children, onFinished }: { children: ReactNode; onFinished?: () => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const height = useRef(0);
  const finished = useRef(false);
  const notify = useRef(onFinished);
  notify.current = onFinished;
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const box = viewport.current;
    const list = group.current;
    if (!box || !list) return;

    const measure = () => {
      height.current = list.offsetHeight;
      const overflows = list.offsetHeight > box.clientHeight + 2;
      setOverflow(overflows);
      // A list that fits has nothing to scroll, so its pass is already over.
      if (!overflows && !finished.current) {
        finished.current = true;
        notify.current?.();
      }
    };

    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(list);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const box = viewport.current;
    const rail = track.current;
    if (!box || !rail) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !overflow) {
      rail.style.transform = "";
      return;
    }

    // The whole list travels past the window once per cycle, so everybody is on it for the same
    // time. The empty start is deliberate: the column fills from its bottom edge.
    const speed = Math.max(14, box.clientHeight / 16);
    // The clock starts on the first painted frame, so a screen that was asleep or in a background
    // tab still opens empty rather than halfway through its list.
    let began = 0;
    let frame = 0;

    const step = (now: number) => {
      if (began === 0) began = now;
      const current = scrollPass(now - began, height.current, box.clientHeight, speed);
      rail.style.transform = `translate3d(0, ${current.y}px, 0)`;
      if (current.done) {
        if (!finished.current) {
          finished.current = true;
          notify.current?.();
        }
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      rail.style.transform = "";
    };
  }, [overflow]);

  return (
    <div className={styles.viewport} ref={viewport}>
      <div className={styles.track} ref={track}>
        <div className={styles.group} ref={group}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** What the screen shows when there is nothing published, or the desk is holding the board. */
export function TvIdle({ eventName, note }: { eventName?: string | null; note: string }) {
  return (
    <main className={styles.stage}>
      <div className={styles.idle}>
        <p className={styles.idleClub}>Iloilo Golf &amp; Country Club</p>
        <p className={styles.idleEvent}>{eventName ?? "Club tournament"}</p>
        <p className={styles.idleNote}>{note}</p>
        <div className={styles.idleBrand}>
          <span className={styles.poweredLabel}>Powered by</span>
          <TeeLineLogo variant="reverse" width={240} className={styles.idleLogo} />
          <span className={styles.poweredRule} aria-hidden="true" />
          <img
            src="/partners/converge-logo.svg"
            alt="Converge"
            className={`${styles.convergeLogo} ${styles.convergeLogoIdle}`}
          />
        </div>
      </div>
    </main>
  );
}
