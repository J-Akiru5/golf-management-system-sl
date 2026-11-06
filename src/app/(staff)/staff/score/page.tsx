"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DayPills } from "@/components/staff/DayPills";
import { useStaffDay } from "@/components/staff/day-context";
import { GroupScore } from "@/components/staff/GroupScore";
import styles from "@/components/staff/staff.module.css";
import { useStaffRows } from "@/components/staff/use-rows";
import { fmtTime } from "@/lib/format";
import { type GroupClaim, readClaim } from "@/lib/staff/claim";
import { useDesk } from "@/lib/store/desk-store";

/**
 * Score: the sheet for the group this phone is walking with. Before a group is claimed it asks
 * which one, because a score sheet with no group is a screen no volunteer can use.
 */
export default function StaffScorePage() {
  const { tournament } = useDesk();
  const { day, days, notice, setDayNumber } = useStaffDay();
  const { schedule } = useStaffRows();
  const [claim, setClaim] = useState<GroupClaim | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!tournament || !day) {
      setClaim(null);
      setLoaded(true);
      return;
    }
    setClaim(readClaim(tournament.id, day.number));
    setLoaded(true);
  }, [tournament, day]);

  const claimed = claim ? (schedule.find((group) => group.id === claim.groupId) ?? null) : null;

  if (!tournament) {
    return <p className={styles.notice}>No event is selected. Open the full desk first.</p>;
  }

  if (loaded && claimed) {
    return <GroupScore groupId={claimed.id} />;
  }

  return (
    <div>
      <h1 className={styles.h1}>Score</h1>
      <p className={styles.sub}>Pick the group you are walking with.</p>

      <DayPills days={days} selected={day?.number ?? null} onSelect={setDayNumber} />
      {notice && <p className={styles.notice}>{notice}</p>}

      {!loaded ? (
        <p className={styles.notice} role="status">
          Loading the groups…
        </p>
      ) : schedule.length === 0 ? (
        <p className={styles.notice}>
          No groups are drawn for this day yet. Open Schedule to see the day, or the full desk if
          the pairings still need publishing.
        </p>
      ) : (
        <>
          <p className={styles.notice}>
            Tap a group to open its sheet. The group stays on this phone until you pick another.
          </p>
          <div>
            {schedule.map((group) => (
              <Link
                key={group.id}
                href={`/staff/groups/${group.id}/score`}
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
    </div>
  );
}
