"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { PairingsView } from "@/components/PairingsView";
import { useDesk } from "@/lib/store/desk-store";

/** What players see. It reads the frozen published copy, never the organizer's working board. */
export default function PublicPairings() {
  const { state } = useDesk();
  const { published } = state;

  return (
    <div className="public">
      <header className="public-head">
        <div className="row">
          <Logo size={36} />
          <span className="brand-name">Starter</span>
        </div>
        <h1>{state.name}</h1>
        <p>
          {new Date(`${state.config.date}T00:00:00`).toLocaleDateString("en-PH", {
            dateStyle: "full",
          })}
          {" · Iloilo Golf & Country Club"}
        </p>
      </header>

      {!published ? (
        <div className="notice" role="status">
          <b>Pairings are not out yet.</b> Please check again later.
        </div>
      ) : (
        <PairingsView published={published} shotgun={state.config.startFormat === "shotgun"} />
      )}
      <p className="muted no-print">
        <Link href="/">Back to the organizer desk</Link> (demo only)
      </p>
    </div>
  );
}
