"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { fmtTime } from "@/lib/format";
import { useDesk } from "@/lib/store/desk-store";

/** Player-facing pairings: names, flight, hole and time only. No handicaps, ages or photos. */
export default function PublicPairings() {
  const { state, playerById, names } = useDesk();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shotgun = state.config.startFormat === "shotgun";

  const groups = (state.draw ?? []).filter(
    (g) => !q || g.playerIds.some((id) => playerById.get(id)?.name.toLowerCase().includes(q)),
  );

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

      {!state.published ? (
        <div className="notice" role="status">
          <b>Pairings are not out yet.</b> Please check again later.
        </div>
      ) : (
        <>
          <div className="row no-print">
            <input
              type="search"
              className="grow"
              placeholder="Find your name"
              aria-label="Find your name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="button" className="btn ghost" onClick={() => window.print()}>
              Print
            </button>
          </div>
          <div className="groups">
            {groups.map((g) => (
              <article key={g.number} className="group">
                <div className="group-head">
                  <b>
                    {shotgun
                      ? `Hole ${g.startHole}${g.wave ? ` · Wave ${g.wave}` : ""}`
                      : `Tee ${g.startHole}`}
                  </b>
                  <span className="mono">{fmtTime(g.time)}</span>
                </div>
                {g.playerIds.map((id) => {
                  const name = playerById.get(id)?.name ?? "";
                  const hit = q && name.toLowerCase().includes(q);
                  return (
                    <div
                      key={id}
                      className="slot"
                      style={hit ? { background: "var(--brass-soft)", fontWeight: 700 } : undefined}
                    >
                      {name}
                    </div>
                  );
                })}
                <div className="slot muted">{names.flight(g.flightId)}</div>
              </article>
            ))}
          </div>
          {groups.length === 0 && <p className="muted">No one found with that name.</p>}
        </>
      )}
      <p className="muted no-print">
        <Link href="/">Back to the organizer desk</Link> (demo only)
      </p>
    </div>
  );
}
