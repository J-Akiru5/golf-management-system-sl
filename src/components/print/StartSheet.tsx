"use client";

import { fmtHcp, fmtIndex, fmtTime } from "@/lib/format";
import { groupRowLabels, pairingsColumns } from "@/lib/print/pairings";
import { groupSessions, type PrintStartFormat, type StartSession } from "@/lib/print/start-sheet";
import styles from "./print.module.css";
import type { CourseDataStatus, PrintGroup } from "./types";

export interface StartSheetProps {
  title: string;
  subtitle: string;
  /** The event's name, shown large in the header. Falls back to the title. */
  eventName?: string;
  groups: readonly PrintGroup[];
  startFormat: PrintStartFormat;
  courseDataStatus: CourseDataStatus;
  /** The group's class (its flight in the data), printed small under the hole. */
  showFlight?: boolean;
  showTee?: boolean;
  showHandicaps?: boolean;
}

/** How tight the type is set, so a whole session still fits one A4 page. */
function density(session: StartSession<PrintGroup>): "roomy" | "compact" | "tight" {
  const count = session.flights.reduce((total, flight) => total + flight.groups.length, 0);
  if (count > 36) return "tight";
  if (count > 26) return "compact";
  return "roomy";
}

/**
 * Print-only start list. One sheet per session: the morning waves on one page, the afternoon waves
 * on the next. Inside a sheet each wave is a flight (Flight A, Flight B), and each group's class is
 * a small label under its hole. All fields are passed in; no player data is fetched here.
 */
export function StartSheet({
  title,
  subtitle,
  eventName,
  groups,
  startFormat,
  courseDataStatus,
  showFlight = true,
  showTee = true,
  showHandicaps = true,
}: StartSheetProps) {
  const groupsWithPlayers = groups.filter((group) => group.players.length > 0);
  const sessions = groupSessions(groupsWithPlayers, startFormat);
  const columns = pairingsColumns(groupsWithPlayers.map((group) => group.players.length));
  const shotgun = startFormat === "shotgun";
  const noun = shotgun ? "HOLE" : "TEE";
  const heading = eventName ?? title;
  // The subtitle already leads with the event name; the header shows it once.
  const details =
    eventName && subtitle.startsWith(`${eventName} · `)
      ? subtitle.slice(eventName.length + 3)
      : subtitle;

  if (sessions.length === 0) {
    return (
      <section className={styles.sheet} aria-label="Start sheet">
        <header className={styles.sheetHeader}>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </header>
        <p>No groups to print yet.</p>
      </section>
    );
  }

  return (
    <div className={styles.startSessions}>
      {sessions.map((session) => (
        <section
          key={session.key}
          className={`${styles.sheet} ${styles.startPage} ${styles[`density_${density(session)}`]}`}
          aria-label={`${title} · ${session.label}`}
        >
          <header className={styles.startHeader}>
            <img
              className={styles.brandLogo}
              src="/brand/teeline-horizontal-primary.svg"
              alt="TeeLine Golf"
            />
            <div className={styles.startEvent}>
              <p className={styles.pairingKicker}>
                {title} · {session.label}
              </p>
              <h2>{heading}</h2>
              <p className={styles.pairingDate}>{details}</p>
            </div>
          </header>

          {courseDataStatus === "placeholder" && (
            <p className={styles.courseNotice}>
              <b>PLACEHOLDER COURSE DATA</b> · Playing handicaps use sample tee ratings. Confirm
              before using these sheets for an event.
            </p>
          )}
          {courseDataStatus === "missing" && (
            <p className={styles.courseNotice}>
              <b>COURSE DATA NOT ENTERED</b> · Confirm tee and hole data before using this sheet.
            </p>
          )}

          <table className={styles.drawTable}>
            <thead>
              <tr>
                <th scope="col">{shotgun ? "Hole" : "Tee"}</th>
                {Array.from({ length: columns }, (_, column) => (
                  <th key={column} scope="col">
                    Player {column + 1}
                  </th>
                ))}
              </tr>
            </thead>
            {session.flights.map((flight) => {
              const labels = groupRowLabels(flight.groups, noun);
              return (
                <tbody key={flight.letter} className={styles.drawFlight}>
                  <tr className={styles.drawBand} data-print-band>
                    <td colSpan={columns + 1}>
                      {flight.name} · {fmtTime(flight.time)} {shotgun ? "Shotgun" : "Two-tee"} ·{" "}
                      {flight.groups.length} {flight.groups.length === 1 ? "group" : "groups"}
                    </td>
                  </tr>
                  {flight.groups.map((group, index) => (
                    <tr key={`${group.startHole}-${group.number}`} className={styles.drawRow}>
                      <th scope="row" className={styles.drawHole}>
                        {labels[index]}
                        <small>
                          G{group.number}
                          {showFlight && group.flight ? ` · ${group.flight}` : ""}
                        </small>
                      </th>
                      {Array.from({ length: columns }, (_, column) => {
                        const player = group.players[column];
                        return (
                          <td key={column}>
                            {player && (
                              <>
                                <span className={styles.drawName}>{player.name}</span>
                                <span className={styles.drawFacts}>
                                  {showTee && player.teeName ? `${player.teeName} · ` : ""}
                                  {showHandicaps && (
                                    <>
                                      HI {fmtIndex(player.handicapIndex)} ·{" "}
                                      <b>PH {fmtHcp(player.playingHandicap)}</b>
                                    </>
                                  )}
                                </span>
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>

          <footer className={styles.pairingFooter}>
            <span>
              {heading} · {title} · {session.label}
            </span>
            <span>TeeLine Golf</span>
          </footer>
        </section>
      ))}
    </div>
  );
}
