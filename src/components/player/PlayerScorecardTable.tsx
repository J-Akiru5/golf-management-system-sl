import type { Translate } from "@/lib/i18n/t";
import type { PortalScorecard, PortalScorecardHole } from "@/lib/player/portal";
import { handicapStrokeLabel, scorecardRows, totalsFor } from "@/lib/player/scorecard";

/** A blank cell is a hole the snapshot does not carry, never a score of zero. */
function textOrDash(value: string | number | null): string {
  return value === null ? "-" : String(value);
}

/**
 * The gross or net stroke cell. A pick-up keeps the X from the paper card: the hole is complete
 * and scores no points, but it has no stroke total.
 */
function StrokeCell({
  hole,
  value,
  t,
  className,
}: {
  hole: PortalScorecardHole | null;
  value: number | null;
  t: Translate;
  className: string;
}) {
  if (hole?.pickedUp) {
    return (
      <td className={className}>
        <span aria-hidden="true" className="font-bold text-danger">
          X
        </span>
        <span className="sr-only">{t("player.scorecard.pickedUp")}</span>
      </td>
    );
  }
  return <td className={className}>{textOrDash(value)}</td>;
}

function NineTable({
  card,
  rows,
  from,
  to,
  label,
  caption,
  t,
}: {
  card: PortalScorecard;
  rows: ReadonlyArray<PortalScorecardHole | null>;
  from: number;
  to: number;
  label: string;
  caption: string;
  t: Translate;
}) {
  const totals = totalsFor(card, from, to);
  const allPresent = rows.length > 0 && rows.every((hole) => hole !== null);
  const parTotal = allPresent ? rows.reduce((sum, hole) => sum + (hole?.par ?? 0), 0) : null;

  // The paper card's own colours, the same ones the leaderboard card uses. The light band keeps
  // dark text in both themes, and the green header keeps white text, so the card still reads when
  // the page is dark.
  const band = "bg-[#eef2ef]";
  const plain = "bg-white";
  const netBand = "bg-[#dcebe1]";
  const muted = "text-[#4a5a52]";
  const edge = "border border-[#b9c4bd]";

  const paperHead = `${edge} bg-[#1f5a3c] font-semibold text-white`;
  const headCell = `${paperHead} px-0 py-2 text-center text-[11px] tnum sm:text-[12px]`;
  const corner = `${paperHead} sticky left-0 z-20 w-[3.75rem] px-1.5 py-2 text-left text-[9px] uppercase tracking-wide sm:text-[10px]`;
  const totalHead = `${paperHead} px-1 py-2 text-center text-[9px] uppercase tracking-wide sm:text-[10px]`;

  const labelCell = (tint: string) =>
    `sticky left-0 z-10 w-[3.75rem] whitespace-nowrap ${edge} px-1.5 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wide text-[#14201a] sm:text-[10px] ${tint}`;
  const cell = (tint: string) =>
    `${edge} px-0 py-1.5 text-center text-[11px] tnum text-[#14201a] sm:text-[12px] ${tint}`;
  const totalCell = (tint: string) =>
    `${edge} px-1 py-1.5 text-center text-[11px] font-bold tnum text-[#14201a] sm:text-[12px] ${tint}`;

  return (
    <div
      className="table-wrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus print:overflow-visible"
      role="region"
      tabIndex={0}
      aria-label={caption}
      data-testid={`player-scorecard-${card.roundId}-${from}`}
    >
      <table className="w-full min-w-[22rem] table-fixed border-separate border-spacing-0 text-[11px] print:min-w-0 sm:text-[12px]">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col className="w-[3.75rem]" />
          {rows.map((_, index) => (
            <col key={from + index} className="w-[1.75rem]" />
          ))}
          <col className="w-[2.5rem]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={corner}>
              {t("player.scorecard.hole")}
            </th>
            {rows.map((_, index) => (
              <th key={from + index} scope="col" className={headCell}>
                {from + index}
              </th>
            ))}
            <th scope="col" className={totalHead}>
              {label}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" className={labelCell(band)}>
              {t("player.scorecard.par")}
            </th>
            {rows.map((hole, index) => (
              <td key={from + index} className={cell(`${band} font-semibold`)}>
                {hole?.par ?? "-"}
              </td>
            ))}
            <td className={totalCell(band)}>{textOrDash(parTotal)}</td>
          </tr>
          <tr>
            <th scope="row" className={labelCell(plain)}>
              {t("player.scorecard.strokeIndex")}
            </th>
            {rows.map((hole, index) => (
              <td key={from + index} className={cell(muted)}>
                {hole?.strokeIndex ?? "-"}
              </td>
            ))}
            <td className={totalCell(band)}>-</td>
          </tr>
          <tr>
            <th scope="row" className={labelCell(band)}>
              {t("player.scorecard.gross")}
            </th>
            {rows.map((hole, index) => (
              <StrokeCell
                key={from + index}
                hole={hole}
                value={hole?.grossStrokes ?? null}
                t={t}
                className={cell(`${band} font-semibold`)}
              />
            ))}
            <td className={totalCell(band)}>{textOrDash(totals.grossStrokes)}</td>
          </tr>
          <tr>
            <th scope="row" className={labelCell(plain)}>
              {t("player.scorecard.hcp")}
            </th>
            {rows.map((hole, index) => (
              <td key={from + index} className={cell(muted)}>
                {hole ? handicapStrokeLabel(hole.handicapStrokes) : "-"}
              </td>
            ))}
            <td className={totalCell(band)}>-</td>
          </tr>
          <tr>
            <th scope="row" className={labelCell(netBand)}>
              {t("player.scorecard.net")}
            </th>
            {rows.map((hole, index) => (
              <StrokeCell
                key={from + index}
                hole={hole}
                value={hole?.netStrokes ?? null}
                t={t}
                className={cell(`${netBand} font-semibold`)}
              />
            ))}
            <td className={totalCell(netBand)}>{textOrDash(totals.netStrokes)}</td>
          </tr>
          <tr>
            <th scope="row" className={labelCell(plain)}>
              {t("player.scorecard.grossPoints")}
            </th>
            {rows.map((hole, index) => (
              <td key={from + index} className={cell(plain)}>
                {hole ? hole.grossPoints : "-"}
              </td>
            ))}
            <td className={totalCell(band)}>
              {totals.holes === 0 ? "-" : textOrDash(totals.grossPoints)}
            </td>
          </tr>
          <tr>
            <th scope="row" className={labelCell(plain)}>
              {t("player.scorecard.netPoints")}
            </th>
            {rows.map((hole, index) => (
              <td key={from + index} className={cell(plain)}>
                {hole ? textOrDash(hole.netPoints) : "-"}
              </td>
            ))}
            <td className={totalCell(band)}>{textOrDash(totals.netPoints)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * The player's card as the paper card: two nine-hole tables, with the row labels pinned so a
 * phone scrolls the holes sideways without losing the row. A pick-up stays an X and never turns
 * into a stroke score. Nothing here is interactive; it renders the frozen published snapshot.
 */
export function PlayerScorecardTable({ card, t }: { card: PortalScorecard; t: Translate }) {
  const rows = scorecardRows(card);
  const captionFor = (label: string) =>
    `${t("player.scorecard.heading")} · ${t("player.scorecard.day", { day: card.dayNumber })} · ${label}`;

  return (
    <div className="grid gap-2">
      <p className="hint m-0 hidden max-[389px]:block">{t("player.scorecard.swipe")}</p>
      <NineTable
        card={card}
        rows={rows.slice(0, 9)}
        from={1}
        to={9}
        label={t("player.scorecard.out")}
        caption={captionFor(t("player.scorecard.out"))}
        t={t}
      />
      {rows.length > 9 && (
        <NineTable
          card={card}
          rows={rows.slice(9, card.holesTotal)}
          from={10}
          to={card.holesTotal}
          label={t("player.scorecard.in")}
          caption={captionFor(t("player.scorecard.in"))}
          t={t}
        />
      )}
      {card.holes.some((hole) => hole.pickedUp) && (
        <p className="hint m-0">{t("player.scorecard.pickupHelp")}</p>
      )}
    </div>
  );
}
