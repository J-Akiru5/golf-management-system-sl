"use client";

import { ScanLine, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArriveButton } from "@/components/staff/ArriveButton";
import { useStaffDay } from "@/components/staff/day-context";
import styles from "@/components/staff/staff.module.css";
import { useStaffRows } from "@/components/staff/use-rows";
import type { ScoringRoundView } from "@/lib/data/scoring";
import { fmtTime } from "@/lib/format";
import { writeClaim } from "@/lib/staff/claim";
import { parseStaffGroupId, rowsInGroup } from "@/lib/staff/rows";
import { useDesk } from "@/lib/store/desk-store";

/**
 * One group: who is in it, who has arrived, and the two ways to score it. Claiming is a fact about
 * this phone, so the Today screen can put the group's score sheet first next time.
 */
export default function StaffGroupPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const parsed = parseStaffGroupId(id);
  const router = useRouter();
  const { tournament, scoring, status } = useDesk();
  const { day, setDayNumber } = useStaffDay();
  const { schedule, rows: allRows } = useStaffRows();
  const [view, setView] = useState<ScoringRoundView | null>(null);
  const [scoringError, setScoringError] = useState("");

  // A link may come from another day's screen (a shared phone, a bookmark), so the day follows the
  // group in the address rather than the other way round.
  useEffect(() => {
    if (parsed && day && parsed.dayNumber !== day.number) setDayNumber(parsed.dayNumber);
  }, [parsed, day, setDayNumber]);

  useEffect(() => {
    if (!tournament || status === "loading") return;
    let cancelled = false;
    scoring
      .loadRound(tournament.id)
      .then((next) => {
        if (!cancelled) setView(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setScoringError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [tournament, scoring, status]);

  if (!tournament) {
    return <p className={styles.notice}>No event is selected. Open the full desk first.</p>;
  }

  if (!parsed) {
    return (
      <div>
        <h1 className={styles.h1}>Group</h1>
        <p className={styles.noticeBad}>That group link is not readable.</p>
        <Link className={styles.linkButton} href="/staff/schedule">
          Back to the schedule
        </Link>
      </div>
    );
  }

  const group = schedule.find((candidate) => candidate.id === id) ?? null;

  if (!group) {
    return (
      <div>
        <h1 className={styles.h1}>Group not on this day</h1>
        <p className={styles.notice}>
          Day {parsed.dayNumber} has no group {parsed.groupNumber} in the saved draw. It may have
          been re-drawn; open the schedule to see the current groups.
        </p>
        <Link className={styles.linkButton} href="/staff/schedule">
          Back to the schedule
        </Link>
      </div>
    );
  }

  const rows = rowsInGroup(allRows, group.id);
  const cardByPlayer = new Map(
    (view?.cards ?? [])
      .filter((card) => card.status !== "rejected" && card.status !== "revoked")
      .map((card) => [card.playerId, card.status]),
  );

  function claimAnd(target: NonNullable<typeof group>, scan: boolean) {
    if (!tournament || !day) return;
    writeClaim({
      tournamentId: tournament.id,
      dayNumber: day.number,
      groupId: target.id,
      groupNumber: target.number,
    });
    router.push(`/staff/groups/${target.id}/score${scan ? "?tab=scan" : ""}`);
  }

  return (
    <div>
      <h1 className={styles.h1}>Group {group.number}</h1>
      <p className={styles.sub}>
        {fmtTime(group.time)} · hole {group.startHole} · {group.flightName} · {group.players.length}{" "}
        players
      </p>

      {scoringError && (
        <p className={`${styles.notice} ${styles.noticeWarn}`} role="status">
          Card states are not available right now: {scoringError}. Scoring still works; the desk
          checks every card afterwards.
        </p>
      )}

      <ul className={styles.list}>
        {rows.map((row) => {
          const cardStatus = cardByPlayer.get(row.playerId);
          return (
            <li key={row.entryId} className={styles.row}>
              <span className={styles.rowMain}>
                <b>{row.name}</b>
                <span className={styles.rowMeta}>
                  {row.arrived ? (
                    <span className={styles.pillOk}>Arrived</span>
                  ) : (
                    <span>Expected</span>
                  )}
                  {cardStatus ? <span className={styles.pillWarn}>{cardStatus}</span> : null}
                </span>
              </span>
              {day && (
                <ArriveButton
                  entryId={row.entryId}
                  dayNumber={day.number}
                  name={row.name}
                  arrived={row.arrived}
                  compact
                />
              )}
            </li>
          );
        })}
      </ul>

      <div className={styles.buttonRow}>
        <button type="button" className={styles.primary} onClick={() => claimAnd(group, false)}>
          <Users aria-hidden="true" size={20} style={{ marginRight: 8 }} />I am scoring this group
        </button>
        <button type="button" className={styles.secondary} onClick={() => claimAnd(group, true)}>
          <ScanLine aria-hidden="true" size={20} style={{ marginRight: 8 }} />
          Scan a card
        </button>
      </div>

      <p className={styles.notice} style={{ marginTop: 14 }}>
        Scoring only submits cards. Approving, correcting and publishing stay with the desk.
      </p>
    </div>
  );
}
