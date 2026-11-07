"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DayPills } from "@/components/staff/DayPills";
import { useStaffDay } from "@/components/staff/day-context";
import styles from "@/components/staff/staff.module.css";
import { useStaffRows } from "@/components/staff/use-rows";
import { fmtTime } from "@/lib/format";
import { type GroupClaim, readClaim } from "@/lib/staff/claim";
import { useDesk } from "@/lib/store/desk-store";

/**
 * Score: which group this phone is walking with.
 *
 * A phone that already claimed a group for the event and day sees it first as the gold primary
 * card, so continuing is one tap. Every other group follows in tee order. The list is only drawn
 * from the day's published pairs; when the day has no draw, the screen says who publishes it.
 */
export default function StaffScorePage() {
  const { tournament, status, error, offline, reload } = useDesk();
  const { day, days, notice, setDayNumber } = useStaffDay();
  const { schedule } = useStaffRows();
  const [claim, setClaim] = useState<GroupClaim | null>(null);
  const [claimRead, setClaimRead] = useState(false);
  const [scanFirst, setScanFirst] = useState(false);

  useEffect(() => {
    if (!tournament || !day) {
      setClaim(null);
      setClaimRead(true);
      return;
    }
    setClaim(readClaim(tournament.id, day.number));
    setClaimRead(true);
  }, [tournament, day]);

  // The Today screen's "Scan a card" action arrives with ?tab=scan, so the group picked here opens
  // on the scan tab instead of dropping the volunteer into tap scoring.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "scan") setScanFirst(true);
  }, []);

  if (!tournament) {
    return <p className={styles.notice}>No event is selected. Open the full desk first.</p>;
  }

  const claimed = claim ? (schedule.find((group) => group.id === claim.groupId) ?? null) : null;
  const others = claimed ? schedule.filter((group) => group.id !== claimed.id) : schedule;
  const loading = !claimRead || (status === "loading" && schedule.length === 0);
  const failed = Boolean(error) && !offline;

  return (
    <div>
      <h1 className={styles.h1}>Score</h1>
      <p className={styles.sub}>Pick the group you are walking with.</p>

      <DayPills days={days} selected={day?.number ?? null} onSelect={setDayNumber} />
      {notice && <p className={styles.muted}>{notice}</p>}

      {failed && (
        <div className={styles.blockError} role="alert">
          <b>The groups did not load.</b>
          <p>{error}</p>
          <button type="button" className={styles.secondary} onClick={reload}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className={styles.skeletonStack} role="status" aria-label="Loading the groups">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className={styles.skeletonRow}>
              <span className={styles.skeleton} />
              <span className={styles.skeleton} />
            </div>
          ))}
        </div>
      ) : schedule.length === 0 ? (
        failed ? null : (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>
              {day ? "No groups are drawn for this day yet" : "This event has no playing days yet"}
            </p>
            <p>
              {day
                ? "The organizers publish the pairings before groups can be scored."
                : "The organizers set the dates from the full desk before groups can be scored."}
            </p>
            <Link className={`${styles.secondary} ${styles.emptyAction}`} href="/staff/schedule">
              Open the schedule
            </Link>
          </div>
        )
      ) : (
        <>
          {claimed ? (
            <>
              <p className={styles.notice}>
                This phone is walking with group {claimed.number}. Tap another group to switch.
              </p>
              <Link
                className={`${styles.actionCard} ${styles.actionCardPrimary}`}
                href={`/staff/groups/${claimed.id}/score${scanFirst ? "?tab=scan" : ""}`}
                data-onboard="score-entry"
              >
                <span>
                  <b>Continue scoring group {claimed.number}</b>
                  <span>
                    {fmtTime(claimed.time)} · hole {claimed.startHole} · {claimed.flightName}
                  </span>
                  <span>{claimed.players.length} players on this card</span>
                </span>
                <ChevronRight aria-hidden="true" size={24} />
              </Link>
            </>
          ) : (
            <p className={styles.notice}>
              Tap a group to open its sheet. The group stays on this phone until you pick another.
            </p>
          )}

          {others.length > 0 && (
            <>
              {claimed && (
                <div className={styles.sectionHead}>
                  <h2>Other groups</h2>
                  <span>{others.length}</span>
                </div>
              )}
              <div>
                {others.map((group) => (
                  <Link
                    key={group.id}
                    href={`/staff/groups/${group.id}/score${scanFirst ? "?tab=scan" : ""}`}
                    className={styles.groupRow}
                  >
                    <span className={styles.groupNumber}>{group.number}</span>
                    <span className={styles.groupMain}>
                      <b>
                        {fmtTime(group.time)} · hole {group.startHole}
                      </b>
                      <span>
                        {group.flightName} · {group.players.length} players
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
