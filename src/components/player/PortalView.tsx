import Link from "next/link";
import { ScorecardBreakdown } from "@/components/player/ScorecardBreakdown";
import { fmtHcp, fmtIndex, fmtTime } from "@/lib/format";
import type { Translate } from "@/lib/i18n/t";
import {
  type PortalEntry,
  type PortalState,
  paymentLabel,
  startLabel,
  statusLabel,
} from "@/lib/player/portal";

/**
 * The read-only player view. The live portal and the copy saved on the phone both render this, so
 * the offline screen cannot show a field the live one hides. The translator is passed in: the live
 * page knows the reader's language, and the offline page has no server to ask.
 */
export function EntryCard({ entry, t }: { entry: PortalEntry; t: Translate }) {
  // A snapshot saved on the phone before scorecards existed has no array at all.
  const scorecards = entry.scorecards ?? [];
  const facts: { label: string; value: string }[] = [
    { label: t("player.fact.start"), value: startLabel(entry, t, fmtTime) },
    { label: t("player.fact.flight"), value: entry.flight ?? t("player.value.notPlacedYet") },
    { label: t("player.fact.tee"), value: entry.tee ?? t("player.value.notSetYet") },
    { label: t("player.fact.playingHandicap"), value: fmtHcp(entry.playingHandicap) },
    { label: t("player.fact.entryHandicap"), value: fmtIndex(entry.frozenIndex) },
    { label: t("player.fact.payment"), value: paymentLabel(t, entry.paymentStatus) },
  ];
  const unconfirmed = entry.status !== "ok";

  return (
    <article className="card grid gap-3">
      <header className="grid gap-1">
        <h3 className="font-serif text-[24px] leading-7 font-semibold">{entry.eventName}</h3>
        <p className="hint">
          {entry.dates.length > 1
            ? entry.dates.join(" · ")
            : (entry.eventDate ?? t("player.value.dateTbc"))}
          {" · "}
          {entry.startFormat === "shotgun" ? t("player.value.shotgun") : t("player.value.twoTee")}
        </p>
      </header>

      {unconfirmed && (
        <p className={entry.status === "ineligible" ? "notice bad" : "notice warn"} role="status">
          <b>{statusLabel(t, entry.status)}.</b>
          {entry.reasons.length > 0 && <span> {entry.reasons.join(" ")}</span>}
        </p>
      )}

      <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-line bg-line sm:grid-cols-3">
        {facts.map((fact) => (
          <div
            key={fact.label}
            className="grid content-start gap-0.5 bg-surface-raised px-3 py-2.5"
          >
            <dt className="small-h">{fact.label}</dt>
            <dd className="m-0 font-semibold tnum">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {scorecards.length > 0 ? (
        <div className="grid gap-4">
          {scorecards.map((card) => (
            <ScorecardBreakdown key={card.roundId} card={card} t={t} />
          ))}
        </div>
      ) : (
        <p className="hint">{t("player.scorecard.empty")}</p>
      )}

      <p className="hint">
        {entry.published ? t("player.published.yes") : t("player.published.no")}{" "}
        <Link href="/pairings">{t("player.seeFullList")}</Link>.
      </p>
    </article>
  );
}

/** The signed-in player's name and every event they are entered in. */
export function PortalEntries({
  state,
  t,
  linkedMessage,
  nameHeading = "h1",
}: {
  state: PortalState;
  t: Translate;
  linkedMessage?: string | null;
  /** The offline page already has its own h1, so it asks for h2. */
  nameHeading?: "h1" | "h2";
}) {
  const NameHeading = nameHeading;
  return (
    <div className="grid gap-4">
      {linkedMessage && (
        <p className="notice ok" role="status">
          {linkedMessage}
        </p>
      )}
      {state.player && (
        <div className="grid gap-1">
          <p className="overline">{t("player.title")}</p>
          <NameHeading className="font-serif text-[32px] leading-9 font-semibold">
            {state.player.name}
          </NameHeading>
          {state.player.ngapId && <p className="hint">NGAP {state.player.ngapId}</p>}
        </div>
      )}

      {state.entries.length === 0 ? (
        <p className="notice" role="status">
          {t("player.noEntries")}
        </p>
      ) : (
        <div className="grid gap-4">
          {state.entries.map((entry) => (
            <EntryCard key={entry.tournamentId} entry={entry} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
