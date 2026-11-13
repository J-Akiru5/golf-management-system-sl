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

  const headCell =
    "border-b border-line bg-primary px-0 py-2 text-center text-[11px] font-bold text-on-primary tnum sm:text-[12px]";
  const corner =
    "sticky left-0 z-20 w-[3.75rem] border-b border-r border-line bg-primary px-1.5 py-2 text-left text-[9px] font-semibold uppercase tracking-wide text-on-primary sm:text-[10px]";
  const totalHead =
    "border-b border-l border-line bg-primary px-1 py-2 text-center text-[9px] font-bold uppercase tracking-wide text-on-primary sm:text-[10px]";

  const labelCell = (tint: string) =>
    `sticky left-0 z-10 w-[3.75rem] whitespace-nowrap border-b border-r border-line px-1.5 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wide text-ink-muted sm:text-[10px] ${tint}`;
  const cell = (tint: string) =>
    `border-b border-line px-0 py-1.5 text-center text-[11px] tnum text-ink sm:text-[12px] ${tint}`;
  const totalCell = (tint: string) =>
    `border-b border-l border-line px-1 py-1.5 text-center text-[11px] font-bold tnum text-ink sm:text-[12px] ${tint}`;

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
            <th scope="row" className={labelCell("bg-surface-sunken")}>
              {t("player.scorecard.par")}
            </th>
            {rows.map((hole, index) => (
              <td key={from + index} className={cell("bg-surface-sunken font-semibold")}>
                {hole?.par ?? "-"}
              </td>
            ))}
            <td className={totalCell("bg-surface-sunken")}>{textOrDash(parTotal)}</td>
          </tr>
          <tr>
            <th scope="row" className={labelCell("bg-surface-raised")}>
              {t("player.scorecard.strokeIndex")}
            </th>
            {rows.map((hole, index) => (
              <td key={from + index} className={cell("text-ink-muted")}>
                {hole?.strokeIndex ?? "-"}
              </td>
            ))}
            <td className={totalCell("bg-surface-sunken")}>-</td>
          </tr>
          <tr>
            <th scope="row" className={labelCell("bg-surface-sunken")}>
              {t("player.scorecard.gross")}
            </th>
            {rows.map((hole, index) => (
              <StrokeCell
                key={from + index}
                hole={hole}
                value={hole?.grossStrokes ?? null}
                t={t}
                className={cell("bg-surface-sunken font-semibold")}
              />
            ))}
            <td className={totalCell("bg-surface-sunken")}>{textOrDash(totals.grossStrokes)}</td>
          </tr>
          <tr>
            <th scope="row" className={labelCell("bg-surface-raised")}>
              {t("player.scorecard.hcp")}
            </th>
            {rows.map((hole, index) => (
              <td key={from + index} className={cell("text-ink-muted")}>
                {hole ? handicapStrokeLabel(hole.handicapStrokes) : "-"}
              </td>
            ))}
            <td className={totalCell("bg-surface-sunken")}>-</td>
          </tr>
          <tr>
            <th scope="row" className={labelCell("bg-fairway-soft")}>
              {t("player.scorecard.net")}
            </th>
            {rows.map((hole, index) => (
              <StrokeCell
                key={from + index}
                hole={hole}
                value={hole?.netStrokes ?? null}
                t={t}
                className={cell("bg-fairway-soft font-semibold")}
              />
            ))}
            <td className={totalCell("bg-fairway-soft")}>{textOrDash(totals.netStrokes)}</td>
          </tr>
          <tr>
            <th scope="row" className={labelCell("bg-surface-raised")}>
              {t("player.scorecard.grossPoints")}
            </th>
            {rows.map((hole, index) => (
              <td key={from + index} className={cell("")}>
                {hole ? hole.grossPoints : "-"}
              </td>
            ))}
            <td className={totalCell("bg-surface-sunken")}>
              {totals.holes === 0 ? "-" : textOrDash(totals.grossPoints)}
            </td>
          </tr>
          <tr>
            <th scope="row" className={labelCell("bg-surface-raised")}>
              {t("player.scorecard.netPoints")}
            </th>
            {rows.map((hole, index) => (
              <td key={from + index} className={cell("")}>
                {hole ? textOrDash(hole.netPoints) : "-"}
              </td>
            ))}
            <td className={totalCell("bg-surface-sunken")}>{textOrDash(totals.netPoints)}</td>
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
