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

/**
 * The column names, handed to every row. The table prints them once in its head; below 640px each
 * hole becomes its own block, and every value needs the heading beside it again.
 */
interface ScorecardLabels {
  hole: string;
  par: string;
  si: string;
  score: string;
  hcp: string;
  net: string;
  grossPoints: string;
  netPoints: string;
}

function ScoreRow({
  number,
  hole,
  labels,
}: {
  number: number;
  hole: PortalScorecardHole | null;
  labels: ScorecardLabels;
}) {
  return (
    <tr className="score-hole">
      <td className="num font-semibold" data-label={labels.hole}>
        {number}
      </td>
      <td className="num" data-label={labels.par}>
        {hole ? hole.par : "-"}
      </td>
      <td className="num" data-label={labels.si}>
        {hole ? hole.strokeIndex : "-"}
      </td>
      <td className="num font-semibold" data-label={labels.score}>
        {hole ? hole.grossStrokes : "-"}
      </td>
      <td className="num" data-label={labels.hcp}>
        {hole ? handicapStrokeLabel(hole.handicapStrokes) : "-"}
      </td>
      <td className="num" data-label={labels.net}>
        {hole ? numberText(hole.netStrokes) : "-"}
      </td>
      <td className="num" data-label={labels.grossPoints}>
        {hole ? hole.grossPoints : "-"}
      </td>
      <td className="num" data-label={labels.netPoints}>
        {hole ? numberText(hole.netPoints) : "-"}
      </td>
    </tr>
  );
}

function TotalRow({
  label,
  totals,
  labels,
}: {
  label: string;
  totals: ScorecardTotals;
  labels: ScorecardLabels;
}) {
  return (
    <tr className="score-total font-semibold">
      <td colSpan={3}>{label}</td>
      <td className="num" data-label={labels.score}>
        {totals.holes === 0 ? "-" : totals.grossStrokes}
      </td>
      <td className="num" data-label={labels.hcp}>
        -
      </td>
      <td className="num" data-label={labels.net}>
        {numberText(totals.netStrokes)}
      </td>
      <td className="num" data-label={labels.grossPoints}>
        {totals.grossPoints}
      </td>
      <td className="num" data-label={labels.netPoints}>
        {numberText(totals.netPoints)}
      </td>
    </tr>
  );
}

/**
 * The player's own published card, hole by hole. It is rendered from the frozen publication
 * snapshot, so it never reads the live scoring board. The table follows the paper card: gross
 * score, the stroke received, net score, and both points columns.
 *
 * The card is eight columns wide. On a phone it is redrawn as one four-across block per hole, so
 * every value is on screen instead of waiting behind a sideways scroll; from 640px up the table is
 * unchanged.
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
  const labels: ScorecardLabels = {
    hole: t("player.scorecard.hole"),
    par: t("player.scorecard.par"),
    si: t("player.scorecard.strokeIndex"),
    score: t("player.scorecard.score"),
    hcp: t("player.scorecard.hcp"),
    net: t("player.scorecard.net"),
    grossPoints: t("player.scorecard.grossPoints"),
    netPoints: t("player.scorecard.netPoints"),
  };

  return (
    <section className="grid gap-3" aria-labelledby={`scorecard-${card.roundId}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="overline">{t("player.scorecard.heading")}</p>
          <h3
            id={`scorecard-${card.roundId}`}
            className="flex flex-wrap items-center gap-2 text-[18px] leading-6"
          >
            {t("player.scorecard.day", { day: card.dayNumber })}
            <span className={`pill ${card.state === "final" ? "ok" : "info"}`}>{stateLabel}</span>
          </h3>
          <p className="hint">
            {card.playDate ? dateText(card.playDate) : t("player.value.dateTbc")}
            {card.playingHandicap !== null && ` · PH ${fmtHcp(card.playingHandicap)}`}
            {card.publishedAt &&
              ` · ${t("player.scorecard.published", { when: publishedText(card.publishedAt) })}`}
          </p>
        </div>

        <dl className="m-0 grid grid-cols-2 gap-x-5 gap-y-1 sm:text-right">
          {[
            { label: t("player.scorecard.gross"), value: total.grossStrokes },
            { label: t("player.scorecard.net"), value: total.netStrokes },
            { label: t("player.scorecard.grossPoints"), value: total.grossPoints },
            { label: t("player.scorecard.netPoints"), value: total.netPoints },
          ].map((fact) => (
            <div key={fact.label} className="grid gap-0.5">
              <dt className="small-h">{fact.label}</dt>
              <dd className="m-0 font-semibold tnum">{numberText(fact.value)}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="table-wrap scorecard-table">
        <table>
          <caption className="sr-only">{t("player.scorecard.heading")}</caption>
          <thead>
            <tr>
              <th scope="col" className="num">
                {t("player.scorecard.hole")}
              </th>
              <th scope="col" className="num">
                {t("player.scorecard.par")}
              </th>
              <th scope="col" className="num">
                {t("player.scorecard.strokeIndex")}
              </th>
              <th scope="col" className="num">
                {t("player.scorecard.score")}
              </th>
              <th scope="col" className="num">
                {t("player.scorecard.hcp")}
              </th>
              <th scope="col" className="num">
                {t("player.scorecard.net")}
              </th>
              <th scope="col" className="num">
                {t("player.scorecard.grossPoints")}
              </th>
              <th scope="col" className="num">
                {t("player.scorecard.netPoints")}
              </th>
            </tr>
          </thead>
          <tbody>
            {front.map((hole, index) => (
              <ScoreRow key={index + 1} number={index + 1} hole={hole} labels={labels} />
            ))}
            {back.length > 0 && (
              <TotalRow label={t("player.scorecard.out")} totals={out} labels={labels} />
            )}
            {back.map((hole, index) => (
              <ScoreRow key={index + 10} number={index + 10} hole={hole} labels={labels} />
            ))}
            {back.length > 0 && (
              <TotalRow label={t("player.scorecard.in")} totals={backTotal} labels={labels} />
            )}
            <TotalRow label={t("player.scorecard.total")} totals={total} labels={labels} />
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
