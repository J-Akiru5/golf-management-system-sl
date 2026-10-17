"use client";

import Link from "next/link";
import { Crest } from "@/components/Crest";
import { PairingsView } from "@/components/PairingsView";
import { fmtTime } from "@/lib/format";
import { useDesk } from "@/lib/store/desk-store";

/** What players see. It reads the frozen published copy, never the organizer's working board. */
export default function PublicPairings() {
  const { state } = useDesk();
  const { published, config } = state;

  return (
    <div className="public">
      <header className="public-head">
        <div className="flex items-center gap-3">
          <Crest size={48} />
          <span className="leading-tight">
            <b className="block font-display text-[15px] font-extrabold">
              Iloilo Golf &amp; Country Club
            </b>
            <span className="text-xs text-on-forest-muted">Est. 1907 · Sta. Barbara, Iloilo</span>
          </span>
        </div>
        <p className="overline mt-3 !text-gold">
          {config.startFormat === "shotgun" ? "Shotgun start" : "Two-tee start"} ·{" "}
          {fmtTime(config.firstTeeTime)}
        </p>
        <h1 className="font-serif text-[28px] leading-8 font-semibold !text-on-forest sm:text-[44px] sm:leading-[48px]">
          {state.name}
        </h1>
        <p className="text-on-forest-muted">
          {new Date(`${config.date}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "full" })}
        </p>
      </header>

      {!published ? (
        <div className="notice" role="status">
          <b>Pairings are not out yet.</b> Please check again later.
        </div>
      ) : (
        <PairingsView published={published} shotgun={config.startFormat === "shotgun"} />
      )}
      <p className="hint no-print">
        <Link href="/">Back to the tournament office</Link> (demo only)
      </p>
    </div>
  );
}
