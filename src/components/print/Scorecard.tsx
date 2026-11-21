"use client";

import { QRCodeSVG } from "qrcode.react";
import { fmtHcp, fmtTime } from "@/lib/format";
import { handicapDots } from "@/lib/print/handicap-dots";
import { cardQrPayload } from "@/lib/scorecards/scan";
import styles from "./print.module.css";
import type {
  CourseDataStatus,
  PrintHole,
  PrintPlayer,
  PrintStartFormat,
  ScorecardGroup,
} from "./types";

export interface ScorecardProps {
  eventTitle: string;
  eventSubtitle: string;
  eventHost?: string | null;
  eventLogoUrl?: string;
  courseName?: string | null;
  group: ScorecardGroup;
  players: readonly PrintPlayer[];
  holes: readonly PrintHole[];
  startFormat: PrintStartFormat;
  courseDataStatus: CourseDataStatus;
  showQrCodes?: boolean;
}

const HOLE_COUNT = 18;

/** One group's hand-scoring card. It renders only the plain, printable props it receives. */
export function Scorecard({
  eventTitle,
  eventSubtitle,
  eventHost,
  eventLogoUrl,
  courseName,
  group,
  players,
  holes,
  startFormat,
  courseDataStatus,
  showQrCodes = true,
}: ScorecardProps) {
  const holesByNumber = new Map(holes.map((hole) => [hole.number, hole]));
  const orderedHoles = Array.from({ length: HOLE_COUNT }, (_, index) => {
    const number = index + 1;
    return holesByNumber.get(number) ?? { number, par: null, strokeIndex: null };
  });
  const courseDataComplete =
    holes.length === HOLE_COUNT &&
    holesByNumber.size === HOLE_COUNT &&
    orderedHoles.every((hole) => hole.par !== null && hole.strokeIndex !== null);
  const canAllocateDots = courseDataComplete;
  const startLabel =
    startFormat === "shotgun" ? `Hole ${group.startHole}` : `Tee ${group.startHole}`;
  // The tee is part of the card: the course handicap on it is read off that tee's rating and slope,
  // so a group playing several tees names each one in the header.
  const teesInPlay = [...new Set(players.map((player) => player.teeName).filter(Boolean))];
  // Each player's row carries that player's card id, because the scorecard is one card per group
  // and the desk scores it player by player. The code holds only the id: the tabulation page
  // resolves it in the chosen day's field list and fills in the player, tee, class and handicap.
  // A damaged code is not a dead end there; the tabulator picks the player from the day's list.

  return (
    <article
      id={`scorecard-${group.number}`}
      className={styles.scorecard}
      aria-label={`Scorecard for group ${group.number}`}
    >
      <div className={styles.scorecardContent}>
        <header className={styles.scorecardHeader}>
          <div className={styles.scorecardBrand}>
            {eventLogoUrl && (
              <img
                className={styles.eventLogo}
                src={eventLogoUrl}
                alt=""
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
            <div>
              <h2>{eventTitle}</h2>
              {eventHost && <p className={styles.eventHost}>{eventHost}</p>}
              <p>{eventSubtitle}</p>
              {courseName && <p>{courseName}</p>}
            </div>
          </div>
          <div className={styles.groupSummary}>
            <b>Group {group.number}</b>
            <span>{startLabel}</span>
            <span>{fmtTime(group.time)}</span>
            <span>{group.flight}</span>
            <span>
              {teesInPlay.length > 0 ? `Tees: ${teesInPlay.join(", ")}` : "Tees: not set"}
            </span>
          </div>
        </header>

        {showQrCodes && players.length > 0 && (
          <div className={styles.qrPanel}>
            {players.map((player) => {
              const payload = cardQrPayload(player.id);
              return (
                <div key={player.id} className={styles.qrPlayer}>
                  {payload ? (
                    <QRCodeSVG
                      value={payload}
                      size={68}
                      level="M"
                      aria-label={`QR code for ${player.name}'s card`}
                    />
                  ) : (
                    <span
                      role="img"
                      aria-label={`No card code for ${player.name}`}
                      style={{
                        width: 68,
                        height: 68,
                        display: "grid",
                        placeItems: "center",
                        border: "1px dashed #777",
                        fontSize: 8,
                        textAlign: "center",
                      }}
                    >
                      No code
                    </span>
                  )}
                  <span>{player.name}</span>
                </div>
              );
            })}
            <p className={styles.qrNote}>
              For the score desk: scan a player&rsquo;s code to open that player&rsquo;s card. The
              code holds only the card id.
            </p>
          </div>
        )}

        {!courseDataComplete && (
          <p className={styles.courseNotice} role="status">
            <b>COURSE DATA NOT ENTERED</b> · Par and stroke index are required for handicap dots.
            Missing values are left blank.
          </p>
        )}

        <table className={styles.scoreTable}>
          <caption className={styles.visuallyHidden}>
            Hole, par, stroke index, and hand-scoring lines for group {group.number}
          </caption>
          <thead>
            <tr>
              <th scope="col">Hole</th>
              {orderedHoles.map((hole) => (
                <th scope="col" key={hole.number}>
                  {hole.number}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Par</th>
              {orderedHoles.map((hole) => (
                <td key={hole.number}>{hole.par ?? "—"}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Stroke index</th>
              {orderedHoles.map((hole) => (
                <td key={hole.number}>{hole.strokeIndex ?? "—"}</td>
              ))}
            </tr>
            {players.map((player) => {
              const dots = canAllocateDots
                ? handicapDots(
                    player.playingHandicap,
                    orderedHoles.map((hole) => hole.strokeIndex),
                  )
                : orderedHoles.map(() => 0);

              return (
                <tr key={player.id} className={styles.playerScoreRow}>
                  <th scope="row">
                    <span className={styles.playerName}>{player.name}</span>
                    <span className={styles.playerMeta}>
                      {player.teeName ?? "Tee not set"}
                      {player.teeRating != null && player.teeSlope != null
                        ? ` ${player.teeRating}/${player.teeSlope}`
                        : ""}
                      {" · PH "}
                      {fmtHcp(player.playingHandicap)}
                    </span>
                  </th>
                  {orderedHoles.map((hole, index) => {
                    const strokes = dots[index] ?? 0;
                    const marker =
                      strokes > 0
                        ? "•".repeat(strokes)
                        : strokes < 0
                          ? `−${"•".repeat(-strokes)}`
                          : "";

                    return (
                      <td key={hole.number}>
                        {marker && (
                          <span
                            className={styles.strokeMarker}
                            role="img"
                            aria-label={
                              strokes < 0
                                ? `Give back ${-strokes} stroke${strokes === -1 ? "" : "s"}`
                                : `Receive ${strokes} stroke${strokes === 1 ? "" : "s"}`
                            }
                          >
                            {marker}
                          </span>
                        )}
                        <span className={styles.scoreLine} aria-hidden="true" />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        <footer className={styles.signatures}>
          <div>
            <span>Marker signature</span>
            <i aria-hidden="true" />
          </div>
          <div>
            <span>Attester signature</span>
            <i aria-hidden="true" />
          </div>
        </footer>
      </div>
    </article>
  );
}
