import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type {
  LeaderboardTeaser as LeaderboardTeaserData,
  LeaderboardTeaserTeam,
} from "@/lib/public/leaderboard-teaser";

/**
 * The public leaderboard on the landing page: where the event stands after the last publication.
 *
 * A server component. Every value is already decided by `buildLeaderboardTeaser`, so this file only
 * lays it out, and it is rendered only when the desk has released the leaderboard and at least one
 * team is ranked.
 */

function rankLabel(team: LeaderboardTeaserTeam): string {
  return team.tied ? `T${team.rank}` : String(team.rank);
}

function score(value: number | null): string {
  return value === null ? "—" : String(value);
}

export function LeaderboardTeaser({ teaser }: { teaser: LeaderboardTeaserData }) {
  const heading = teaser.eventName
    ? `As of Day ${teaser.dayNumber} of ${teaser.eventName}`
    : `As of Day ${teaser.dayNumber}`;

  return (
    <section
      className="mx-auto w-full max-w-[75rem] px-4 py-12 sm:px-6 sm:py-14 lg:px-[clamp(24px,7vw,96px)] lg:py-16"
      aria-labelledby="landing-leaderboard-title"
      data-testid="landing-leaderboard"
    >
      <div className="grid gap-6">
        <div>
          <p className="section-kicker">Leaderboard</p>
          <h2
            id="landing-leaderboard-title"
            className="max-w-[34ch] text-[26px] sm:text-[34px] lg:text-[40px]"
          >
            {heading}
          </h2>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ink-muted">
            {teaser.asOf ? <span>{teaser.asOf} (PH time)</span> : null}
            <span className={teaser.state === "provisional" ? "pill info" : "pill"}>
              {teaser.state === "provisional" ? "Provisional" : "Final"}
            </span>
          </p>
        </div>

        <ol className="grid max-w-[46rem] border-y border-line">
          {teaser.teams.map((team) => (
            <li
              key={`${team.rank}-${team.names.join("-")}`}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-3 last:border-b-0"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-soft text-[12px] font-bold text-gold-ink tnum">
                {rankLabel(team)}
              </span>
              <div className="min-w-0">
                <span className="pill gold">PAIR {team.pairNumber ?? "—"}</span>
                <p className="mt-1 break-words text-[15px] font-semibold text-ink">
                  {team.names.length > 0 ? team.names.join(" / ") : "—"}
                </p>
              </div>
              <div className="grid shrink-0 justify-items-end text-right">
                <b className="text-[18px] leading-5 text-ink tnum">{score(team.netPoints)} pts</b>
                <span className="text-[11px] text-ink-muted">Gross {score(team.grossPoints)}</span>
              </div>
            </li>
          ))}
        </ol>

        <div>
          <Link className="button-dark" href="/leaderboard">
            View full leaderboard <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
