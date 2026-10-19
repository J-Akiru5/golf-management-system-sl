import Link from "next/link";
import { PlayerBottomBar } from "@/components/MobileTabBar";
import { PairingsView } from "@/components/PairingsView";
import { PlayerOfflineNotice } from "@/components/player/OfflinePortal";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { fmtDateLabel } from "@/lib/data/labels";
import { toPublicPairings } from "@/lib/data/public";
import { loadPublicPairings } from "@/lib/data/supabase/public-pairings";
import { fmtTime } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { DemoPairings } from "./DemoPairings";

/**
 * The page players open. Built on the server from the published version in the database, with no
 * login, and cached: it refreshes within a minute on its own and immediately when the organizer
 * publishes (the desk calls /api/revalidate-pairings).
 */
export const revalidate = 60;

const manila = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

export default async function PublicPairingsPage() {
  if (!isSupabaseConfigured()) return <DemoPairings />;

  let data: Awaited<ReturnType<typeof loadPublicPairings>> = null;
  let failed = false;
  try {
    data = await loadPublicPairings(createSupabasePublicClient());
  } catch {
    failed = true;
  }

  const published = data?.published ?? null;
  const pairings =
    data && published
      ? toPublicPairings({
          published,
          tournamentName: data.name,
          dateLabel: fmtDateLabel([data.date]),
          startFormat: data.startFormat,
          firstTeeTime: data.firstTeeTime,
        })
      : null;

  return (
    <div className="public mobile-bar-space">
      <PlayerOfflineNotice path="/pairings" />
      <header className="public-head">
        <div className="flex flex-wrap items-center gap-3">
          <TeeLineLogo variant="reverse" width={172} />
          <span className="leading-tight">
            <b className="block font-display text-[13px] font-semibold">Club tournament pairings</b>
            <span className="text-xs text-on-forest-muted">Iloilo Golf &amp; Country Club</span>
          </span>
        </div>
        {data && (
          <>
            <p className="overline mt-3 !text-gold">
              {data.startFormat === "shotgun" ? "Shotgun start" : "Two-tee start"} ·{" "}
              {fmtTime(data.firstTeeTime)}
            </p>
            <h1 className="font-serif text-[28px] leading-8 font-semibold !text-on-forest sm:text-[44px] sm:leading-[48px]">
              {data.name}
            </h1>
            <p className="text-on-forest-muted">{fmtDateLabel([data.date])}</p>
          </>
        )}
      </header>

      {failed ? (
        <div className="notice" role="status">
          <b>Pairings can't be loaded right now.</b> Please try again in a few minutes.
        </div>
      ) : !pairings || !published ? (
        <div className="notice" role="status">
          <b>Pairings are not out yet.</b> Please check again later.
        </div>
      ) : (
        <>
          <p className="hint no-print" data-testid="pairings-version">
            {published.version ? `Pairings version ${published.version} · ` : ""}
            updated {manila.format(new Date(published.at))} (Philippine time). If you have a printed
            copy, check that the version matches.
          </p>
          <PairingsView pairings={pairings} headingLevel="section" flightFilter />
        </>
      )}

      <p className="hint no-print">
        Names, flight, hole and time only. <Link href="/">TeeLine Golf home</Link>
      </p>
      <PlayerBottomBar />
    </div>
  );
}
