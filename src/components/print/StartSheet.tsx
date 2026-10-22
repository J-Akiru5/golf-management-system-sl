"use client";

import { fmtHcp, fmtIndex, fmtTime } from "@/lib/format";
import { groupStartGroups, type PrintStartFormat } from "@/lib/print/start-sheet";
import styles from "./print.module.css";
import type { CourseDataStatus, PrintGroup } from "./types";

export interface StartSheetProps {
  title: string;
  subtitle: string;
  groups: readonly PrintGroup[];
  startFormat: PrintStartFormat;
  courseDataStatus: CourseDataStatus;
}

/** Print-only start list. All fields are passed in; no player data is fetched here. */
export function StartSheet({
  title,
  subtitle,
  groups,
  startFormat,
  courseDataStatus,
}: StartSheetProps) {
  const groupsWithPlayers = groups.filter((group) => group.players.length > 0);
  const sections = groupStartGroups(groupsWithPlayers, startFormat);

  return (
    <section className={`${styles.sheet} ${styles.startSheet}`} aria-label="Start sheet">
      <header className={styles.sheetHeader}>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </header>

      {courseDataStatus === "placeholder" && (
        <p className={styles.courseNotice}>
          <b>PLACEHOLDER COURSE DATA</b> · Playing handicaps use sample tee ratings. Confirm before
          using these sheets for an event.
        </p>
      )}
      {courseDataStatus === "missing" && (
        <p className={styles.courseNotice}>
          <b>COURSE DATA NOT ENTERED</b> · Confirm tee and hole data before using this sheet.
        </p>
      )}

      {sections.map((section) => (
        <section key={section.key} className={styles.startSection}>
          <h3 className={styles.sectionHeading}>
            {startFormat === "shotgun"
              ? `Wave ${section.wave ?? "not assigned"}`
              : `Tee time ${fmtTime(section.time)}`}
            {startFormat === "shotgun" && section.time && <span>{fmtTime(section.time)}</span>}
          </h3>
          <div className={styles.startGrid}>
            {section.groups.map((group) => (
              <article
                className={styles.startGroup}
                key={`${group.wave ?? "two-tee"}-${group.number}`}
              >
                <header className={styles.groupHeader}>
                  <b>
                    {startFormat === "shotgun"
                      ? `Hole ${group.startHole}${group.wave ?? ""}`
                      : `Tee ${group.startHole}`}
                    <span> · Group {group.number}</span>
                  </b>
                  <time>{fmtTime(group.time)}</time>
                </header>
                <p className={styles.flight}>{group.flight}</p>
                <ol className={styles.playerList}>
                  {group.players.map((player) => (
                    <li key={player.id}>
                      {player.photo && (
                        <img className={styles.playerPhoto} src={player.photo} alt="" />
                      )}
                      <span className={styles.playerName}>{player.name}</span>
                      <span className={styles.playerFacts}>
                        {player.teeName && <span>{player.teeName}</span>}
                        <span>HI {fmtIndex(player.handicapIndex)}</span>
                        <b>PH {fmtHcp(player.playingHandicap)}</b>
                      </span>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </section>
      ))}
      {sections.length === 0 && <p>No groups to print yet.</p>}
    </section>
  );
}
