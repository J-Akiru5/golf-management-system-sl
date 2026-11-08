"use client";

import { fmtHcp, fmtIndex, fmtTime } from "@/lib/format";
import { pageLabel, paginate } from "@/lib/print/sheets";
import { sortStartGroups, type PrintStartFormat } from "@/lib/print/start-sheet";
import styles from "./print.module.css";
import type { CourseDataStatus, PrintGroup } from "./types";

export interface StartSheetTableProps {
  eventName: string;
  title: string;
  dayLabel: string;
  formatLine: string;
  versionLine: string;
  groups: readonly PrintGroup[];
  startFormat: PrintStartFormat;
  courseDataStatus: CourseDataStatus;
  showFlight?: boolean;
  showHandicaps?: boolean;
  showTee?: boolean;
  /** Groups per A4 page. Seven four-player groups fit with the repeated header. */
  groupsPerPage?: number;
}

const CLUB = "Iloilo Golf & Country Club";

/**
 * The paper the starter works from: one table ordered by tee time, one row per group, the players
 * named with the numbers they play off, and a narrow Arrived box to tick with a pen. Each page
 * repeats the header row and its own page stamp.
 */
export function StartSheetTable({
  eventName,
  title,
  dayLabel,
  formatLine,
  versionLine,
  groups,
  startFormat,
  courseDataStatus,
  showFlight = true,
  showHandicaps = true,
  showTee = true,
  groupsPerPage = 7,
}: StartSheetTableProps) {
  const ordered = sortStartGroups(
    groups.filter((group) => group.players.length > 0),
    startFormat,
  );
  const pages = paginate(ordered, groupsPerPage);
  const holeWord = startFormat === "shotgun" ? "Hole" : "Tee";

  if (pages.length === 0) {
    return (
      <section className={`${styles.sheet} ${styles.p2StartSheet}`} aria-label="Start sheet">
        <header className={styles.p2PaperHead}>
          <div>
            <p className={styles.p2Club}>{CLUB}</p>
            <h2>{eventName}</h2>
            <p className={styles.p2Kind}>{title}</p>
          </div>
          <div className={styles.p2Stamp}>
            <b>{dayLabel}</b>
            <span>{formatLine}</span>
            <span>{versionLine}</span>
          </div>
        </header>
        <p className={styles.p2Empty}>No groups to print yet.</p>
      </section>
    );
  }

  return (
    <div className={styles.p2StartSheets}>
      {pages.map((pageGroups, index) => (
        <section
          key={index}
          className={`${styles.sheet} ${styles.p2StartSheet}`}
          aria-label={`${title}, ${dayLabel}, ${pageLabel(index + 1, pages.length)}`}
        >
          <header className={styles.p2PaperHead}>
            <div>
              <p className={styles.p2Club}>{CLUB}</p>
              <h2>{eventName}</h2>
              <p className={styles.p2Kind}>{title}</p>
            </div>
            <div className={styles.p2Stamp}>
              <b>{dayLabel}</b>
              <span>{formatLine}</span>
              <span>{versionLine}</span>
              <span>{pageLabel(index + 1, pages.length)}</span>
            </div>
          </header>

          {courseDataStatus === "placeholder" && (
            <p className={styles.courseNotice}>
              <b>PLACEHOLDER COURSE DATA</b> · playing handicaps use sample tee ratings. Confirm
              before using this sheet for an event.
            </p>
          )}
          {courseDataStatus === "missing" && (
            <p className={styles.courseNotice}>
              <b>COURSE DATA NOT ENTERED</b> · confirm tee and hole data before using this sheet.
            </p>
          )}

          <table className={styles.p2StartTable}>
            <thead>
              <tr>
                <th scope="col" className={styles.p2ColTime}>
                  Time
                </th>
                <th scope="col" className={styles.p2ColHole}>
                  {holeWord}
                </th>
                <th scope="col" className={styles.p2ColGroup}>
                  Group
                </th>
                <th scope="col">Players</th>
                <th scope="col" className={styles.p2ColArrived}>
                  Arrived
                </th>
              </tr>
            </thead>
            <tbody>
              {pageGroups.map((group) => (
                <tr key={`${group.startHole}-${group.number}`} className={styles.p2StartRow}>
                  <td className={styles.p2Time}>
                    <time>{fmtTime(group.time)}</time>
                  </td>
                  <td className={styles.p2Hole}>
                    {holeWord} {group.startHole}
                  </td>
                  <td className={styles.p2GroupCell}>
                    <b>Group {group.number}</b>
                    {showFlight && <span className={styles.p2Flight}>{group.flight}</span>}
                  </td>
                  <td>
                    <ol className={styles.p2Players}>
                      {group.players.map((player) => (
                        <li key={player.id}>
                          <span className={styles.p2PlayerName}>{player.name}</span>
                          <span className={styles.p2PlayerFacts}>
                            {showHandicaps && (
                              <>
                                <span>Index {fmtIndex(player.handicapIndex)}</span>
                                <b>PH {fmtHcp(player.playingHandicap)}</b>
                              </>
                            )}
                            {showTee && player.teeName && <span>{player.teeName}</span>}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </td>                  <td className={styles.p2Arrived}>
                    <span className={styles.p2Tick} aria-label="Arrived box" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <footer className={styles.p2PaperFoot}>
            <span>TeeLine Golf</span>
            <span>{versionLine}</span>
            <span>{pageLabel(index + 1, pages.length)}</span>
          </footer>
        </section>
      ))}
    </div>
  );
}
