"use client";

import { fmtHcp } from "@/lib/format";
import {
  type ResultsSheet as ResultsSheetModel,
  type ResultsTable,
  resultHoles,
  resultPosition,
  resultScore,
} from "@/lib/print/results-sheet";
import styles from "./print.module.css";

function tableSummary(table: ResultsTable): string {
  const noCard = table.rows.filter((row) => row.noCard).length;
  const incomplete = table.rows.filter(
    (row) => !row.noCard && row.holesPlayed < row.holesTotal,
  ).length;
  const parts = [`${table.rows.length} player${table.rows.length === 1 ? "" : "s"}`];
  if (noCard > 0) parts.push(`${noCard} without a card`);
  if (incomplete > 0) parts.push(`${incomplete} incomplete`);
  return parts.join(" · ");
}

function ResultsTableBlock({ table }: { table: ResultsTable }) {
  return (
    <section className={styles.startSection}>
      <h3 className={styles.sectionHeading}>
        {table.title}
        <span>{tableSummary(table)}</span>
      </h3>
      {table.rows.length === 0 ? (
        <p className={styles.countsIntro}>No players in this session.</p>
      ) : (
        <table className={`${styles.countsTable} print-table`}>
          <colgroup>
            <col style={{ width: "8%" }} />
            <col style={{ width: "42%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Pos</th>
              <th scope="col">Player</th>
              <th scope="col" className={styles.countsNum}>
                PH
              </th>
              <th scope="col" className={styles.countsNum}>
                Gross
              </th>
              <th scope="col" className={styles.countsNum}>
                Net
              </th>
              <th scope="col" className={styles.countsNum}>
                Points
              </th>
              <th scope="col" className={styles.countsNum}>
                Holes
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.playerId}>
                <td className={styles.countsNum}>{resultPosition(row)}</td>
                <td>
                  {row.playerName}
                  {row.noCard && <span className={styles.playerMeta}>No card</span>}
                </td>
                <td className={styles.countsNum}>{fmtHcp(row.playingHandicap)}</td>
                <td className={styles.countsNum}>{resultScore(row.grossStrokes)}</td>
                <td className={styles.countsNum}>{resultScore(row.netStrokes)}</td>
                <td className={styles.countsNum}>
                  <b>{resultScore(row.points)}</b>
                </td>
                <td className={styles.countsNum}>{resultHoles(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/**
 * The desk's printed result sheet. It matches the other print components: one black-on-white
 * sheet, a title and a line of context, then a bordered table per session. The rows are built by
 * the pure results-sheet module and are the same rows the PDF and workbook exports use.
 */
export function ResultsSheet({ sheet }: { sheet: ResultsSheetModel }) {
  return (
    <section className={`${styles.sheet} print-sheet`} aria-label="Results">
      <header className={styles.sheetHeader}>
        <h2>Results · {sheet.dayLabel}</h2>
        <p>
          {sheet.eventName} · {sheet.dayLabel} · {sheet.dateLabel} · net Stableford
        </p>
      </header>

      {sheet.tables.map((table) => (
        <ResultsTableBlock key={table.key} table={table} />
      ))}

      <p className={styles.countsIntro}>
        Ranked on net Stableford points. A tie shares its position and is marked T. A dash means no
        scorecard; the Holes column shows the holes played on an incomplete card.
      </p>
    </section>
  );
}
