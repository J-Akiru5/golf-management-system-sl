"use client";

import { useState } from "react";
import { fmtTime } from "@/lib/format";
import type { Published } from "@/lib/store/desk-store";

/**
 * Player-facing pairings: names, flight, hole and time only. No handicaps, ages or photos.
 * Used by the public page and by the organizer's publish preview, so what they check is what
 * players get.
 */
export function PairingsView({
  published,
  shotgun,
  searchable = true,
}: {
  published: Published;
  shotgun: boolean;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = published.groups.filter(
    (g) => !q || g.players.some((name) => name.toLowerCase().includes(q)),
  );

  return (
    <>
      {searchable && (
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
      )}
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
            {g.players.map((name) => {
              const hit = q && name.toLowerCase().includes(q);
              return (
                <div key={name} className={`slot${hit ? " hit" : ""}`}>
                  {name}
                </div>
              );
            })}
            <div className="slot muted">{g.flight}</div>
          </article>
        ))}
      </div>
      {groups.length === 0 && <p className="muted">No one found with that name.</p>}
    </>
  );
}
