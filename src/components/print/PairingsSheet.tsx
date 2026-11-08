"use client";

import type { PublicPairings } from "@/lib/data/types";
import { fmtTime } from "@/lib/format";
import { groupRowLabels, pairingsColumns } from "@/lib/print/pairings";
import { groupStartGroups } from "@/lib/print/start-sheet";
import styles from "./print.module.css";

export interface PairingsSheetProps {
  pairings: PublicPairings;
  title?: string;
  /** The sheet was built from the working board, not the published snapshot. */
  draft?: boolean;
}

/**
 * The pairing sheet the club posts: one page per start time, the event name and its tee-off time
 * across the top, then a row per group — the hole on the left and one name per column, exactly as the club's own
 * sheet is laid out. A second group sent to the same hole is the "HOLE 3B" row.
 *
 * Print view accepts only the public allow-list projection, never player or registration records.
 */
export function PairingsSheet({ pairings, title = "Pairings", draft = false }: PairingsSheetProps) {
  const shotgun = pairings.startFormat === "shotgun";
  const sections = groupStartGroups(pairings.groups, pairings.startFormat);
  const columns = pairingsColumns(pairings.groups.map((group) => group.players.length));
  const noun = shotgun ? "HOLE" : "TEE";

  if (pairings.groups.length === 0) {
    return (
      <section className={styles.sheet}>
        <h2>{title}</h2>
        {draft && <p className={styles.draftMark}>Draft · not published · for desk use only</p>}
        <p>
          {draft
            ? "No players are placed on this day's board yet."
            : "No published pairings are available."}
        </p>
      </section>
    );
  }

  return (
    <div className={styles.pairingsPages}>
      {sections.map((section) => {
        const labels = groupRowLabels(section.groups, noun);
        return (
          <section
            key={section.key}
            className={`${styles.sheet} ${styles.pairingPage}`}
            aria-label={`${pairings.tournamentName}, ${fmtTime(section.time)}`}
          >
            <header className={styles.pairingHeader}>
              <img
                className={styles.brandLogo}
                src="/brand/teeline-horizontal-primary.svg"
                alt="TeeLine Golf"
              />
              <div className={styles.pairingEvent}>
                <p className={styles.pairingKicker}>{title}</p>
                <h2>{pairings.tournamentName}</h2>
                <p className={styles.pairingDate}>{pairings.dateLabel}</p>
                <p className={styles.teeOff}>
                  {fmtTime(section.time)} {shotgun ? "SHOTGUN" : "TWO-TEE"}
                </p>
              </div>
            </header>

            {draft && <p className={styles.draftMark}>Draft · not published · for desk use only</p>}

            <table className={styles.holeTable}>
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
              <tbody>
                {section.groups.map((group, index) => (
                  <tr key={group.number} className={styles.holeRow}>
                    <th scope="row" className={styles.holeCell}>
                      {labels[index]}
                    </th>
                    {Array.from({ length: columns }, (_, column) => (
                      <td key={column}>{group.players[column]?.name ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <footer className={styles.pairingFooter}>
              <span>{pairings.tournamentName}</span>
              <span>
                {sections.length > 1
                  ? `Sheet ${sections.indexOf(section) + 1} of ${sections.length} · `
                  : ""}
                TeeLine Golf
              </span>
            </footer>
          </section>
        );
      })}
    </div>
  );
}
