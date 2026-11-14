"use client";

import { useI18n } from "@/lib/i18n/context";
import {
  boardScoreText,
  type LaneReveal,
  type LaneRevealMap,
  lanePhase,
  laneSignature,
  REVEAL_LANES,
  type RevealLaneId,
  tieMark,
} from "@/lib/public/results-reveal";
import { RevealPoller } from "./RevealPoller";
import { useRevealCountdown } from "./useRevealCountdown";

/**
 * The public awarding page: six boards, one per lane, in the order the club releases them.
 *
 * A held lane prints a blank panel with its name and nothing else that could be read as a result:
 * no player, no score, no position. A lane counting down prints the number only, cinema style, big
 * enough to read across a room and on a phone. A released lane prints the top three the desk
 * confirmed, with the `T` the desk confirmed and no ranking done here.
 *
 * The countdown is measured from the server's clock (`serverNow`) plus the time since this render
 * arrived, so a phone with a wrong clock still agrees with the screen beside it. The board appears
 * only after the server says the lane is released: the poller asks the reveal route, and the page
 * comes back rendered from the database.
 */
export function AwardingPodium({
  lanes,
  serverNow,
  demo = false,
}: {
  lanes: LaneRevealMap;
  /** The server's clock at render, or null in the no-database demo. */
  serverNow: string | null;
  demo?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="awarding-podium" data-testid="awarding-podium">
      {demo && (
        <p className="notice m-0" role="note" data-testid="awarding-demo">
          {t("awarding.demoNote")}
        </p>
      )}
      <div className="awarding-grid">
        {REVEAL_LANES.map((lane) => (
          <AwardingBoard
            key={lane.id}
            laneId={lane.id}
            label={lane.label}
            lane={lanes[lane.id]}
            serverNow={serverNow}
          />
        ))}
      </div>
      <RevealPoller rendered={laneSignature(lanes)} baseMs={2_500} />
    </div>
  );
}

function AwardingBoard({
  laneId,
  label,
  lane,
  serverNow,
}: {
  laneId: RevealLaneId;
  label: string;
  lane: LaneReveal;
  serverNow: string | null;
}) {
  const { t } = useI18n();
  const remaining = useRevealCountdown(lane.releaseAt, serverNow);
  const phase = lanePhase({ lane, remainingMs: lane.releaseAt ? remaining : null });
  // The number the lane prints: whole seconds, never below one, so the last second is shown.
  const count = remaining === null ? 1 : Math.max(1, Math.ceil(remaining / 1000));

  return (
    <section
      className={`awarding-board ${phase}`}
      aria-label={label}
      data-testid={`awarding-lane-${laneId}`}
      data-phase={phase}
    >
      <header className="awarding-board-head">
        <h2>{label}</h2>
        {phase === "counting" && (
          <span className="awarding-board-state">{t("release.countdownLabel")}</span>
        )}
      </header>

      {phase === "released" ? (
        lane.board.length === 0 ? (
          <p className="awarding-pending" data-testid={`awarding-pending-${laneId}`}>
            {t("awarding.boardPending")}
          </p>
        ) : (
          <ol className="awarding-rows">
            {lane.board.map((row) => (
              <li
                className="awarding-row"
                key={`${row.position}-${row.name}`}
                data-testid="awarding-row"
              >
                <span className="awarding-position">
                  {row.position}
                  {row.tie && (
                    <span className="awarding-tie" aria-label={t("awarding.tieLabel")}>
                      {tieMark(row)}
                    </span>
                  )}
                </span>
                <span className="awarding-name">{row.name}</span>
                <span className="awarding-score">{boardScoreText(row)}</span>
              </li>
            ))}
          </ol>
        )
      ) : phase === "counting" || phase === "due" ? (
        // The number only, cinema style. It is not a live region: a reader should not announce a race.
        <p className="awarding-count" data-testid={`awarding-count-${laneId}`}>
          <span className="awarding-count-value">{count}</span>
        </p>
      ) : (
        <p className="awarding-held" data-testid={`awarding-held-${laneId}`}>
          {t("release.blackoutTitle")}
        </p>
      )}
    </section>
  );
}
