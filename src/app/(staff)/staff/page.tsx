"use client";

import { ClipboardCheck, ClipboardPlus, ScanLine, Search, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DayPills } from "@/components/staff/DayPills";
import { useStaffDay } from "@/components/staff/day-context";
import styles from "@/components/staff/staff.module.css";
import { useManilaNow } from "@/components/staff/use-now";
import { useStaffRows } from "@/components/staff/use-rows";
import { daySessions, sessionForTime } from "@/lib/data/sessions";
import { fmtTime } from "@/lib/format";
import { type GroupClaim, readClaim } from "@/lib/staff/claim";
import { fmtDayDate } from "@/lib/staff/day";
import { summarise, unplacedRows } from "@/lib/staff/rows";
import { dayState, nextUpGroup, relativeTalk } from "@/lib/staff/schedule";
import { useDesk } from "@/lib/store/desk-store";

/**
 * Today: the one screen a volunteer opens first. It answers, above the fold, which day and session
 * it is, how many players are here, and which group tees next. The four jobs follow, and the one
 * that helps most stays in reach above the tab bar.
 */
export default function StaffTodayPage() {
  const { tournament, status, error, draw, reload, offline } = useDesk();
  const { day, days, setDayNumber, dayIndex, dayCount } = useStaffDay();
  const { rows, schedule } = useStaffRows();
  const now = useManilaNow();
  const [claim, setClaim] = useState<GroupClaim | null>(null);

  useEffect(() => {
    if (!tournament || !day) {
      setClaim(null);
      return;
    }
    setClaim(readClaim(tournament.id, day.number));
  }, [tournament, day]);

  const counts = summarise(rows);
  const unplaced = unplacedRows(rows);
  const state = day ? dayState(day.date, now) : "before";
  const nextGroup = nextUpGroup(schedule, state, now.minutes);
  const claimedGroup = claim
    ? (schedule.find((group) => group.id === claim.groupId) ?? null)
    : null;
  const currentSession =
    day && state === "today" ? sessionForTime(now.clock, dayIndex, dayCount) : null;
  const sessions = daySessions(dayIndex, dayCount);
  const firstTee = schedule[0]?.time ?? null;
  const arrivedShare = counts.total === 0 ? 0 : Math.round((counts.arrived / counts.total) * 100);
  const loading = status === "loading" && rows.length === 0;

  return (
    <div className={styles.pageWithAction}>
      <h1 className={styles.h1}>Today</h1>
      <p className={styles.sub}>
        {tournament ? tournament.name : "No event selected"} · check in, find a player, score a
        group
      </p>

      {error && !offline && (
        <div className={styles.blockError} role="alert">
          <b>The desk did not load.</b>
          <p>{error}</p>
          <button type="button" className={styles.secondary} onClick={reload}>
            Try again
          </button>
        </div>
      )}

      <DayPills days={days} selected={day?.number ?? null} onSelect={setDayNumber} />

      {!day && status !== "loading" && (
        <p className={`${styles.notice} ${styles.noticeWarn}`}>
          This event has no playing days yet. The organizers set the dates from the full desk.
        </p>
      )}

      {loading ? (
        <div className={styles.skeletonStack} aria-label="Loading today">
          <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
          <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
          <div className={styles.skeletonRow}>
            <span className={styles.skeleton} />
            <span className={styles.skeleton} />
          </div>
        </div>
      ) : (
        <>
          {day && (
            <section className={styles.hero} aria-label="Where the day is now">
              <span className={styles.heroEyebrow} suppressHydrationWarning>
                Day {day.number} · {fmtDayDate(day.date)}
                {state === "today" && currentSession ? ` · ${currentSession.label} session` : ""}
              </span>
              <span className={styles.heroCount}>
                {counts.arrived}
                <small>of {counts.total} arrived</small>
              </span>
              <div
                className={styles.heroProgress}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={counts.total}
                aria-valuenow={counts.arrived}
                aria-label="Players arrived"
              >
                <div className={styles.heroProgressBar} style={{ width: `${arrivedShare}%` }} />
              </div>
              <span className={styles.heroFoot} suppressHydrationWarning>
                {state === "today"
                  ? `It is ${fmtTime(now.clock)} at the club${currentSession ? `, so this is the ${currentSession.label} session` : ""}.`
                  : state === "before"
                    ? firstTee
                      ? `Play has not started on this day. First tee at ${fmtTime(firstTee)}.`
                      : `Play has not started on this day. The ${sessions[0]?.label ?? "AM"} session is set for ${fmtTime(sessions[0]?.time ?? "06:30")}.`
                    : "Every group has teed off on this day."}
              </span>
            </section>
          )}

          {counts.total === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Nobody is entered for this day yet</p>
              <p>
                Check that this is the right playing day. If somebody turns up without an entry, add
                them as a walk-up and they appear on this list.
              </p>
              <Link className={`${styles.primary} ${styles.emptyAction}`} href="/staff/add">
                Add a walk-up
              </Link>
            </div>
          ) : nextGroup ? (
            <Link
              className={styles.actionCard}
              href={`/staff/schedule/${nextGroup.id}`}
              data-onboard="next-up"
            >
              <span>
                <b>
                  {state === "before" ? "First up" : "Next up"}: group {nextGroup.number}
                </b>
                <span suppressHydrationWarning>
                  {fmtTime(nextGroup.time)} · hole {nextGroup.startHole} · {nextGroup.flightName} ·{" "}
                  {state === "today" ? relativeTalk(nextGroup.time, now.minutes) : "first group"}
                </span>
                <span>
                  {nextGroup.arrived} of {nextGroup.players.length} arrived
                </span>
              </span>
              <Users aria-hidden="true" size={26} />
            </Link>
          ) : draw === null ? (
            <Link className={styles.actionCard} href="/staff/schedule">
              <span>
                <b>The draw is not out yet</b>
                <span>
                  Players can still be checked in. Groups appear here when the organizers publish
                  the pairings.
                </span>
              </span>
              <ClipboardCheck aria-hidden="true" size={26} />
            </Link>
          ) : (
            <Link className={styles.actionCard} href="/staff/schedule">
              <span>
                <b>Every group has teed off</b>
                <span>Open the schedule to look back at the tee sheet.</span>
              </span>
              <ClipboardCheck aria-hidden="true" size={26} />
            </Link>
          )}

          {claimedGroup && (
            <Link
              className={`${styles.actionCard} ${styles.actionCardPrimary}`}
              href={`/staff/groups/${claimedGroup.id}/score`}
              data-onboard="score-entry"
            >
              <span>
                <b>Score group {claimedGroup.number}</b>
                <span>
                  {fmtTime(claimedGroup.time)} · hole {claimedGroup.startHole} ·{" "}
                  {claimedGroup.flightName}
                </span>
              </span>
              <ClipboardCheck aria-hidden="true" size={26} />
            </Link>
          )}

          <div className={styles.actionGrid} aria-label="Things to do">
            <Link
              className={`${styles.bigAction} ${counts.notArrived > 0 ? styles.bigActionPrimary : ""}`}
              href="/staff/players"
            >
              <ClipboardCheck aria-hidden="true" size={24} />
              <b>Check in</b>
              <span>
                {counts.notArrived > 0 ? `${counts.notArrived} still expected` : "Everyone is here"}
              </span>
            </Link>
            <Link className={styles.bigAction} href="/staff/players">
              <Search aria-hidden="true" size={24} />
              <b>Find a player</b>
              <span>Name, group or phone</span>
            </Link>
            <Link className={styles.bigAction} href="/staff/add">
              <ClipboardPlus aria-hidden="true" size={24} />
              <b>Add walk-up</b>
              <span>No entry on file</span>
            </Link>
            <Link
              className={styles.bigAction}
              href={
                claim ? `/staff/groups/${claim.groupId}/score?tab=scan` : "/staff/score?tab=scan"
              }
              data-onboard="score-entry"
            >
              <ScanLine aria-hidden="true" size={24} />
              <b>Scan a card</b>
              <span>{claim ? `Group ${claim.groupNumber}` : "Pick your group first"}</span>
            </Link>
          </div>

          {draw === null && status !== "loading" && (
            <p className={`${styles.notice} ${styles.noticeWarn}`}>
              The draw for this day has not been made yet. Players can still be checked in; there is
              no group to score until the organizers publish the pairings.
            </p>
          )}

          {unplaced.length > 0 && (
            <section>
              <div className={styles.sectionHead}>
                <h2>Not in a group</h2>
                <span>{unplaced.length}</span>
              </div>
              <p className={styles.noticeWarn} style={{ padding: 12, borderRadius: 12 }}>
                {unplaced
                  .slice(0, 6)
                  .map((row) => row.name)
                  .join(", ")}
                {unplaced.length > 6 ? ` and ${unplaced.length - 6} more` : ""}. The organizers need
                to place them before they can be scored.
              </p>
            </section>
          )}
        </>
      )}

      <div className={styles.stickyActionBar}>
        {counts.notArrived > 0 ? (
          <Link className={styles.primary} href="/staff/players">
            <ClipboardCheck size={20} aria-hidden="true" style={{ marginRight: 8 }} />
            Check in players ({counts.notArrived})
          </Link>
        ) : (
          <Link className={styles.primary} href="/staff/schedule">
            Open the tee sheet
          </Link>
        )}
      </div>
    </div>
  );
}
