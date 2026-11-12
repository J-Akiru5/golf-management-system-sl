import type { JSX } from "react";
import { fmtHcp } from "@/lib/format";
import {
  paperFooter,
  paperNines,
  paperParTotal,
  paperPointsText,
  paperScoreText,
} from "@/lib/player/paper-scorecard";
import type { PortalScorecard, PortalScorecardHole } from "@/lib/player/portal";

/*
 * The paper scorecard's own colours. The light band keeps dark text on both themes, and the green
 * header keeps white text, so the card stays readable when the page is dark.
 */
const cell = "border border-[#b9c4bd] px-2 py-1 text-center whitespace-nowrap";
const bandCell = `${cell} bg-[#eef2ef] font-semibold text-[#14201a]`;
const headCell = `${cell} bg-[#1f5a3c] font-semibold text-white`;

/**
 * One player's frozen daily card, laid out like the club's paper scorecard.
 *
 * Each nine is its own table inside a horizontal scroll wrapper, so a phone swipes the columns
 * without widening the page. The last nine carries a TOT column for the whole card. A pickup shows
 * a red X in the Score row and no number. Missing holes show "-".
 *
 * Server-safe: no hooks, no state, no i18n. The caller passes the published card only.
 */
export function PaperScorecard(props: { card: PortalScorecard; title?: string }): JSX.Element {
  const { card, title } = props;
  const nines = paperNines(card);
  const footer = paperFooter(card);
  const parTotal = paperParTotal(card);

  const rowHead = (text: string, className: string) => (
    <th scope="row" className={`${className} text-left`}>
      {text}
    </th>
  );

  return (
    <section
      data-testid="paper-scorecard"
      className="grid min-w-0 gap-3 rounded-[14px] border border-line bg-surface-raised p-3 text-ink"
    >
      {title && <h3 className="m-0 text-[16px] leading-6">{title}</h3>}

      <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-muted">
        <span>
          Day <b className="text-ink">{card.dayNumber}</b>
        </span>
        <span>
          Playing handicap <b className="text-ink">{fmtHcp(card.playingHandicap)}</b>
        </span>
        <span>
          Course handicap <b className="text-ink">{fmtHcp(card.courseHandicap)}</b>
        </span>
      </p>

      {nines.map((nine, nineIndex) => {
        const lastNine = nineIndex === nines.length - 1;
        const lastHole = nine.holes.length > 0 ? nine.from + nine.holes.length - 1 : nine.from - 1;

        return (
          <div key={nine.label} className="min-w-0 overflow-x-auto">
            <table className="w-full border-collapse text-[12px] tnum">
              <caption className="sr-only">
                {title ? `${title}: ` : ""}
                holes {nine.from} to {lastHole}, {nine.label}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={`${headCell} text-left`}>
                    Hole
                  </th>
                  {nine.holes.map((_, index) => (
                    <th key={index} scope="col" className={headCell}>
                      {nine.from + index}
                    </th>
                  ))}
                  <th scope="col" className={headCell}>
                    {nine.label}
                  </th>
                  {lastNine && (
                    <th scope="col" className={headCell}>
                      TOT
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {rowHead("Par", bandCell)}
                  {nine.holes.map((hole: PortalScorecardHole | null, index: number) => (
                    <td key={index} className={bandCell}>
                      {hole ? hole.par : "-"}
                    </td>
                  ))}
                  <td className={`${bandCell} font-bold`}>{nine.totals.par}</td>
                  {lastNine && <td className={`${bandCell} font-bold`}>{parTotal}</td>}
                </tr>

                <tr>
                  {rowHead("SI", cell)}
                  {nine.holes.map((hole: PortalScorecardHole | null, index: number) => (
                    <td key={index} className={cell}>
                      {hole ? hole.strokeIndex : "-"}
                    </td>
                  ))}
                  <td className={cell} />
                  {lastNine && <td className={cell} />}
                </tr>

                <tr>
                  {rowHead("Score", cell)}
                  {nine.holes.map((hole: PortalScorecardHole | null, index: number) => (
                    <td
                      key={index}
                      data-testid={hole?.pickedUp ? "paper-scorecard-pickup" : undefined}
                      className={`${cell} font-semibold${hole?.pickedUp ? " text-danger font-bold" : ""}`}
                    >
                      {paperScoreText(hole)}
                    </td>
                  ))}
                  <td className={`${bandCell} font-bold`}>
                    {nine.totals.played === 0 ? "-" : nine.totals.strokes}
                  </td>
                  {lastNine && <td className={`${bandCell} font-bold`}>{footer.strokes}</td>}
                </tr>

                <tr>
                  {rowHead("Net pts", cell)}
                  {nine.holes.map((hole: PortalScorecardHole | null, index: number) => (
                    <td key={index} className={cell}>
                      {hole ? paperPointsText(hole.netPoints) : "-"}
                    </td>
                  ))}
                  <td className={`${bandCell} font-bold`}>
                    {paperPointsText(nine.totals.netPoints)}
                  </td>
                  {lastNine && (
                    <td className={`${bandCell} font-bold`}>{paperPointsText(footer.netPoints)}</td>
                  )}
                </tr>

                <tr>
                  {rowHead("Gross pts", cell)}
                  {nine.holes.map((hole: PortalScorecardHole | null, index: number) => (
                    <td key={index} className={cell}>
                      {hole ? hole.grossPoints : "-"}
                    </td>
                  ))}
                  <td className={`${bandCell} font-bold`}>{nine.totals.grossPoints}</td>
                  {lastNine && <td className={`${bandCell} font-bold`}>{footer.grossPoints}</td>}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        <span>
          Strokes <b>{footer.strokesText}</b>
        </span>
        <span>
          Holes with a score <b>{footer.playedLabel}</b>
        </span>
        <span>
          Net Stableford <b>{paperPointsText(footer.netPoints)}</b>
        </span>
        <span>
          Gross Stableford <b>{footer.grossPoints}</b>
        </span>
      </div>
    </section>
  );
}
