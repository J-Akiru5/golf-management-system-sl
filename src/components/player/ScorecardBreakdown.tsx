import { fmtHcp } from "@/lib/format";
import type { Translate } from "@/lib/i18n/t";
import type { PortalScorecard, PortalScorecardHole } from "@/lib/player/portal";
import {
  handicapStrokeLabel,
  type ScorecardTotals,
  scorecardRows,
  totalsFor,
} from "@/lib/player/scorecard";

const numberText = (value: number | null): string => (value === null ? "-" : String(value));

const dateText = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString("en-PH", { dateStyle: "long" });
};

const publishedText = (date: string): string => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Manila",
      });
};

function ScoreRow({ number, hole }: { number: number; hole: PortalScorecardHole | null }) {
  return (
    <tr>
      {/* The hole number is pinned left, so swiping the columns never takes away the row label. */}
      <td className="num sticky left-0 z-10 border-r border-line bg-surface-raised px-3 font-semibold">
        {number}
      </td>
      <td className="num">{hole ? hole.par : "-"}</td>
      <td className="num">{hole ? hole.strokeIndex : "-"}</td>
      <td className="num font-semibold">{hole ? hole.grossStrokes : "-"}</td>
      <td className="num">{hole ? handicapStrokeLabel(hole.handicapStrokes) : "-"}</td>
      <td className="num">{hole ? numberText(hole.netStrokes) : "-"}</td>
      <td className="num">{hole ? hole.grossPoints : "-"}</td>
      <td className="num">{hole ? numberText(hole.netPoints) : "-"}</td>
    </tr>
  );
}

function TotalRow({ label, totals }: { label: string; totals: ScorecardTotals }) {
  return (
    <tr className="font-semibold">
      {/* Same pinned column as the hole rows, so Out, In and Total stay readable while scrolling. */}
      <td className="sticky left-0 z-10 border-r border-line bg-surface-raised px-3 text-left">
        {label}
      </td>
      <td className="num" />
      <td className="num" />
      <td className="num">{totals.holes === 0 ? "-" : totals.grossStrokes}</td>
      <td className="num">-</td>
      <td className="num">{numberText(totals.netStrokes)}</td>
      <td className="num">{totals.grossPoints}</td>
      <td className="num">{numberText(totals.netPoints)}</td>
    </tr>
  );
}

/**
 * The player's own published card, hole by hole. It is rendered from the frozen publication
 * snapshot, so it never reads the live scoring board. The table follows the paper card: gross
 * score, the stroke received, net score, and both points columns.
 */
export function ScorecardBreakdown({ card, t }: { card: PortalScorecard; t: Translate }) {
  const rows = scorecardRows(card);
  const front = rows.slice(0, Math.min(9, rows.length));
  const back = rows.length > 9 ? rows.slice(9) : [];
  const total = totalsFor(card);
  const out = totalsFor(card, 1, 9);
  const backTotal = totalsFor(card, 10, card.holesTotal);
  const stateLabel =
    card.state === "final" ? t("player.scorecard.final") : t("player.scorecard.provisional");

  return (
    <section className="grid gap-3" aria-labelledby={`scorecard-${card.roundId}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <p className="overline">{t("player.scorecard.heading")}</p>
          <h4
            id={`scorecard-${card.roundId}`}
            className="flex flex-wrap items-center gap-2 text-[18px] leading-6"
          >
            {t("player.scorecard.day", { day: card.dayNumber })}
            <span className={`pill ${card.state === "final" ? "ok" : "info"}`}>{stateLabel}</span>
          </h4>
          <p className="hint">
            {card.playDate ? dateText(card.playDate) : t("player.value.dateTbc")}
            {card.playingHandicap !== null && ` · PH ${fmtHcp(card.playingHandicap)}`}
            {card.publishedAt &&
              ` · ${t("player.scorecard.published", { when: publishedText(card.publishedAt) })}`}
          </p>
        </div>

        <dl className="m-0 grid w-full grid-cols-2 gap-x-4 gap-y-2 sm:w-auto sm:gap-x-5 sm:text-right">
          {[
            { label: t("player.scorecard.gross"), value: total.grossStrokes },
            { label: t("player.scorecard.net"), value: total.netStrokes },
            { label: t("player.scorecard.grossPoints"), value: total.grossPoints },
            { label: t("player.scorecard.netPoints"), value: total.netPoints },
          ].map((fact) => (
            <div key={fact.label} className="grid min-w-0 gap-0.5">
              <dt className="small-h">{fact.label}</dt>
              <dd className="m-0 font-semibold tnum">{numberText(fact.value)}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="table-wrap">
        {/* Separate borders: Safari keeps a sticky cell in place with border-collapse: separate. */}
        <table className="border-separate border-spacing-0">
          <caption className="sr-only">{t("player.scorecard.heading")}</caption>
          <thead>
            <tr>
              <th className="num sticky left-0 z-20 border-r border-line bg-surface-sunken px-3">
                {t("player.scorecard.hole")}
              </th>
              <th className="num">{t("player.scorecard.par")}</th>
              <th className="num">{t("player.scorecard.strokeIndex")}</th>
              <th className="num">{t("player.scorecard.score")}</th>
              <th className="num">{t("player.scorecard.hcp")}</th>
              <th className="num">{t("player.scorecard.net")}</th>
              <th className="num">{t("player.scorecard.grossPoints")}</th>
              <th className="num">{t("player.scorecard.netPoints")}</th>
            </tr>
          </thead>
          <tbody>
            {front.map((hole, index) => (
              <ScoreRow key={index + 1} number={index + 1} hole={hole} />
            ))}
            {back.length > 0 && <TotalRow label={t("player.scorecard.out")} totals={out} />}
            {back.map((hole, index) => (
              <ScoreRow key={index + 10} number={index + 10} hole={hole} />
            ))}
            {back.length > 0 && <TotalRow label={t("player.scorecard.in")} totals={backTotal} />}
            <TotalRow label={t("player.scorecard.total")} totals={total} />
          </tbody>
        </table>
      </div>

      {card.holesCounted < card.holesTotal && (
        <p className="hint">
          {t("player.scorecard.partial", {
            count: card.holesCounted,
            total: card.holesTotal,
          })}
        </p>
      )}
      {total.netPoints === null && <p className="hint">{t("player.scorecard.noHandicap")}</p>}
      <p className="hint">{t("player.scorecard.help")}</p>
    </section>
  );
}
