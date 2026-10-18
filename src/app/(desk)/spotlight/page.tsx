"use client";

import { Maximize2, MonitorPlay, Repeat } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PlayerSpotlight } from "@/components/spotlight/PlayerSpotlight";
import { Button } from "@/components/ui/button";
import { fmtIndex, initials } from "@/lib/format";
import { useDesk } from "@/lib/store/desk-store";
import { cn } from "@/lib/ui/cn";
import { useSpotlightData } from "@/lib/ui/spotlight";

/** Pick a player for the clubhouse display and preview the 16:9 card before it goes on screen. */
export default function SpotlightPicker() {
  const { draw, registrations } = useDesk();
  const ready = registrations.filter((r) => r.status === "ok");
  const [id, setId] = useState(ready[0]?.playerId ?? "");
  const [q, setQ] = useState("");
  const [slot, setSlot] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const d = useSpotlightData(id, slot ? "silhouette" : "none");
  const list = ready.filter((r) => r.playerName.toLowerCase().includes(q.trim().toLowerCase()));
  const suffix = slot ? "" : "?slot=none";

  return (
    <div className="stack">
      <header className="row between">
        <div className="stack tight">
          <p className="overline">Clubhouse display</p>
          <h1>Player spotlight</h1>
          <p className="muted">
            A full-screen 16:9 card for the clubhouse TV and announcements, built from the
            player&rsquo;s record only.
          </p>
        </div>
        <div className="row">
          <Button variant="secondary" asChild>
            <Link href={`/spotlight/rotate${suffix}`}>
              <Repeat aria-hidden="true" /> Rotate all
            </Link>
          </Button>
          <Button variant="gold" asChild>
            <Link href={`/spotlight/${id}${suffix}`} aria-disabled={!id}>
              <Maximize2 aria-hidden="true" /> Open full screen
            </Link>
          </Button>
        </div>
      </header>

      <div className="notice warn text-[13px]" role="note">
        <b>Check consent first.</b> Only put a player on a public screen if they agreed. Photos show
        only where photo consent is recorded; a separate display consent is not recorded yet.
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="well grid gap-3 p-3" aria-label="Players">
          <label className="field">
            <span className="sr">Find a player</span>
            <input
              type="search"
              placeholder="Find a player"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <ul className="plain max-h-[60vh] gap-1 overflow-x-hidden overflow-y-auto">
            {list.map((r) => (
              <li key={r.playerId}>
                <button
                  type="button"
                  aria-pressed={id === r.playerId}
                  onClick={() => setId(r.playerId)}
                  className={cn(
                    "flex h-[52px] w-full items-center gap-2.5 rounded-[10px] border px-2.5 text-left",
                    id === r.playerId
                      ? "border-fairway bg-fairway-soft"
                      : "border-transparent hover:bg-surface-raised",
                  )}
                >
                  <span className="avatar">{initials(r.playerName)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{r.playerName}</span>
                  <span className="text-[10px] font-bold tracking-[.06em] text-ink-muted">HI</span>
                  <b className="w-10 text-right tnum">{fmtIndex(r.index)}</b>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="hint p-2">No ready player matches.</li>}
          </ul>
        </section>

        <section aria-label="Preview" className="grid gap-3">
          <div className="row between">
            <label className="check text-sm">
              <input type="checkbox" checked={slot} onChange={(e) => setSlot(e.target.checked)} />
              Show the photo slot when there is no consented photo (previews only)
            </label>
            {!draw && <span className="hint">Make the draw to show tee time and pairing.</span>}
          </div>
          <div ref={box} className="min-w-0">
            {d ? (
              <PlayerSpotlight d={d} width={w} />
            ) : (
              <div className="card grid min-h-[300px] place-items-center text-center">
                <div className="grid justify-items-center gap-2">
                  <MonitorPlay className="size-6 text-ink-muted" aria-hidden="true" />
                  <p className="hint">Choose a player to preview.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
