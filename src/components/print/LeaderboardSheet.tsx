import { Fragment } from "react";
import {
  formatPoints,
  type LeaderboardPair,
  type LeaderboardPlayer,
  type LeaderboardSheet as LeaderboardSheetModel,
} from "@/lib/print/leaderboard-sheet";
import styles from "./print.module.css";

const SIDE_LABEL: Record<LeaderboardPlayer["side"], string> = {
  member: "Member",
  guest: "Guest",
};

function PairRow({
  pair,
  player,
  showTeamTotal,
}: {
  pair: LeaderboardPair;
  player: LeaderboardPlayer;
  showTeamTotal: boolean;
}) {
  return (
    <tr>
      <th scope="row" className={styles.pairCell}>
        <span className={styles.pairNumber}>Pair {pair.pairNumber ?? "—"}</span>
        <span className={styles.sideLine}>{SIDE_LABEL[player.side]}</span>
        <span className={styles.nameLine}>{player.name}</span>
        {showTeamTotal && pair.teamTotal !== null && pair.teamTotal !== undefined && (
          <span className={styles.teamTotal}>Team total {pair.teamTotal}</span>
        )}
      </th>
      <td className={styles.classCell}>{pair.className ?? "—"}</td>
      <td className={styles.hcpCell}>{player.courseHandicap ?? "—"}</td>
      {player.cells.map((cell, index) => (
        <td key={index} className={styles.dayCell}>
          {cell.points === null ? (
            <span className={styles.dash}>—</span>
          ) : (
            <>
              <b>{cell.points}</b>
              {cell.session && <span className={styles.sessionMark}>{cell.session}</span>}
            </>
          )}
        </td>
      ))}
      <td className={styles.totalCell}>{formatPoints(player.total ?? null)}</td>
    </tr>
  );
}

/**
 * One printed scores leaderboard. The pairs are in leaderboard order, each pair takes two rows
 * (member and guest), and every day cell carries the player's net Stableford points with the
 * recorded AM/PM session underneath.
 */
export function LeaderboardSheet({ sheet }: { sheet: LeaderboardSheetModel }) {
  return (
    <section className={`${styles.sheet} print-sheet`} aria-label="Scores leaderboard">
      <header className={styles.pairingHeader}>
        <img
          className={styles.brandLogo}
          src="/brand/teeline-horizontal-primary.svg"
          alt="TeeLine Golf"
        />
        <div className={styles.pairingEvent}>
          <p className={styles.pairingKicker}>Scores leaderboard</p>
          <h2>{sheet.eventName}</h2>
          <p className={styles.pairingDate}>As of {sheet.asOf || "—"}</p>
        </div>
      </header>

      <table className={`${styles.leaderboardTable} print-table`}>
        <colgroup>
          <col style={{ width: "24%" }} />
          <col style={{ width: "13%" }} />
          <col style={{ width: "11%" }} />
          {sheet.days.map((day) => (
            <col key={day.dayNumber} style={{ width: "10%" }} />
          ))}
          <col style={{ width: "12%" }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Pair</th>
            <th scope="col">Class</th>
            <th scope="col" className={styles.hcpCell}>
              Course HCP
            </th>
            {sheet.days.map((day) => (
              <th key={day.dayNumber} scope="col" className={styles.dayCell}>
                {day.label}
                {day.dateLabel && <span className={styles.dayDate}>{day.dateLabel}</span>}
              </th>
            ))}
            <th scope="col" className={styles.totalCell}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {sheet.pairs.map((pair) => (
            <Fragment key={pair.pairNumber ?? `${pair.member.name}-${pair.guest.name}`}>
              <PairRow pair={pair} player={pair.member} showTeamTotal />
              <PairRow pair={pair} player={pair.guest} showTeamTotal={false} />
            </Fragment>
          ))}
        </tbody>
      </table>

      <p className={styles.leaderboardNote}>
        Net Stableford points. The small mark under a score is the session recorded for that day. A
        dash means no card or no result; a zero is a real score.
      </p>

      <footer className={styles.signatures}>
        <div>
          <span>Prepared by</span>
          <i />
        </div>
        <div>
          <span>Verified by</span>
          <i />
        </div>
      </footer>
    </section>
  );
}
