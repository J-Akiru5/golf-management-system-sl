"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { publicTabHref } from "@/lib/data/public-tabs";
import type { PublicTeamLeaderboardData } from "@/lib/data/public-team-leaderboard";
import { useI18n } from "@/lib/i18n/context";
import {
  buildPlayerScores,
  buildScoreRows,
  filterPlayerScores,
  hasSessions,
  type PublicPlayerScore,
  type ScoreSession,
  scoreClasses,
  scoreDays,
} from "@/lib/public/public-scores";

const shortDate = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(parsed);
};

/**
 * The public "All scores" board.
 *
 * Every player with a published card, on every published day, with a day filter, a morning or
 * afternoon filter for the chosen day, and a name search. The team leaderboard stops at ten teams;
 * this screen is for the other two hundred members who want to read their own score.
 *
 * It wears the same clothes as the team board on purpose: the same filter controls, the same
 * nameplate row, the same crown for first place. A member who has learned one page already knows
 * this one, which is worth more than a second visual language.
 */
export function ScoresView({
  data,
  sessions,
}: {
  data: PublicTeamLeaderboardData;
  sessions: Record<string, ScoreSession>;
}) {
  const { t } = useI18n();
  const [day, setDay] = useState<number | null>(null);
  const [session, setSession] = useState<ScoreSession | null>(null);
  const [flight, setFlight] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"cards" | "list">("cards");

  const rows = useMemo(() => buildScoreRows(data, sessions), [data, sessions]);
  const days = useMemo(() => scoreDays(data), [data]);
  const offersSessions = useMemo(() => hasSessions(rows), [rows]);
  const { scores, withoutSession } = useMemo(
    () => buildPlayerScores(rows, { day, session }),
    [rows, day, session],
  );
  const classes = useMemo(() => scoreClasses(scores), [scores]);
  const visible = useMemo(
    () => filterPlayerScores(scores, { query, flight }),
    [scores, query, flight],
  );
  const filtered = query.trim() !== "" || flight !== "";

  const sessionLabel = (value: ScoreSession | null) =>
    value === "AM"
      ? t("programme.scoresMorning")
      : value === "PM"
        ? t("programme.scoresAfternoon")
        : null;
  // The table has no room for the card's round list, so it keeps the day and session in one line.
  const roundSummary = (score: PublicPlayerScore, onDay: boolean) => {
    if (onDay) {
      return [t("programme.scoresDay", { day: score.dayNumber ?? 1 }), sessionLabel(score.session)]
        .filter(Boolean)
        .join(" · ");
    }
    return score.roundScores
      .map((round) =>
        [t("programme.scoresDay", { day: round.dayNumber }), sessionLabel(round.session)]
          .filter(Boolean)
          .join(" · "),
      )
      .join(" · ");
  };

  const chooseDay = (next: number | null) => {
    setDay(next);
    // A class can be missing from the day just chosen, which would leave an empty list with no
    // obvious cause.
    setFlight("");
  };

  return (
    <section className="scores" aria-labelledby="scores-heading">
      <div className="scores-head">
        <h2 id="scores-heading">{t("programme.scoresTitle")}</h2>
        <p>{t("programme.scoresIntro")}</p>
        <Link className="scores-other" href="/leaderboard">
          {t("programme.scoresSeeTeams")}
        </Link>
      </div>

      <div className="scores-view no-print" role="group" aria-labelledby="scores-view-label">
        <span className="scores-view-label" id="scores-view-label">
          {t("programme.scoresViewLabel")}
        </span>
        <div className="scores-view-options">
          <button
            type="button"
            className="scores-view-button"
            aria-pressed={view === "cards"}
            onClick={() => setView("cards")}
            data-testid="scores-view-cards"
          >
            {t("programme.scoresViewCards")}
          </button>
          <button
            type="button"
            className="scores-view-button"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            data-testid="scores-view-list"
          >
            {t("programme.scoresViewList")}
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="lb-filter">
          <span className="lb-filter-label">{t("programme.scoresDayLabel")}</span>
          <select
            className="lb-select"
            value={day === null ? "" : String(day)}
            onChange={(event) =>
              chooseDay(event.target.value === "" ? null : Number(event.target.value))
            }
            data-testid="scores-day"
          >
            <option value="">{t("programme.scoresAllDays")}</option>
            {days.map((option) => {
              const date = shortDate(option.playDate);
              return (
                <option key={option.dayNumber} value={String(option.dayNumber)}>
                  {t("programme.scoresDay", { day: option.dayNumber })}
                  {date ? ` · ${date}` : ""}
                </option>
              );
            })}
          </select>
        </label>

        {offersSessions ? (
          <label className="lb-filter">
            <span className="lb-filter-label">{t("programme.scoresSessionLabel")}</span>
            <select
              className="lb-select"
              value={session ?? ""}
              onChange={(event) =>
                setSession(event.target.value === "" ? null : (event.target.value as ScoreSession))
              }
              data-testid="scores-session"
            >
              <option value="">{t("programme.scoresAllSessions")}</option>
              <option value="AM">{t("programme.scoresMorning")}</option>
              <option value="PM">{t("programme.scoresAfternoon")}</option>
            </select>
          </label>
        ) : null}

        {classes.length > 1 ? (
          <label className="lb-filter">
            <span className="lb-filter-label">{t("programme.scoresClassLabel")}</span>
            <select
              className="lb-select"
              value={flight}
              onChange={(event) => setFlight(event.target.value)}
              data-testid="scores-class"
            >
              <option value="">{t("programme.scoresAllClasses")}</option>
              {classes.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label className="lb-filter">
          <span className="lb-filter-label">{t("programme.scoresFind")}</span>
          <input
            type="search"
            className="lb-select scores-search-input no-print"
            placeholder={t("programme.scoresFind")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-testid="scores-search"
          />
        </label>
        {query !== "" && (
          <button
            type="button"
            className="btn ghost justify-self-start no-print"
            onClick={() => setQuery("")}
          >
            {t("pairings.clearQuery")}
          </button>
        )}
      </div>

      <p className="scores-count" role="status" data-testid="scores-count">
        {t("programme.scoresShowing", { shown: visible.length, total: scores.length })}
      </p>

      {day !== null && !offersSessions ? (
        <p className="hint m-0" data-testid="scores-no-sessions">
          {t("programme.scoresNoSession")}
        </p>
      ) : null}

      {withoutSession > 0 ? (
        <p className="hint m-0" data-testid="scores-without-session">
          {t("programme.scoresWithoutSession", { count: withoutSession })}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <section className="pairings-empty" role="status" data-testid="scores-empty">
          <h3>
            {query.trim() !== ""
              ? t("programme.scoresNoMatch")
              : filtered || day !== null
                ? t("programme.scoresNoFilterMatch")
                : t("programme.scoresEmptyTitle")}
          </h3>
          <p>
            {query.trim() !== "" || filtered || day !== null
              ? t("programme.scoresNoFilterBody")
              : t("programme.scoresEmptyBody")}
          </p>
        </section>
      ) : view === "list" ? (
        <div className="scores-table-wrap">
          <table className="scores-table" data-testid="scores-table">
            <thead>
              <tr>
                <th scope="col">{t("programme.scoresTableName")}</th>
                <th scope="col" className="scores-table-class">
                  {t("programme.scoresTableClass")}
                </th>
                <th scope="col" className="num">
                  {t("programme.scoresTableNet")}
                </th>
                <th scope="col" className="num">
                  {t("programme.scoresTableGross")}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((score) => (
                <tr key={score.playerId} data-testid="scores-row">
                  <td className="scores-table-player">
                    <Link
                      href={publicTabHref("profile", { player: score.playerId })}
                      className="scores-table-name"
                    >
                      {score.name}
                    </Link>
                    <span className="scores-table-sub">{roundSummary(score, day !== null)}</span>
                  </td>
                  <td className="scores-table-class">{score.flightName ?? "—"}</td>
                  <td className="num tnum">{score.netPoints ?? "—"}</td>
                  <td className="num tnum">{score.grossPoints ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ol className="grid gap-3" data-testid="scores-list">
          {visible.map((score) => (
            <ScoreLine key={score.playerId} score={score} allDays={day === null} />
          ))}
        </ol>
      )}

      <p className="hint m-0">{t("programme.scoresSource")}</p>
    </section>
  );
}

/** One player, dressed exactly like one team on the board: rank, nameplate, points, quiet meta. */
function ScoreLine({ score, allDays }: { score: PublicPlayerScore; allDays: boolean }) {
  const { t } = useI18n();
  const sessionName = (session: ScoreSession | null) =>
    session === "AM"
      ? t("programme.scoresMorning")
      : session === "PM"
        ? t("programme.scoresAfternoon")
        : null;
  const role = allDays
    ? null
    : [t("programme.scoresDay", { day: score.dayNumber ?? 1 }), sessionName(score.session)]
        .filter(Boolean)
        .join(" · ");
  return (
    <li className="lb-team" data-rank={score.rank}>
      <div className="lb-team-head">
        <div className="lb-names">
          <div className="lb-player">
            {role ? <span className="lb-role">{role}</span> : null}
            <Link
              href={publicTabHref("profile", { player: score.playerId })}
              className="lb-name"
              data-testid="scores-name"
            >
              {score.name}
            </Link>
            <span className="lb-figures tnum">
              {t("programme.leaderboardPlayerFigures", {
                net: score.netPoints ?? "—",
                gross: score.grossPoints ?? "—",
              })}
            </span>
          </div>
        </div>
        <span className="lb-points">
          <b className="tnum">{score.netPoints ?? "—"}</b>
          <span>{t("programme.leaderboardPts")}</span>
        </span>
      </div>
      <div className="lb-meta">
        {score.pairNumber !== null ? (
          <span className="lb-meta-strong">
            {t("programme.leaderboardPair", { number: score.pairNumber })}
          </span>
        ) : null}
        {score.flightName ? <span>{score.flightName}</span> : null}
        <span>
          {t("programme.leaderboardThru")}{" "}
          <b className="tnum">
            {score.holesCounted}/{score.holesTotal || "—"}
          </b>
        </span>
        <span>
          {t("programme.leaderboardGrossPts")} <b className="tnum">{score.grossPoints ?? "—"}</b>
        </span>
      </div>
      {allDays ? (
        <ul className="scores-rounds" data-testid="scores-rounds">
          {score.roundScores.map((round) => (
            <li key={`${round.dayNumber}-${round.playDate}`} className="scores-round-line">
              <span className="scores-round-label">
                {t("programme.scoresDay", { day: round.dayNumber })}
                {sessionName(round.session) ? ` · ${sessionName(round.session)}` : ""}
              </span>
              <span className="scores-round-figures tnum">
                {t("programme.leaderboardPlayerFigures", {
                  net: round.netPoints ?? "—",
                  gross: round.grossPoints ?? "—",
                })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <svg className="lb-flag" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M9 44V4" />
        <path d="M9 6c9-4 9 4 18 0 6-2.6 7-3.2 12-4v14c-5 .8-6 1.4-12 4-9 4-9-4-18 0Z" />
        <circle cx="23" cy="38" r="1.6" />
      </svg>
    </li>
  );
}
