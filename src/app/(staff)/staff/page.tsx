"use client";

import { ClipboardCheck, ClipboardPlus, ScanLine, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DayPills } from "@/components/staff/DayPills";
import { useStaffDay } from "@/components/staff/day-context";
import styles from "@/components/staff/staff.module.css";
import { useStaffRows } from "@/components/staff/use-rows";
import { accessProblemCopy } from "@/lib/auth/access-problem";
import { fmtTime } from "@/lib/format";
import { type GroupClaim, readClaim } from "@/lib/staff/claim";
import { summarise, unplacedRows } from "@/lib/staff/rows";
import { useDesk } from "@/lib/store/desk-store";

/**
 * Today: the one screen a volunteer opens first. The day, how many players are here, the group
 * this phone is walking with, and four things that start a job.
 */
export default function StaffTodayPage() {
  const { tournament, status, error, accessProblem, draw } = useDesk();
  const { day, days, notice, setDayNumber } = useStaffDay();
  const { rows, schedule } = useStaffRows();
  const [claim, setClaim] = useState<GroupClaim | null>(null);

  useEffect(() => {
    if (!tournament || !day) {
      setClaim(null);
      return;
    }
    const stored = readClaim(tournament.id, day.number);
    setClaim(stored);
  }, [tournament, day]);

  const counts = summarise(rows);
  const unplaced = unplacedRows(rows);
  const nextGroup = schedule.find((group) => group.arrived < group.players.length) ?? schedule[0];
  const claimedGroup = claim ? schedule.find((group) => group.id === claim.groupId) : null;

  return (
    <div>
      <h1 className={styles.h1}>Today</h1>
      <p className={styles.sub}>
        {tournament ? tournament.name : "No event selected"} · check in, find a player, score a
        group
      </p>

      {!accessProblem && status === "loading" && (
        <p className={styles.notice} role="status">
          Loading the desk…
        </p>
      )}
      {error && (
        <p className={`${styles.notice} ${styles.noticeBad}`} role="alert">
          {error}
        </p>
      )}
      {accessProblem &&
        (() => {
          const copy = accessProblemCopy(accessProblem);
          return (
            <p className={`${styles.notice} ${styles.noticeBad}`} role="alert">
              <b>{copy.title}.</b> {copy.body} {copy.next}
            </p>
          );
        })()}

      <DayPills days={days} selected={day?.number ?? null} onSelect={setDayNumber} />
      {notice && <p className={styles.notice}>{notice}</p>}

      {day && draw === null && status !== "loading" && (
        <p className={`${styles.notice} ${styles.noticeWarn}`}>
          The draw for this day has not been made yet. Players can still be checked in; there is no
          group to score until the organizers publish the pairings.
        </p>
      )}

      <section className={styles.tiles} aria-label="Arrivals">
        <div className={styles.tile}>
          <b>{counts.arrived}</b>
          <span>Arrived</span>
        </div>
        <div className={styles.tile}>
          <b>{counts.notArrived}</b>
          <span>Still expected</span>
        </div>
        <div className={styles.tile}>
          <b>{schedule.length}</b>
          <span>Groups</span>
        </div>
        <div className={styles.tile}>
          <b>{counts.needsReview}</b>
          <span>Need review</span>
        </div>
      </section>

      {claimedGroup ? (
        <Link
          className={`${styles.actionCard} ${styles.actionCardPrimary}`}
          href={`/staff/groups/${claimedGroup.id}/score`}
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
      ) : (
        nextGroup && (
          <Link className={styles.actionCard} href={`/staff/schedule/${nextGroup.id}`}>
            <span>
              <b>Next wave: group {nextGroup.number}</b>
              <span>
                {fmtTime(nextGroup.time)} · hole {nextGroup.startHole} · {nextGroup.arrived}/
                {nextGroup.players.length} arrived
              </span>
            </span>
            <ClipboardCheck aria-hidden="true" size={26} />
          </Link>
        )
      )}

      <div className={styles.actions}>
        <Link className={styles.actionCard} href="/staff/players">
          <span>
            <b>Check in</b>
            <span>{counts.notArrived} still expected</span>
          </span>
          <ClipboardCheck aria-hidden="true" size={24} />
        </Link>
        <Link className={styles.actionCard} href="/staff/players">
          <span>
            <b>Find a player</b>
            <span>Name, group or phone</span>
          </span>
          <Search aria-hidden="true" size={24} />
        </Link>
        <Link className={styles.actionCard} href="/staff/add">
          <span>
            <b>Add walk-up</b>
            <span>Somebody who did not enter</span>
          </span>
          <ClipboardPlus aria-hidden="true" size={24} />
        </Link>
        <Link
          className={styles.actionCard}
          href={claim ? `/staff/groups/${claim.groupId}/score?tab=scan` : "/staff/score?tab=scan"}
        >
          <span>
            <b>Scan a card</b>
            <span>{claim ? `Group ${claim.groupNumber}` : "Pick your group first"}</span>
          </span>
          <ScanLine aria-hidden="true" size={24} />
        </Link>
      </div>

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
            {unplaced.length > 6 ? ` and ${unplaced.length - 6} more` : ""}. The organizers need to
            place them before they can be scored.
          </p>
        </section>
      )}
    </div>
  );
}
