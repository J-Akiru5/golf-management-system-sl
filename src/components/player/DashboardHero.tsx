import { ClipboardList, List, Map, Trophy } from "lucide-react";
import Link from "next/link";
import { fmtTime, shortDate } from "@/lib/format";
import type { Translate } from "@/lib/i18n/t";
import type { NextUp } from "@/lib/player/dashboard";
import { startLabel } from "@/lib/player/portal";

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
  // A date people read: "Thu, Nov 12", not "2026-11-12". Anything that is not an ISO day is shown
  // as stored rather than hidden.
  const dates =
    entry.dates.length > 0
      ? entry.dates.map((date) => shortDate(date) ?? date).join(" · ")
      : entry.eventDate
        ? (shortDate(entry.eventDate) ?? entry.eventDate)
        : t("player.value.dateTbc");

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
      <div className="next-up-details">
        <p className="next-up-start">{startLabel(entry, t, fmtTime)}</p>
        <p className="next-up-hint">
          {entry.flight ?? t("player.value.notPlacedYet")} ·{" "}
          {entry.tee ?? t("player.value.notSetYet")}
        </p>
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
          <span className="app-tile-icon">
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
