"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
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

/**
 * One ranked team. The row keeps its own open state, so opening a team's cards leaves the other
 * rows alone. The panel stays in the page but hidden until the button opens it, which is what
 * `aria-controls` expects.
 */
function TeamRow({ team, cards }: { team: PublicTeamStanding; cards: PublicTeamCards }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const panelId = useId();
  const pickId = useId();

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

  // Every published card the team has, in one list: a team can carry four of them, and a dropdown
  // shows one at a time instead of stacking all four under the row.
  const cardOptions = partners.flatMap((partner) =>
    (partner.id ? (cards[partner.id] ?? []) : []).map((card) => ({
      key: `${partner.id}-${card.roundId}`,
      label: `${partner.name ?? "—"} · ${t("programme.scoresDay", { day: card.dayNumber })}`,
      card,
    })),
  );
  const firstKey = cardOptions[0]?.key ?? null;
  const selectedKey =
    picked !== null && cardOptions.some((option) => option.key === picked) ? picked : firstKey;
  const selected = cardOptions.find((option) => option.key === selectedKey) ?? null;

  return (
    <li
      className="lb-team"
      data-rank={team.rank}
      data-leader={team.rank === 1 ? "true" : undefined}
    >
      <div className="lb-team-head">
        <span className="lb-rank">{rankLabel(team)}</span>
        <div className="lb-names">
          {partners.map((partner) => (
            <div key={partner.label} className="lb-player">
              <span className="lb-role">{partner.label}</span>
              {partner.id ? (
                <Link href={publicTabHref("profile", { player: partner.id })} className="lb-name">
                  {partner.name}
                </Link>
              ) : (
                <span className="lb-name">{partner.name ?? "—"}</span>
              )}
              <span className="lb-figures tnum">{figures(partner.id)}</span>
            </div>
          ))}
        </div>
        <span className="lb-points">
          <b className="tnum">{score(team.netPoints)}</b>
          <span>{t("programme.leaderboardPts")}</span>
        </span>
      </div>
      <div className="lb-meta">
        <span className="lb-meta-strong">
          {t("programme.leaderboardPair", { number: team.pairNumber ?? "—" })}
        </span>
        {team.flightName && <span>{team.flightName}</span>}
        {team.categories.map((category) => (
          <span key={category}>{category}</span>
        ))}
        <span>
          {t("programme.leaderboardThru")}{" "}
          <b className="tnum">
            {team.holesCounted}/{team.holesTotal || "—"}
          </b>
        </span>
        <span>
          {t("programme.leaderboardGrossPts")} <b className="tnum">{score(team.grossPoints)}</b>
        </span>
      </div>
      <div className="lb-team-foot">
        <button
          type="button"
          className="lb-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          data-testid="team-scorecards-toggle"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? t("programme.leaderboardHideScorecards") : t("programme.leaderboardScorecards")}
          <ChevronDown aria-hidden="true" className={open ? "is-open" : undefined} />
        </button>
      </div>
      {team.rank === 1 ? (
        <svg className="lb-crown" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <path d="M8 34 5.5 15l11 9L24 12l7.5 12 11-9L40 34H8Z" />
          <path d="M10 40h28" />
          <circle cx="24" cy="8" r="1.8" />
        </svg>
      ) : (
        <svg className="lb-flag" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <path d="M9 44V4" />
          <path d="M9 6c9-4 9 4 18 0 6-2.6 7-3.2 12-4v14c-5 .8-6 1.4-12 4-9 4-9-4-18 0Z" />
          <circle cx="23" cy="38" r="1.6" />
        </svg>
      )}
      <div id={panelId} hidden={!open} data-testid="team-scorecards">
        {open &&
          (selected ? (
            <div className="lb-cards">
              <label className="lb-cards-pick" htmlFor={pickId}>
                <span>{t("programme.leaderboardCardPick")}</span>
                <select
                  id={pickId}
                  className="lb-select"
                  value={selected.key}
                  onChange={(event) => setPicked(event.target.value)}
                  data-testid="team-scorecard-select"
                >
                  {cardOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {/* The picker above already names the player and the day, so the card starts at its
                  own figures instead of repeating the heading. */}
              <PaperScorecard key={selected.key} card={selected.card} />
            </div>
          ) : (
            <p className="hint lb-cards-empty">{t("programme.leaderboardNoCardYet")}</p>
          ))}
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
      <div className="lb-head">
        <p className="lb-event" data-testid="leaderboard-event">
          {eventName ?? t("programme.leaderboardNoEvent")}
        </p>
        <h2 id="leaderboard-heading">{t("programme.leaderboardTitle")}</h2>
        <p className="lb-intro">{t("programme.leaderboardIntro")}</p>
        <div className="lb-status">
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

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="lb-filter">
          <span className="lb-filter-label">{t("programme.leaderboardCategory")}</span>
          <select
            className="lb-select"
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
        <label className="lb-filter">
          <span className="lb-filter-label">{t("programme.leaderboardClass")}</span>
          <select
            className="lb-select"
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
