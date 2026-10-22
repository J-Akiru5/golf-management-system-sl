"use client";

import type { PublicPairings } from "@/lib/data/types";
import { fmtTime } from "@/lib/format";
import styles from "./print.module.css";

export interface PairingsSheetProps {
  pairings: PublicPairings;
  title?: string;
}

/** Print view accepts only the public allow-list projection, never player or registration records. */
export function PairingsSheet({ pairings, title = "Pairings" }: PairingsSheetProps) {
  const shotgun = pairings.startFormat === "shotgun";

  return (
    <section className={`${styles.sheet} ${styles.pairingsSheet}`} aria-labelledby="pairings-title">
      <header className={styles.sheetHeader}>
        <h2 id="pairings-title">{title}</h2>
        <p>
          {pairings.tournamentName} · {pairings.dateLabel}
        </p>
      </header>
      {pairings.groups.length > 0 ? (
        <table className={styles.pairingsTable}>
          <thead>
            <tr>
              <th scope="col">Start</th>
              <th scope="col">Time</th>
              <th scope="col">Flight</th>
              <th scope="col">Players</th>
            </tr>
          </thead>
          <tbody>
            {pairings.groups.map((group) => (
              <tr className={styles.pairingRow} key={group.number}>
                <th scope="row">
                  {shotgun
                    ? `Hole ${group.startHole}${group.wave ? ` · Wave ${group.wave}` : ""}`
                    : `Tee ${group.startHole}`}
                </th>
                <td>{fmtTime(group.time)}</td>
                <td>{group.flight}</td>
                <td>{group.players.map((player) => player.name).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No published pairings are available.</p>
      )}
    </section>
  );
}
