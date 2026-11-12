import Link from "next/link";
import { Avatar } from "@/components/bits";
import { ScorecardBreakdown } from "@/components/player/ScorecardBreakdown";
import type { PublicPlayerProfileData, PublicProfileTeeTime } from "@/lib/data/public-profile";
import type { PublicTeamStanding } from "@/lib/data/public-team-leaderboard";
import { fmtHcp, fmtTime, shortDate } from "@/lib/format";
import type { Translate } from "@/lib/i18n/t";

/**
 * The selected player's profile: who they are, their partner, their pair's published total and
 * their frozen cards. The cards come from the published snapshot, so this page never shows a score
 * that is still being edited.
 */
export function PlayerProfileView({
  data,
  team,
  t,
  teeTimes = [],
}: {
  data: PublicPlayerProfileData;
  team: PublicTeamStanding | null;
  t: Translate;
  /** One confirmed start per playing day, already reduced to the public time and hole. */
  teeTimes?: PublicProfileTeeTime[];
}) {
  const { player, partner, cards } = data;
  const rank = team ? (team.tied ? `T${team.rank}` : String(team.rank)) : null;
  const playingHandicap = cards[0]?.playingHandicap ?? null;
  return (
    <div className="grid gap-4" data-testid="player-profile">
      <section className="card grid gap-3" aria-labelledby="profile-name">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={player.name} />
            <div className="min-w-0">
              <h2 id="profile-name" className="m-0 break-words text-[22px] leading-7">
                {player.name}
              </h2>
              <p className="hint m-0">
                {[player.flight, player.category].filter(Boolean).join(" · ") ||
                  t("programme.unflighted")}
              </p>
            </div>
          </div>
        </div>

        <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <div className="grid gap-0.5">
            <dt className="small-h">{t("programme.profilePlayingHandicap")}</dt>
            <dd className="m-0 font-semibold tnum">{fmtHcp(playingHandicap)}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="small-h">{t("programme.profileClass")}</dt>
            <dd className="m-0 min-w-0 break-words font-semibold">
              {player.flight ?? t("programme.unflighted")}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="small-h">{t("programme.profileCategory")}</dt>
            <dd className="m-0 min-w-0 break-words font-semibold">
              {player.category ?? t("programme.profileUncategorized")}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="small-h">{t("programme.profilePartner")}</dt>
            <dd className="m-0 min-w-0 break-words font-semibold">
              {partner?.name ?? t("programme.profileNoPartner")}
            </dd>
          </div>
        </dl>

        {teeTimes.length > 0 && (
          <dl className="m-0 grid gap-2 border-t border-line pt-3" data-testid="profile-tee-times">
            {teeTimes.map((row) => {
              const date = shortDate(row.playDate);
              return (
                <div
                  key={row.dayNumber}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1"
                >
                  <dt className="small-h">
                    {t("player.home.day", { day: row.dayNumber })}
                    {date ? ` · ${date}` : ""}
                  </dt>
                  <dd className="m-0 flex flex-wrap items-center gap-2 font-semibold">
                    <span className="tnum">{fmtTime(row.teeTime)}</span>
                    {row.startHole !== null && (
                      <span className="pill">{t("programme.hole", { hole: row.startHole })}</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </section>

      {cards.length === 0 ? (
        <section className="card" role="status" data-testid="profile-no-cards">
          <h3 className="m-0 text-[18px] leading-6">{t("programme.profileNoScoresTitle")}</h3>
          <p className="hint mt-1 mb-0">{t("programme.profileNoScoresBody")}</p>
        </section>
      ) : (
        cards.map((card) => <ScorecardBreakdown key={card.roundId} card={card} t={t} />)
      )}

      {team && (
        <section className="card grid gap-3" aria-labelledby="profile-pair-score">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="profile-pair-score" className="m-0 text-[18px] leading-6">
              {t("programme.profilePairScore")}
            </h3>
            <Link href="/leaderboard" className="text-[13px] font-semibold">
              {t("programme.navLeaderboard")}
            </Link>
          </div>
          <p className="hint m-0">{team.playerNames.join(" / ")}</p>
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
            <div className="grid gap-0.5">
              <dt className="small-h">{t("programme.leaderboardRank")}</dt>
              <dd className="m-0 font-semibold tnum">{rank ?? "—"}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="small-h">{t("programme.leaderboardPts")}</dt>
              <dd className="m-0 font-semibold tnum">{team.netPoints ?? "—"}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="small-h">{t("programme.leaderboardThru")}</dt>
              <dd className="m-0 font-semibold tnum">
                {team.holesCounted}/{team.holesTotal || "—"}
              </dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="small-h">{t("programme.leaderboardToPar")}</dt>
              <dd className="m-0 font-semibold tnum">{team.toPar}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="small-h">{t("programme.leaderboardClass")}</dt>
              <dd className="m-0 min-w-0 break-words font-semibold">{team.flightName ?? "—"}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
