"use client";

import { ArrowDown, PencilLine, Printer, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DayBar } from "@/components/staff/DayBar";
import { useStaffDay } from "@/components/staff/day-context";
import styles from "@/components/staff/staff.module.css";
import { useStaffRows } from "@/components/staff/use-rows";
import { useManilaNow } from "@/components/staff/use-now";
import { useStaffToast } from "@/components/staff/StaffToast";
import { useDesk } from "@/lib/store/desk-store";
import { daySessions } from "@/lib/data/sessions";
import { fmtTime } from "@/lib/format";
import {
  countGroupSessions,
  dayState,
  dayStateTalk,
  filterGroupsBySession,
  filterScheduleByQuery,
  jumpTargetGroup,
  matchGroup,
  nextUpGroup,
  relativeTalk,
} from "@/lib/staff/schedule";

/**
 * The tee sheet. A starter reads it in tee order: the day, the session, then every group with its
 * start hole and who is here. The group about to go out is marked, "Jump to now" puts it back under
 * the thumb after scrolling, and the search finds a player by name, group, flight, hole or time.
 */
export default function StaffSchedulePage() {
  const { tournament, draw, status, error, reload } = useDesk();
  const { day, days, notice, setDayNumber, session, setSession, dayIndex, dayCount } =
    useStaffDay();
  const { rows, schedule } = useStaffRows();
  const now = useManilaNow();
  const toast = useStaffToast();
  const [query, setQuery] = useState("");
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(
    () => countGroupSessions(schedule, dayIndex, dayCount),
    [schedule, dayIndex, dayCount],
  );
  const sessionGroups = useMemo(
    () => filterGroupsBySession(schedule, session, dayIndex, dayCount),
    [schedule, session, dayIndex, dayCount],
  );
  const visible = useMemo(
    () => filterScheduleByQuery(sessionGroups, query),
    [sessionGroups, query],
  );

  const state = day ? dayState(day.date, now) : "before";
  const next = nextUpGroup(sessionGroups, state, now.minutes);
  const target = jumpTargetGroup(sessionGroups, state, now.minutes);
  const nextDetail = next
    ? state === "today"
      ? relativeTalk(next.time, now.minutes)
      : "first group"
    : null;
  const sessions = daySessions(dayIndex, dayCount);
  const sessionLabel = sessions.find((entry) => entry.key === session)?.label ?? null;

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  function jumpTo(id: string | undefined, kind: "now" | "first" | "last") {
    if (!id) return;
    const element = document.getElementById(`group-${id}`);
    if (!element) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    setFlashId(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashId(null), 1100);
    if (kind !== "now") {
      toast.push({
        title: kind === "first" ? "Showing the first group" : "Showing the last group",
        detail: dayStateTalk(state) || undefined,
      });
    }
  }

  const jumpKind = state === "before" ? "first" : state === "after" ? "last" : "now";

  return (
    <div className={styles.pageWithAction}>
      <h1 className={styles.h1}>Schedule</h1>
      <p className={styles.sub}>
        {tournament ? tournament.name : "No event"}
        {day ? ` · Day ${day.number}` : ""} · {schedule.length} groups · {rows.length} players
      </p>

      <DayBar counts={counts} />

      <div className={styles.stickyTop}>
        <div className={styles.searchRow}>
          <input
            ref={searchRef}
            className={styles.input}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Player, group, flight or hole"
            aria-label="Search the tee sheet"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          {query !== "" && (
            <button
              type="button"
              className={styles.infoButton}
              aria-label="Clear the search"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
            >
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </div>
        <p className={styles.searchCount} suppressHydrationWarning>
          {notice ? `${notice} · ` : ""}
          {query.trim() === ""
            ? `${visible.length} groups${sessionLabel ? ` in the ${sessionLabel} session` : ""} · ${fmtTime(now.clock)} at the club`
            : `${visible.length} ${visible.length === 1 ? "group matches" : "groups match"} “${query.trim()}”`}
          {query.trim() !== "" && visible.length === 1 && visible[0] && (
            <button
              type="button"
              className={styles.jumpInline}
              onClick={() => jumpTo(visible[0]?.id, "now")}
            >
              Jump to group
            </button>
          )}
        </p>
      </div>

      {error && (
        <div className={styles.blockError} role="alert">
          <b>The tee sheet did not load.</b>
          <p>{error}</p>
          <button type="button" className={styles.secondary} onClick={reload}>
            Try again
          </button>
        </div>
      )}

      {status === "loading" && schedule.length === 0 ? (
        <div className={styles.skeletonStack} aria-label="Loading the tee sheet">
          <div className={styles.skeletonRow}>
            <span className={styles.skeleton} />
            <span className={styles.skeleton} />
          </div>
          <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
          <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
          <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
        </div>
      ) : draw === null && status !== "loading" ? (
        <p className={`${styles.notice} ${styles.noticeWarn}`}>
          <b>No confirmed start times for this day yet.</b> The organizers publish the pairings
          first; groups appear here as soon as they do. You can still check players in from the
          Players tab.
        </p>
      ) : schedule.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>This day has no groups yet</p>
          <p>
            The draw is saved but it has nobody in it. Check that this is the right playing day, or
            ask the organizers to place the players.
          </p>
          <Link className={`${styles.primary} ${styles.emptyAction}`} href="/staff/players">
            Open the players list
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {query.trim() === "" ? `No groups in the ${sessionLabel ?? ""} session` : "No group matches"}
          </p>
          <p>
            {query.trim() === ""
              ? "Switch to All day to see every group, or pick the other session above."
              : "Try part of a player's name, a group number, a flight, a hole or a time such as 6:30."}
          </p>
          <button
            type="button"
            className={`${styles.secondary} ${styles.emptyAction}`}
            onClick={() => {
              if (query.trim() !== "") setQuery("");
              else setSession("all");
            }}
          >
            {query.trim() !== "" ? "Clear the search" : "Show all day"}
          </button>
        </div>
      ) : (
        <div aria-label="Groups in tee order">
          {visible.map((group) => {
            const isNext = next?.id === group.id;
            const match = matchGroup(group, query);
            const allHere = group.players.length > 0 && group.arrived === group.players.length;
            return (
              <Link
                key={group.id}
                id={`group-${group.id}`}
                href={`/staff/schedule/${group.id}`}
                className={`${styles.groupCard} ${isNext ? styles.groupCardNext : ""} ${
                  flashId === group.id ? styles.groupCardFlash : ""
                }`}
                aria-label={`Group ${group.number}, ${fmtTime(group.time)}, hole ${group.startHole}, ${group.flightName}, ${group.arrived} of ${group.players.length} arrived`}
              >
                <span className={styles.groupCardHead}>
                  <span>
                    <span className={styles.groupCardTime}>{fmtTime(group.time)}</span>
                    <span className={styles.groupCardMeta}>
                      Group {group.number} · {group.flightName}
                    </span>
                  </span>
                  <span className={styles.groupCardSide}>
                    <span className={styles.holeChip}>Hole {group.startHole}</span>
                    <span className={`${styles.pill} ${allHere ? styles.pillOk : styles.pillWarn}`}>
                      {group.arrived}/{group.players.length} here
                    </span>
                    {isNext && (
                      <span className={styles.nextUpBadge} data-onboard="next-up">
                        Next up
                      </span>
                    )}
                  </span>
                </span>
                <span className={styles.groupPlayers}>
                  {group.players.map((player, index) => (
                    <span
                      key={player.playerId}
                      className={styles.playerChip}
                      data-in={group.arrivals[index] === true}
                      data-match={match.playerIds.includes(player.playerId)}
                    >
                      <i aria-hidden="true" />
                      <span>{player.playerName}</span>
                      {group.arrivals[index] ? (
                        <span className={styles.srOnly}>arrived</span>
                      ) : (
                        <span className={styles.srOnly}>expected</span>
                      )}
                    </span>
                  ))}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <div className={styles.toolRow} style={{ marginTop: 16 }}>
        <Link className={styles.toolLink} href="/staff/pairings">
          <PencilLine aria-hidden="true" size={18} />
          Edit pairings
        </Link>
        <Link className={styles.toolLink} href="/staff/print">
          <Printer aria-hidden="true" size={18} />
          Print
        </Link>
      </div>

      {isNextDetailVisible(state, nextDetail) && (
        <p className={styles.muted} aria-live="polite" suppressHydrationWarning>
          {nextDetail === "first group"
            ? "The marked group is the first to tee off on this day."
            : `The marked group is next, ${nextDetail}.`}
        </p>
      )}

      <div className={styles.stickyActionBar}>
        <button
          type="button"
          className={styles.primary}
          onClick={() => jumpTo(target?.id, jumpKind)}
          disabled={!target}
          data-onboard="jump-to-now"
        >
          <ArrowDown size={20} aria-hidden="true" style={{ marginRight: 8 }} />
          Jump to now
        </button>
        <p className={styles.jumpHint} suppressHydrationWarning>
          {state === "today"
            ? `It is ${fmtTime(now.clock)} at the club.`
            : state === "before"
              ? "This day has not started. The button shows the first group."
              : "Every group has teed off. The button shows the last group."}
        </p>
      </div>
    </div>
  );
}

/** The sentence under the sheet is only useful while there is a marked group. */
function isNextDetailVisible(state: "before" | "today" | "after", detail: string | null): boolean {
  return state !== "after" && detail !== null;
}
