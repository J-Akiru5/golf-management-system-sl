import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { fmtIso } from "@/lib/data/labels";
import { fmtHcp, fmtIndex } from "@/lib/format";
import { checkHandicapSnapshot, type HandicapSnapshot, type RoundCourse } from "@/lib/scoring";

/**
 * The handicap a round actually uses, shown where the desk enters and checks cards.
 *
 * It is deliberately display-only. The snapshot is the scoring input; the registration freeze is
 * shown beside it so a checker can see when the two disagree. Correcting either belongs on the
 * player or registration record, not on a scorecard.
 */
export function HandicapSummary({
  playerId,
  playerName,
  handicap,
  frozenIndex,
  course,
}: {
  playerId: string;
  playerName: string;
  handicap: HandicapSnapshot | null;
  frozenIndex?: number | null;
  course: RoundCourse;
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
          <p className="hint mt-0.5">
            The index, course handicap and playing handicap. Net Stableford uses the playing
            handicap.
          </p>
        </div>
        <Link href={`/players/${playerId}`} className="text-[13px] underline underline-offset-2">
          Open player record
        </Link>
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

          <p className="hint mono">
            {fmtIndex(handicap.index)} × ({handicap.slope} ÷ 113) + ({handicap.courseRating} −{" "}
            {handicap.coursePar}) = {fmtHcp(handicap.courseHandicap)} · {allowancePercent}% ={" "}
            {fmtHcp(handicap.playingHandicap)}
          </p>

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
                {allowancePercent}% · {handicap.rounding === "whs" ? "WHS two-step" : "single step"}
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
                The scorecard is not the place to change it. Open the player record to check the
                index and the freeze.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
