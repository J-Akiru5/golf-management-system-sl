import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlayerOfflineNotice } from "@/components/player/OfflinePortal";
import { ScorecardBreakdown } from "@/components/player/ScorecardBreakdown";
import { getI18n } from "@/lib/i18n/server";
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
    return (
      <div className="grid gap-4">
        <h1 className="font-serif text-[30px] leading-9 font-semibold">
          {t("player.scorecard.heading")}
        </h1>
        <p className="notice" role="status">
          {t("player.demo.body")}
        </p>
      </div>
    );
  }

  const client = await signedInClient("/my/card");
  const portal = await loadPortal(client);
  if (!portal.linked || !portal.player) redirect("/my");

  const entries = portal.entries.filter((entry) => (entry.scorecards ?? []).length > 0);

  return (
    <div className="grid gap-5">
      <PlayerOfflineNotice path="/my/card" />
      <h1 className="font-serif text-[30px] leading-9 font-semibold">
        {t("player.scorecard.heading")}
      </h1>

      {entries.length === 0 ? (
        <p className="notice" role="status">
          {t("player.scorecard.empty")}
        </p>
      ) : (
        entries.map((entry) => (
          <section key={entry.tournamentId} className="grid gap-4">
            <h2 className="font-serif text-[22px] leading-7 font-semibold">{entry.eventName}</h2>
            {entry.scorecards.map((card) => (
              <ScorecardBreakdown key={card.roundId} card={card} t={t} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
