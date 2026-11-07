import { ArrowUpRight, ClipboardList, List, Map, Trophy } from "lucide-react";
import Link from "next/link";
import { fmtRange } from "@/lib/data/labels";
import { fmtHcp, fmtTime } from "@/lib/format";
import type { Translate } from "@/lib/i18n/t";
import type { NextUp } from "@/lib/player/dashboard";
import { paymentLabel, startLabel, statusLabel } from "@/lib/player/portal";

/**
 * The top of the player's dashboard: the round that matters now, then the four places a player
 * actually goes. Wording stays in the dictionary so the card speaks the reader's language.
 */
export function DashboardHero({ next, t }: { next: NextUp; t: Translate }) {
  const { entry, when } = next;
  const overline =
    when === "today"
      ? t("player.app.playingToday")
      : when === "upcoming"
        ? t("player.app.nextUp")
        : t("player.app.lastPlayed");
  const dates = entry.dates.length
    ? fmtRange(entry.dates)
    : entry.eventDate
      ? fmtRange([entry.eventDate])
      : t("player.value.dateTbc");
  const status = entry.status === "ok" ? null : statusLabel(t, entry.status);

  return (
    <section className="next-up" aria-labelledby="next-up-h" data-testid="next-up">
      <p className="overline">{overline}</p>
      <h2 id="next-up-h" className="next-up-title">
        {entry.eventName}
      </h2>
      <p className="next-up-hint">
        {dates} ·{" "}
        {entry.startFormat === "shotgun" ? t("player.value.shotgun") : t("player.value.twoTee")}
      </p>
      <p className="next-up-start">{startLabel(entry, t, fmtTime)}</p>
      <p className="next-up-hint">
        {entry.flight ?? t("player.value.notPlacedYet")} ·{" "}
        {entry.tee ?? t("player.value.notSetYet")}
      </p>
      <div className="next-up-facts">
        <span>
          {t("player.fact.playingHandicap")} <b>{fmtHcp(entry.playingHandicap)}</b>
        </span>
        <span>
          {t("player.fact.payment")} <b>{paymentLabel(t, entry.paymentStatus)}</b>
        </span>
      </div>
      {status && (
        <p className="next-up-status" role="status">
          {status}
          {entry.reasons.length > 0 && ` · ${entry.reasons.join(" ")}`}
        </p>
      )}
      <div className="next-up-actions">
        <Link href="/pairings" className="next-up-action primary">
          {t("player.seeFullList")}
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
        <Link href="/my/card" className="next-up-action">
          <ClipboardList className="size-4" aria-hidden="true" />
          {t("player.app.openCard")}
        </Link>
      </div>
    </section>
  );
}

/** The four destinations the dashboard keeps one tap away. */
export function AppTiles({ t }: { t: Translate }) {
  const tiles = [
    { href: "/my/board", label: t("player.app.openBoard"), Icon: Trophy },
    { href: "/my/card", label: t("player.app.openCard"), Icon: ClipboardList },
    { href: "/my/course", label: t("player.app.openCourse"), Icon: Map },
    { href: "/pairings", label: t("player.app.openPairings"), Icon: List },
  ];

  return (
    <nav aria-label={t("player.app.tiles")} className="app-tiles">
      {tiles.map(({ href, label, Icon }) => (
        <Link key={href} href={href} className="app-tile no-underline">
          <Icon className="size-[18px]" aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
