import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlayerOfflineNotice } from "@/components/player/OfflinePortal";
import { ScorecardBreakdown } from "@/components/player/ScorecardBreakdown";
import { getI18n } from "@/lib/i18n/server";
import { manilaToday } from "@/lib/player/dashboard";
import { demoScorecard } from "@/lib/player/demo";
import { loadPortal } from "@/lib/player/portal";
import { signedInClient } from "@/lib/player/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Scorecard" };
export const dynamic = "force-dynamic";

/**
 * The published cards, day by day. They come from the frozen publication snapshot, so a card is
 * what the club published and never an in-progress score.
 */
export default async function PlayerCardPage() {
  const { t } = await getI18n();

  if (!isSupabaseConfigured()) {
    const sample = demoScorecard(manilaToday());
    return (
      <div className="player-column grid gap-5">
        <h1 className="font-serif text-[26px] leading-8 font-semibold sm:text-[30px] sm:leading-9">
          {t("player.scorecard.heading")}
        </h1>
        <p className="notice" role="status">
          {t("player.demo.body")}{" "}
          <Link href="/pairings" className="font-semibold underline">
            {t("player.demo.link")}
          </Link>
          .
        </p>
        <p className="hint">{t("player.scorecard.swipe")}</p>
        <ScorecardBreakdown card={sample} t={t} />
      </div>
    );
  }

  const client = await signedInClient("/my/card");
  const portal = await loadPortal(client);
  if (!portal.linked || !portal.player) redirect("/my");

  const entries = portal.entries.filter((entry) => (entry.scorecards ?? []).length > 0);

  return (
    <div className="player-column grid gap-5">
      <PlayerOfflineNotice path="/my/card" />
      <h1 className="font-serif text-[26px] leading-8 font-semibold sm:text-[30px] sm:leading-9">
        {t("player.scorecard.heading")}
      </h1>

      {entries.length === 0 ? (
        <div className="notice grid gap-2">
          <p role="status">{t("player.scorecard.empty")}</p>
          <Link
            href="/pairings"
            className="inline-flex min-h-11 w-fit items-center font-semibold underline"
          >
            {t("player.app.openPairings")}
          </Link>
        </div>
      ) : (
        <>
          {/* Said once above the first card: every table scrolls sideways below this line. */}
          <p className="hint">{t("player.scorecard.swipe")}</p>
          {entries.map((entry) => (
            <section key={entry.tournamentId} className="grid gap-4">
              <h2 className="font-serif text-[22px] leading-7 font-semibold">{entry.eventName}</h2>
              {entry.scorecards.map((card) => (
                <ScorecardBreakdown key={card.roundId} card={card} t={t} />
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
