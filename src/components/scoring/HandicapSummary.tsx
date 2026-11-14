import { CircleAlert } from "lucide-react";
import { PlayerLink } from "@/components/scoring/PlayerLink";
import { Button } from "@/components/ui/button";
import type { ClubRole } from "@/lib/auth/member";
import { fmtIso } from "@/lib/data/labels";
import { fmtHcp, fmtIndex } from "@/lib/format";
import { checkHandicapSnapshot, type HandicapSnapshot, type RoundCourse } from "@/lib/scoring";

/**
 * The handicap a round actually uses, shown where the desk enters and checks cards.
 *
 * It is display-only by default. The snapshot is the scoring input; the registration freeze is
 * shown beside it so a checker can see when the two disagree. An owner or organizer may correct the
 * snapshot for a played round through the guarded function, which audits the change and recalculates
 * the result; the player's record history stays on the player page.
 */
export function HandicapSummary({
  playerId,
  playerName,
  role,
  handicap,
  frozenIndex,
  course,
  onCorrect,
}: {
  playerId: string;
  playerName: string;
  /** undefined in demo builds, null for an account with no club membership row. */
  role?: ClubRole | null;
  handicap: HandicapSnapshot | null;
  frozenIndex?: number | null;
  course: RoundCourse;
  /** Owner or organizer only: corrects the snapshot this played round is scored from. */
  onCorrect?: () => void;
}) {
  const check = checkHandicapSnapshot({
    handicap,
    frozenIndex,
    roundTeeId: course.tee.id,
  });
  const allowancePercent = handicap ? Math.round(handicap.allowance * 100) : null;

  return (
    <section className="handicap-summary" aria-label={`Handicap for ${playerName}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="overline">Handicap used for this round</span>
          <p className="mt-0.5">
            <PlayerLink
              playerId={playerId}
              name={playerName}
              role={role}
              className="underline underline-offset-2"
            />
          </p>
          <p className="hint mt-0.5">
            The index, course handicap and playing handicap. Net Stableford uses the playing
            handicap.
          </p>
        </div>
        {onCorrect && handicap && (
          <Button variant="secondary" size="sm" onClick={onCorrect}>
            Correct handicap
          </Button>
        )}
      </div>

      {!handicap ? (
        <div className="notice warn" role="status">
          No handicap snapshot is stored for {playerName} in this round. Net Stableford leaves the
          player out rather than estimating an index. Check the player record before entering a net
          score.
        </div>
      ) : (
        <>
          <div className="tiles grid-cols-3">
            <div className="tile">
              <b className="mono">{fmtIndex(handicap.index)}</b>
              <span>NGAP index</span>
            </div>
            <div className="tile">
              <b className="mono">{fmtHcp(handicap.courseHandicap)}</b>
              <span>Course handicap</span>
            </div>
            <div className="tile">
              <b className="mono">{fmtHcp(handicap.playingHandicap)}</b>
              <span>Playing handicap</span>
            </div>
          </div>

          {handicap.rounding === "card" ? (
            <p className="hint mono">
              HDCP on the card {fmtIndex(handicap.index)}, decimal dropped ={" "}
              {fmtHcp(handicap.playingHandicap)}
            </p>
          ) : (
            <p className="hint mono">
              {fmtIndex(handicap.index)} × ({handicap.slope} ÷ 113) + ({handicap.courseRating} −{" "}
              {handicap.coursePar}) = {fmtHcp(handicap.courseHandicap)} · {allowancePercent}% ={" "}
              {fmtHcp(handicap.playingHandicap)}
            </p>
          )}

          <dl className="handicap-facts">
            <div>
              <dt>Index source</dt>
              <dd>{handicap.indexSource}</dd>
            </div>
            <div>
              <dt>Effective</dt>
              <dd>{fmtIso(handicap.indexEffectiveDate)}</dd>
            </div>
            <div>
              <dt>Registration freeze</dt>
              <dd>
                {check.frozenIndex === null ? "No frozen index" : fmtIndex(check.frozenIndex)}
              </dd>
            </div>
            <div>
              <dt>Tee</dt>
              <dd>{course.tee.name}</dd>
            </div>
            <div>
              <dt>Rating / slope / par</dt>
              <dd className="mono">
                {handicap.courseRating} / {handicap.slope} / {handicap.coursePar}
              </dd>
            </div>
            <div>
              <dt>Allowance / rounding</dt>
              <dd>
                {allowancePercent}% ·{" "}
                {handicap.rounding === "whs"
                  ? "WHS two-step"
                  : handicap.rounding === "card"
                    ? "card handicap"
                    : "single step"}
              </dd>
            </div>
          </dl>

          {(check.indexDiffers || check.teeDiffers) && (
            <div className="notice warn" role="status">
              <b className="flex items-center gap-1.5">
                <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                Check the handicap before approving a net result
              </b>
              <ul>
                {check.indexDiffers && (
                  <li>
                    This round uses the index {fmtIndex(check.snapshotIndex)}, but the
                    registration&apos;s frozen index is {fmtIndex(check.frozenIndex)}.
                  </li>
                )}
                {check.teeDiffers && (
                  <li>
                    This snapshot was calculated on a different tee from the round (
                    {course.tee.name}). Its rating and slope may not match.
                  </li>
                )}
              </ul>
              <p className="m-0 text-[13px]">
                {onCorrect
                  ? "Use Correct handicap to change the snapshot for this round. The scoring audit records who made the change and why."
                  : "The scorecard is not the place to change it. Open the player record to check the index and the freeze."}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
