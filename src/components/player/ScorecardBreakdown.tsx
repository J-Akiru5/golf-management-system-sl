import { PlayerScorecardTable } from "@/components/player/PlayerScorecardTable";
import { fmtHcp } from "@/lib/format";
import type { Translate } from "@/lib/i18n/t";
import type { PortalScorecard } from "@/lib/player/portal";
import {
  formatToPar,
  relationToPar,
  teamHolesForFormat,
  teamViewFor,
  totalsFor,
} from "@/lib/player/scorecard";
import {
  aggregateTeam,
  summarizeTeamHoles,
  type TeamBasis,
  type TeamCombinedFormat,
  type TeamFormat,
} from "@/lib/scoring/team";

const numberText = (value: number | string | null): string =>
  value === null ? "-" : String(value);

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

interface LineTotals {
  strokes: number | null;
  toPar?: number | null;
}

function ScoreLine({
  label,
  values,
  frontHoles,
  backHoles,
  front,
  back,
  total,
  emphasis = false,
}: {
  label: string;
  values: ReadonlyMap<number, number | null>;
  frontHoles: readonly number[];
  backHoles: readonly number[];
  front: LineTotals;
  back: LineTotals;
  total: LineTotals;
  emphasis?: boolean;
}) {
  const cells = (holes: readonly number[]) =>
    holes.map((hole) => (
      <td key={hole} className="num">
        {numberText(values.get(hole) ?? null)}
      </td>
    ));

  const totalCell = (key: string, totals: LineTotals) => (
    <td key={key} className="num font-semibold">
      {numberText(totals.strokes)}
      {totals.toPar !== undefined && totals.toPar !== null && (
        <span className="ml-1 text-[11px] text-ink-muted">{formatToPar(totals.toPar)}</span>
      )}
    </td>
  );

  return (
    <tr className={emphasis ? "font-semibold" : undefined}>
      <td className="sticky left-0 z-10 border-r border-line bg-surface-raised px-3 whitespace-nowrap text-left">
        {label}
      </td>
      {cells(frontHoles)}
      {backHoles.length > 0 && totalCell("out", front)}
      {cells(backHoles)}
      {backHoles.length > 0 && totalCell("in", back)}
      {totalCell("total", total)}
    </tr>
  );
}

function TeamBreakdown({
  card,
  partner,
  shared,
  format,
  basis,
  partnerName,
  t,
}: {
  card: PortalScorecard;
  partner: PortalScorecard | null;
  shared: PortalScorecard | null;
  format: TeamCombinedFormat;
  basis: TeamBasis;
  partnerName: string | null;
  t: Translate;
}) {
  const totalHoles = card.holesTotal;
  const frontHoles = Array.from({ length: Math.min(9, totalHoles) }, (_, index) => index + 1);
  const backHoles =
    totalHoles > 9 ? Array.from({ length: totalHoles - 9 }, (_, index) => index + 10) : [];
  const team = aggregateTeam({
    format,
    basis,
    holesTotal: totalHoles,
    holes: teamHolesForFormat(format, card, partner, shared),
  });

  const basisLabel =
    basis === "net" ? t("player.scorecard.basisNet") : t("player.scorecard.basisGross");
  const rule =
    format === "four-ball"
      ? t("player.scorecard.teamRuleFourBall", { basis: basisLabel })
      : format === "aggregate"
        ? t("player.scorecard.teamRuleAggregate", { basis: basisLabel })
        : t("player.scorecard.teamRuleScramble");

  if (!team.ok) {
    return (
      <div className="grid gap-2">
        <h5 className="small-h">{t("player.scorecard.teamHeading")}</h5>
        <p className="hint">{t("player.scorecard.teamUnsupported", { format })}</p>
      </div>
    );
  }

  const valuesFor = (
    source: PortalScorecard | null,
    valueBasis: TeamBasis,
  ): Map<number, number | null> => {
    const values = new Map<number, number | null>();
    if (!source) return values;
    for (const hole of source.holes) {
      values.set(hole.hole, valueBasis === "net" ? hole.netStrokes : hole.grossStrokes);
    }
    return values;
  };

  const lineFor = (
    source: PortalScorecard,
    valueBasis: TeamBasis,
    from: number,
    to: number,
  ): LineTotals => {
    const totals = totalsFor(source, from, to);
    return {
      strokes: valueBasis === "net" ? totals.netStrokes : totals.grossStrokes,
      toPar: valueBasis === "gross" ? relationToPar(source, from, to) : undefined,
    };
  };

  const teamLine = (from: number, to: number): LineTotals => {
    const totals = summarizeTeamHoles(team.holes, totalHoles, from, to);
    return { strokes: totals.strokes, toPar: totals.toPar };
  };

  const teamValues = new Map<number, number | null>();
  for (const hole of team.holes) teamValues.set(hole.hole, hole.strokes);
  const youValues = valuesFor(card, basis);
  const partnerValues = partner ? valuesFor(partner, basis) : null;

  return (
    <div className="grid gap-2">
      <div className="grid gap-1">
        <h5 className="small-h">{t("player.scorecard.teamHeading")}</h5>
        <p className="hint">{rule}</p>
        {partnerName && (
          <p className="hint">{t("player.scorecard.partnerNamed", { name: partnerName })}</p>
        )}
      </div>

      <div className="table-wrap">
        <table className="border-separate border-spacing-0">
          <caption className="sr-only">{t("player.scorecard.teamHeading")}</caption>
          <thead>
            <tr>
              <th className="num sticky left-0 z-20 border-r border-line bg-surface-sunken px-3">
                {t("player.scorecard.hole")}
              </th>
              {frontHoles.map((hole) => (
                <th key={hole} className="num">
                  {hole}
                </th>
              ))}
              {backHoles.length > 0 && <th className="num">{t("player.scorecard.out")}</th>}
              {backHoles.map((hole) => (
                <th key={hole} className="num">
                  {hole}
                </th>
              ))}
              {backHoles.length > 0 && <th className="num">{t("player.scorecard.in")}</th>}
              <th className="num">{t("player.scorecard.total")}</th>
            </tr>
          </thead>
          <tbody>
            {format !== "scramble" && (
              <>
                <ScoreLine
                  label={`${t("player.scorecard.youRow")} · ${t(
                    basis === "net" ? "player.scorecard.net" : "player.scorecard.gross",
                  )}`}
                  values={youValues}
                  frontHoles={frontHoles}
                  backHoles={backHoles}
                  front={lineFor(card, basis, 1, 9)}
                  back={lineFor(card, basis, 10, totalHoles)}
                  total={lineFor(card, basis, 1, totalHoles)}
                />
                {partnerValues && partner && (
                  <ScoreLine
                    label={`${t("player.scorecard.partnerRow")} · ${t(
                      basis === "net" ? "player.scorecard.net" : "player.scorecard.gross",
                    )}`}
                    values={partnerValues}
                    frontHoles={frontHoles}
                    backHoles={backHoles}
                    front={lineFor(partner, basis, 1, 9)}
                    back={lineFor(partner, basis, 10, totalHoles)}
                    total={lineFor(partner, basis, 1, totalHoles)}
                  />
                )}
              </>
            )}
            <ScoreLine
              label={t("player.scorecard.teamRow")}
              values={teamValues}
              frontHoles={frontHoles}
              backHoles={backHoles}
              front={teamLine(1, 9)}
              back={teamLine(10, totalHoles)}
              total={{ strokes: team.totals.strokes, toPar: team.totals.toPar }}
              emphasis
            />
          </tbody>
        </table>
      </div>

      {team.incompleteHoles.length > 0 && (
        <p className="hint">
          {t("player.scorecard.teamIncomplete", { holes: team.incompleteHoles.join(", ") })}
        </p>
      )}
    </div>
  );
}

export interface ScorecardBreakdownProps {
  card: PortalScorecard;
  t: Translate;
  /** The event's team format. Missing means individual, the only safe default today. */
  format?: TeamFormat;
  /** The partner's published card, when the published payload carries it. */
  partner?: PortalScorecard | null;
  /** The shared team card for a scramble, when the published payload carries one. */
  shared?: PortalScorecard | null;
  /** The partner's display name, when the published payload carries it. */
  partnerName?: string | null;
  /** True for the unsaved client preview, so the card says so instead of claiming a final. */
  preview?: boolean;
}

/**
 * The player's own published card, hole by hole. It is rendered from the frozen publication
 * snapshot, so it never reads the live scoring board. The table follows the paper card: gross
 * score, the stroke received, net score, and both points columns.
 *
 * A partner or team section appears only when the caller supplies a published partner card (or a
 * shared scramble card) and a supported format. Without that data the card stays individual and
 * the page says why. No partner card is invented here.
 */
export function ScorecardBreakdown({
  card,
  t,
  format = "individual",
  partner = null,
  shared = null,
  partnerName = null,
  preview = false,
}: ScorecardBreakdownProps) {
  const stateLabel = preview
    ? t("player.scorecard.previewBadge")
    : card.state === "final"
      ? t("player.scorecard.final")
      : t("player.scorecard.provisional");
  const combinedFormat: TeamCombinedFormat | null = format === "individual" ? null : format;
  const basis: TeamBasis = combinedFormat === "scramble" ? "gross" : "net";
  const teamView = teamViewFor(format, partner, shared);

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
            <span className={`pill ${preview ? "info" : card.state === "final" ? "ok" : "info"}`}>
              {stateLabel}
            </span>
          </h4>
          <p className="hint">
            {card.playDate ? dateText(card.playDate) : t("player.value.dateTbc")}
            {card.playingHandicap !== null && ` · PH ${fmtHcp(card.playingHandicap)}`}
            {card.publishedAt &&
              ` · ${t("player.scorecard.published", { when: publishedText(card.publishedAt) })}`}
          </p>
        </div>

        {/* Two figures, the ones the board is scored on: gross points and net points. Strokes and to
            par are hole-by-hole detail the table below already carries. Net points is the pair's score,
            so it is set in green a size up; gross points stays quiet. */}
        <dl className="m-0 grid w-full grid-cols-2 gap-x-6 gap-y-3 sm:w-auto sm:gap-x-10 sm:text-right">
          {[
            { label: t("player.scorecard.grossPoints"), value: card.grossPoints },
            { label: t("player.scorecard.netPoints"), value: card.netPoints, key: true },
          ].map((fact) => (
            <div key={fact.label} className="grid min-w-0 gap-1">
              <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted sm:text-[13px]">
                {fact.label}
              </dt>
              <dd
                className={
                  fact.key
                    ? "m-0 text-[23px] font-bold leading-tight text-fairway tnum sm:text-[25px]"
                    : "m-0 text-[20px] font-bold leading-tight tnum sm:text-[22px]"
                }
              >
                {numberText(fact.value)}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <PlayerScorecardTable card={card} t={t} />

      {card.holesCounted < card.holesTotal && (
        <p className="hint">
          {t("player.scorecard.partial", {
            count: card.holesCounted,
            total: card.holesTotal,
          })}
        </p>
      )}
      {card.holes.length > 0 && card.holes.every((hole) => hole.handicapStrokes === null) && (
        <p className="hint">{t("player.scorecard.noHandicap")}</p>
      )}

      {combinedFormat !== null && teamView.showTeam && (
        <TeamBreakdown
          card={card}
          partner={partner}
          shared={shared}
          format={combinedFormat}
          basis={basis}
          partnerName={partnerName}
          t={t}
        />
      )}
      {combinedFormat !== null && teamView.showPartnerNotPublished && (
        <p className="hint">{t("player.scorecard.partnerNotPublished")}</p>
      )}

      <p className="hint">{t("player.scorecard.help")}</p>
    </section>
  );
}
