"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Avatar } from "@/components/bits";
import { PaperScorecard } from "@/components/public/PaperScorecard";
import { publicTabHref } from "@/lib/data/public-tabs";
import type { PublicTeamCards } from "@/lib/data/public-team-cards";
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
  figures,
  className = "",
}: {
  label: string;
  name: string | null;
  href: string | null;
  /** The partner's own net and gross points, already formatted. */
  figures: string;
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
      <span className="text-[12px] text-ink-muted tnum">{figures}</span>
    </div>
  );
}

/**
 * One ranked team. The row keeps its own open state, so opening a team's cards leaves the other
 * rows alone. The panel stays in the page but hidden until the button opens it, which is what
 * `aria-controls` expects.
 */
function TeamRow({ team, cards }: { team: PublicTeamStanding; cards: PublicTeamCards }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const memberId = team.playerIds[0] ?? null;
  const guestId = team.playerIds[1] ?? null;

  // A partner's own figures, looked up by player id as the leaderboard built them.
  const figures = (playerId: string | null): string => {
    const member = playerId ? team.members.find((entry) => entry.playerId === playerId) : undefined;
    return t("programme.leaderboardPlayerFigures", {
      net: member?.netPoints ?? "-",
      gross: member?.grossPoints ?? "-",
    });
  };

  const partners = [
    { label: t("programme.leaderboardMember"), id: memberId, name: team.memberName },
    { label: t("programme.leaderboardGuest"), id: guestId, name: team.guestName },
  ];

  return (
    <li className="overflow-hidden rounded-[14px] border border-line bg-surface-raised">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-sunken px-3 py-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gold-soft text-[12px] font-bold text-gold-ink">
          {rankLabel(team)}
        </span>
        <span className="pill gold">
          {t("programme.leaderboardPair", { number: team.pairNumber ?? "—" })}
        </span>
        <span className="pill">{team.flightName ?? "—"}</span>
        {team.categories.length > 0 && <span className="pill">{team.categories.join(" · ")}</span>}
        <span className="hint">{t("programme.leaderboardTogether")}</span>
        <span className="ml-auto grid shrink-0 text-right">
          <b className="text-[20px] leading-5 tnum">{score(team.netPoints)}</b>
          <span className="text-[11px] text-ink-muted">{t("programme.leaderboardPts")}</span>
        </span>
      </div>
      <div className="grid grid-cols-2">
        <PairPlayer
          label={t("programme.leaderboardMember")}
          name={team.memberName}
          href={memberId ? publicTabHref("profile", { player: memberId }) : null}
          figures={figures(memberId)}
          className="border-r border-line"
        />
        <PairPlayer
          label={t("programme.leaderboardGuest")}
          name={team.guestName}
          href={guestId ? publicTabHref("profile", { player: guestId }) : null}
          figures={figures(guestId)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        <dl className="m-0 grid grid-cols-2 gap-4 text-[12px]">
          <div>
            <dt className="small-h">{t("programme.leaderboardThru")}</dt>
            <dd className="m-0 font-semibold tnum">
              {team.holesCounted}/{team.holesTotal || "—"}
            </dd>
          </div>
          <div>
            <dt className="small-h">{t("programme.leaderboardGrossPts")}</dt>
            <dd className="m-0 font-semibold tnum">{score(team.grossPoints)}</dd>
          </div>
        </dl>
        <button
          type="button"
          className="ml-auto inline-flex min-h-11 items-center justify-center rounded-full border border-line px-4 text-[13px] font-semibold text-ink"
          aria-expanded={open}
          aria-controls={panelId}
          data-testid="team-scorecards-toggle"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? t("programme.leaderboardHideScorecards") : t("programme.leaderboardScorecards")}
        </button>
      </div>
      <div id={panelId} hidden={!open} data-testid="team-scorecards">
        {open && (
          <div className="grid gap-4 border-t border-line px-3 py-3">
            {partners.map((partner) => {
              const partnerCards = partner.id ? (cards[partner.id] ?? []) : [];
              return (
                <div key={partner.label} className="grid gap-3">
                  <h4 className="m-0 text-[15px] leading-5">{partner.name ?? "—"}</h4>
                  {partnerCards.length > 0 ? (
                    partnerCards.map((card) => (
                      <PaperScorecard
                        key={card.roundId}
                        card={card}
                        title={`${partner.name ?? "—"} · Day ${card.dayNumber}`}
                      />
                    ))
                  ) : (
                    <p className="hint m-0">{t("programme.leaderboardNoCardYet")}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </li>
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
  cards,
  options,
  filters,
  rounds,
  tieBreak,
  unpaired,
  eventName,
}: {
  teams: PublicTeamStanding[];
  /** Both partners' frozen cards for the teams on screen, keyed by player id. */
  cards?: PublicTeamCards;
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
  const teamCards = cards ?? {};

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
          {teams.map((team) => (
            <TeamRow key={team.key} team={team} cards={teamCards} />
          ))}
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
