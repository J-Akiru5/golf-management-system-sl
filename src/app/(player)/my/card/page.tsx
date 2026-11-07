import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlayerOfflineNotice } from "@/components/player/OfflinePortal";
import { PlayerPageHeader } from "@/components/player/PlayerPageHeader";
import { ScorecardBreakdown } from "@/components/player/ScorecardBreakdown";
import { getI18n } from "@/lib/i18n/server";
import { demoScorecard } from "@/lib/player/demo-card";
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
    // Demo builds have no accounts, so the page shows a sample card instead of a dead end. It is
    // the demo layout's own placeholders, and says so: never IGCC's real pars.
    return (
      <div className="grid gap-5">
        <PlayerPageHeader title={t("player.scorecard.heading")} />
        <p className="notice" role="status">
          {t("player.demo.sampleBody")}
        </p>
        <section className="grid gap-4">
          <h2 className="font-serif text-[22px] leading-7 font-semibold">
            {t("player.demo.sampleEvent")}
          </h2>
          <ScorecardBreakdown card={demoScorecard()} t={t} />
        </section>
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
      <PlayerPageHeader title={t("player.scorecard.heading")} />

      {entries.length === 0 ? (
        <div className="grid gap-2">
          <p className="notice" role="status">
            {t("player.scorecard.empty")}
          </p>
          <Link
            href="/pairings"
            className="inline-flex min-h-11 items-center font-semibold text-fairway no-underline hover:underline"
          >
            {t("player.app.openPairings")}
          </Link>
        </div>
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
