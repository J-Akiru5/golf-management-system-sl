"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DayPills } from "@/components/staff/DayPills";
import { useStaffDay } from "@/components/staff/day-context";
import styles from "@/components/staff/staff.module.css";
import { useStaffRows } from "@/components/staff/use-rows";
import { fmtTime } from "@/lib/format";
import { useDesk } from "@/lib/store/desk-store";

/**
 * The day's schedule: every group in tee order with its start hole, flight and how many of its
 * players are here. This is the board a starter reads from, not the organizer's control room.
 */
export default function StaffSchedulePage() {
  const { tournament, draw, status, error } = useDesk();
  const { day, days, notice, setDayNumber } = useStaffDay();
  const { rows, schedule } = useStaffRows();
  const [query, setQuery] = useState("");

  const sessions = useMemo(() => {
    const am = rows.filter((row) => row.session === "AM").length;
    const pm = rows.filter((row) => row.session === "PM").length;
    return { am, pm, unset: rows.length - am - pm };
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return schedule;
    return schedule.filter(
      (group) =>
        String(group.number).includes(needle) ||
        group.flightName.toLowerCase().includes(needle) ||
        group.players.some((player) => player.playerName.toLowerCase().includes(needle)),
    );
  }, [schedule, query]);

  return (
    <div>
      <h1 className={styles.h1}>Schedule</h1>
      <p className={styles.sub}>
        {tournament ? tournament.name : "No event"} · {schedule.length} groups · {rows.length}{" "}
        players
      </p>

      <DayPills days={days} selected={day?.number ?? null} onSelect={setDayNumber} />
      {notice && <p className={styles.notice}>{notice}</p>}
      {error && (
        <p className={`${styles.notice} ${styles.noticeBad}`} role="alert">
          {error}
        </p>
      )}

      <p className={styles.notice} style={{ marginTop: 10 }}>
        <b>AM {sessions.am}</b> · <b>PM {sessions.pm}</b>
        {sessions.unset > 0 ? ` · ${sessions.unset} without a session` : ""}
      </p>

      <div className={styles.search}>
        <input
          className={styles.input}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Group number, flight or player"
          aria-label="Search the schedule"
        />
      </div>

      {draw === null && status !== "loading" ? (
        <p className={`${styles.notice} ${styles.noticeWarn}`}>
          No draw for this day yet. The organizers publish the pairings before groups can be scored.
        </p>
      ) : visible.length === 0 ? (
        <p className={styles.notice}>
          Nothing matches that search. Clear it to see every group, or open another day above.
        </p>
      ) : (
        <div>
          {visible.map((group) => (
            <Link key={group.id} href={`/staff/schedule/${group.id}`} className={styles.groupRow}>
              <span className={styles.groupNumber}>{group.number}</span>
              <span className={styles.groupMain}>
                <b>
                  {fmtTime(group.time)} · hole {group.startHole}
                </b>
                <span>
                  {group.flightName} · {group.players.length} players · {group.arrived} arrived
                </span>
              </span>
              <span
                className={`${styles.pill} ${
                  group.arrived === group.players.length ? styles.pillOk : styles.pillWarn
                }`}
              >
                {group.arrived}/{group.players.length}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
