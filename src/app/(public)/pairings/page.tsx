"use client";

import Link from "next/link";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PairingsView } from "@/components/PairingsView";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { fmtDateLabel } from "@/lib/data/labels";
import { toPublicPairings } from "@/lib/data/public";
import { fmtTime } from "@/lib/format";
import { useDesk } from "@/lib/store/desk-store";

/**
 * What players see. It reads the frozen published copy (through the public allow-list projection),
 * never the organizer's working board, and never a player or registration record.
 */
export default function PublicPairings() {
  const { published, tournament } = useDesk();

  if (!tournament) return <NeedsTournament what="The player view" />;

  const pairings = published
    ? toPublicPairings({
        published,
        tournamentName: tournament.name,
        dateLabel: fmtDateLabel(tournament.dates),
        startFormat: tournament.config.startFormat,
        firstTeeTime: tournament.config.firstTeeTime,
      })
    : null;

  return (
    <div className="public">
      <header className="public-head">
        <div className="flex flex-wrap items-center gap-3">
          <TeeLineLogo variant="reverse" width={172} />
          <span className="leading-tight">
            <b className="block font-display text-[13px] font-semibold">Club tournament pairings</b>
            <span className="text-xs text-on-forest-muted">Iloilo Golf &amp; Country Club</span>
          </span>
        </div>
        <p className="overline mt-3 !text-gold">
          {tournament.config.startFormat === "shotgun" ? "Shotgun start" : "Two-tee start"} ·{" "}
          {fmtTime(tournament.config.firstTeeTime)}
        </p>
        <h1 className="font-serif text-[28px] leading-8 font-semibold !text-on-forest sm:text-[44px] sm:leading-[48px]">
          {tournament.name}
        </h1>
        <p className="text-on-forest-muted">{fmtDateLabel(tournament.dates)}</p>
      </header>

      {!pairings ? (
        <div className="notice" role="status">
          <b>Pairings are not out yet.</b> Please check again later.
        </div>
      ) : (
        <PairingsView pairings={pairings} headingLevel="section" />
      )}

      <p className="hint no-print">
        This is a local demo preview, not a published page. It shows names, flight, hole and time
        only. <Link href="/">TeeLine Golf home</Link>
      </p>
    </div>
  );
}
