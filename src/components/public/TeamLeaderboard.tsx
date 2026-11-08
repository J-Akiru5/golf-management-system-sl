"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/bits";
import { publicTabHref } from "@/lib/data/public-tabs";
import type {
  PublicTeamFilters,
  PublicTeamOptions,
  PublicTeamRound,
  PublicTeamStanding,
  PublicTieBreak,
} from "@/lib/data/public-team-leaderboard";
import { useI18n } from "@/lib/i18n/context";

function roundLabel(round: PublicTeamRound): string {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(
    new Date(`${round.playDate}T00:00:00`),
  );
}

function rankLabel(team: PublicTeamStanding): string {
  return team.tied ? `T${team.rank}` : String(team.rank);
}

function score(value: number | null): string {
  return value === null ? "—" : String(value);
}

/** One side of a pair card: the role label, the player and a link to their profile. */
function PairPlayer({
  label,
  name,
  href,
  className = "",
}: {
  label: string;
  name: string | null;
  href: string | null;
  className?: string;
}) {
  return (
    <div className={`grid min-w-0 content-start gap-1.5 p-2 sm:p-3 ${className}`}>
      <span className="small-h">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        {name ? <Avatar name={name} /> : null}
        {href ? (
          <Link
            href={href}
            className="min-w-0 break-words font-semibold text-ink no-underline hover:underline"
          >
            {name}
          </Link>
        ) : (
          <b className="min-w-0 break-words">{name ?? "—"}</b>
        )}
      </span>
    </div>
  );
}

/**
 * The cumulative two-man team leaderboard.
 *
 * A team's score is the sum of both partners' published Stableford points. The table stops at ten
 * teams. Equal points keep the same rank and are marked `T`; the organizers' written tie-break rule
 * is shown below the table instead of being guessed here.
 */
export function TeamLeaderboard({
  teams,
  options,
  filters,
  rounds,
  tieBreak,
  unpaired,
  eventName,
}: {
  teams: PublicTeamStanding[];
  options: PublicTeamOptions;
  filters: PublicTeamFilters;
  rounds: PublicTeamRound[];
  tieBreak: PublicTieBreak | null;
  unpaired: number;
  eventName: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const provisional = rounds.some((round) => round.state === "provisional");

  const applyFilters = (next: PublicTeamFilters) => {
    const query = new URLSearchParams();
    if (next.category) query.set("category", next.category);
    if (next.flight) query.set("flight", next.flight);
    const suffix = query.toString();
    router.push(suffix ? `/leaderboard?${suffix}` : "/leaderboard", { scroll: false });
  };

  return (
    <section className="grid gap-3" aria-labelledby="leaderboard-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="leaderboard-heading" className="text-[20px] leading-7">
            {t("programme.leaderboardTitle")}
          </h2>
          <p className="hint m-0">{t("programme.leaderboardIntro")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {provisional && (
            <span className="pill info">{t("programme.leaderboardProvisional")}</span>
          )}
          {rounds.length > 0 && (
            <span className="pill">
              {t("programme.leaderboardRounds", {
                rounds: rounds.map(roundLabel).join(" · "),
              })}
            </span>
          )}
        </div>
      </div>

      <p className="hint m-0" data-testid="leaderboard-event">
        {eventName ?? t("programme.leaderboardNoEvent")}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="hint">{t("programme.leaderboardCategory")}</span>
          <select
            value={filters.category ?? ""}
            onChange={(event) => applyFilters({ ...filters, category: event.target.value })}
            data-testid="leaderboard-category"
          >
            <option value="">{t("programme.leaderboardAllCategories")}</option>
            {options.categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="hint">{t("programme.leaderboardClass")}</span>
          <select
            value={filters.flight ?? ""}
            onChange={(event) => applyFilters({ ...filters, flight: event.target.value })}
            data-testid="leaderboard-flight"
          >
            <option value="">{t("programme.leaderboardAllClasses")}</option>
            {options.flights.map((flight) => (
              <option key={flight} value={flight}>
                {flight}
              </option>
            ))}
          </select>
        </label>
      </div>

      {teams.length === 0 ? (
        <div className="pairings-empty" role="status" data-testid="leaderboard-empty">
          <h3>{t("programme.leaderboardEmptyTitle")}</h3>
          <p>
            {filters.category || filters.flight
              ? t("programme.leaderboardEmptyFiltered")
              : t("programme.leaderboardEmptyBody")}
          </p>
        </div>
      ) : (
        <ol className="grid gap-3" data-testid="leaderboard-cards">
          {teams.map((team) => {
            const memberId = team.playerIds[0] ?? null;
            const guestId = team.playerIds[1] ?? null;
            return (
              <li
                key={team.key}
                className="overflow-hidden rounded-[14px] border border-line bg-surface-raised"
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-sunken px-3 py-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gold-soft text-[12px] font-bold text-gold-ink">
                    {rankLabel(team)}
                  </span>
                  <span className="pill gold">
                    {t("programme.leaderboardPair", { number: team.pairNumber ?? "—" })}
                  </span>
                  <span className="pill">{team.flightName ?? "—"}</span>
                  {team.categories.length > 0 && (
                    <span className="pill">{team.categories.join(" · ")}</span>
                  )}
                  <span className="hint">{t("programme.leaderboardTogether")}</span>
                  <span className="ml-auto grid shrink-0 text-right">
                    <b className="text-[20px] leading-5 tnum">{score(team.netPoints)}</b>
                    <span className="text-[11px] text-ink-muted">
                      {t("programme.leaderboardPts")}
                    </span>
                  </span>
                </div>
                <div className="grid grid-cols-2">
                  <PairPlayer
                    label={t("programme.leaderboardMember")}
                    name={team.memberName}
                    href={memberId ? publicTabHref("profile", { player: memberId }) : null}
                    className="border-r border-line"
                  />
                  <PairPlayer
                    label={t("programme.leaderboardGuest")}
                    name={team.guestName}
                    href={guestId ? publicTabHref("profile", { player: guestId }) : null}
                  />
                </div>
                <dl className="m-0 grid grid-cols-4 gap-2 border-t border-line px-3 py-2 text-[12px]">
                  <div>
                    <dt className="small-h">{t("programme.leaderboardThru")}</dt>
                    <dd className="m-0 font-semibold tnum">
                      {team.holesCounted}/{team.holesTotal || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="small-h">{t("programme.leaderboardGross")}</dt>
                    <dd className="m-0 font-semibold tnum">{score(team.grossStrokes)}</dd>
                  </div>
                  <div>
                    <dt className="small-h">{t("programme.leaderboardNet")}</dt>
                    <dd className="m-0 font-semibold tnum">{score(team.netStrokes)}</dd>
                  </div>
                  <div>
                    <dt className="small-h">{t("programme.leaderboardToPar")}</dt>
                    <dd className="m-0 font-semibold tnum">{team.toPar}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ol>
      )}

      {unpaired > 0 && (
        <p className="hint m-0" role="status">
          {unpaired === 1
            ? t("programme.leaderboardUnpairedOne")
            : t("programme.leaderboardUnpaired", { count: unpaired })}
        </p>
      )}

      <p className="hint m-0" data-testid="leaderboard-tiebreak">
        {tieBreak
          ? t("programme.leaderboardTieBreak", { rule: tieBreak.procedure })
          : t("programme.leaderboardTieBreakMissing")}
      </p>
    </section>
  );
}
