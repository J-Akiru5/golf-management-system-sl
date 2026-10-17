"use client";

import { ImageOff, Info } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type Anchor, HOLE_ART, type HoleView as View } from "@/lib/course/layout";
import { fmtHcp, fmtIndex, fmtTime, initials } from "@/lib/format";
import { useBoard } from "@/lib/ui/board";
import { cn } from "@/lib/ui/cn";

/** Pill label on the picture, sized in the picture's own pixels (the files were drawn at 2560 wide). */
function Chip({ x, y, text, k }: { x: number; y: number; text: string; k: number }) {
  const w = (text.length * 12.4 + 44) * k;
  const h = 46 * k;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={h / 2}
        fill="rgba(20,40,18,0.62)"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={1.5 * k}
      />
      <text
        x="0"
        y={8 * k}
        textAnchor="middle"
        fontFamily="Geist Variable, system-ui, sans-serif"
        fontSize={24 * k}
        fontWeight="600"
        fill="#fff"
      >
        {text}
      </text>
    </g>
  );
}

/** Shot line, tee ring, yardage markers and pin, drawn from the anchors exported with the picture. */
function Overlay({ v }: { v: View }) {
  const W = v.width;
  const H = v.height;
  // Marks are sized for a picture shown roughly 900px wide, so they stay legible.
  const k = W / 1500;
  const px = (a: Anchor) => [a.x * W, a.y * H] as const;
  const line = v.centerline
    .map((a, i) => `${i ? "L" : "M"}${(a.x * W).toFixed(1)} ${(a.y * H).toFixed(1)}`)
    .join(" ");
  const [tx, ty] = px(v.tee);
  const [pinX, pinY] = px(v.pin);
  const markers = ["200", "150", "100"]
    .map((m) => ({ m, a: v.markers[m] }))
    .filter((x): x is { m: string; a: Anchor } => !!x.a && x.a.onScreen !== false);
  const top = v.id === "overview";
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="pointer-events-none absolute inset-0 size-full"
      role="img"
      aria-label={`Shot line, par ${v.par}, ${v.totalYards} yards; markers at ${markers.map((m) => `${m.a.yardsToPin} yards to the pin`).join(", ")}`}
    >
      <path
        d={line}
        fill="none"
        stroke="rgba(0,0,0,0.25)"
        strokeWidth={9 * k}
        strokeLinecap="round"
        strokeDasharray={`0 ${22 * k}`}
      />
      <path
        d={line}
        fill="none"
        stroke="#fff"
        strokeWidth={6 * k}
        strokeLinecap="round"
        strokeDasharray={`0 ${22 * k}`}
      />
      <circle cx={tx} cy={ty} r={16 * k} fill="none" stroke="#fff" strokeWidth={4 * k} />
      <circle cx={tx} cy={ty} r={7 * k} fill="#fff" stroke="rgba(0,0,0,0.25)" strokeWidth={2 * k} />
      {markers.map(({ m, a }) => (
        <circle
          key={m}
          cx={a.x * W}
          cy={a.y * H}
          r={8 * k}
          fill="#fff"
          stroke="rgba(0,0,0,0.25)"
          strokeWidth={2 * k}
        />
      ))}
      {top && v.landingZone.yardsFromTee !== undefined && (
        <Chip
          k={k}
          x={v.landingZone.x * W - 100 * k}
          y={v.landingZone.y * H - 34 * k}
          text={`${v.landingZone.yardsFromTee} yds`}
        />
      )}
      {markers
        .filter(({ m }) => (top ? m !== "200" : m === "100"))
        .map(({ m, a }) => (
          <Chip key={m} k={k} x={a.x * W} y={a.y * H - 38 * k} text={`${m} to pin`} />
        ))}
      <circle cx={pinX} cy={pinY} r={10 * k} fill="#F5C518" stroke="#fff" strokeWidth={3 * k} />
      {top ? (
        <Chip k={k} x={tx} y={ty + 74 * k} text={`Par ${v.par} · ${v.totalYards} yds`} />
      ) : (
        <Chip k={k} x={pinX} y={pinY - 92 * k} text={`Pin · ${v.totalYards} yds`} />
      )}
    </svg>
  );
}

export function HoleView({ hole: initial }: { hole: number }) {
  const b = useBoard();
  const { state, playerById, regById, names } = b;
  const shotgun = state.config.startFormat === "shotgun";
  const [hole, setHole] = useState(Math.min(18, Math.max(1, initial || 1)));
  const art = HOLE_ART[hole];
  const [viewId, setViewId] = useState<View["id"]>("overview");
  const view = art?.find((v) => v.id === viewId) ?? art?.[0];
  const groups = (state.draw ?? []).filter((g) => g.startHole === hole);

  return (
    <div className="stack">
      <header className="row between">
        <div className="stack tight">
          <p className="overline">Course &amp; holes</p>
          <h1>Hole {hole}</h1>
          <p className="muted">
            {view
              ? `Illustration · par ${view.par} · ${view.totalYards} yds as drawn`
              : "No course picture for this hole yet"}
          </p>
        </div>
        <nav aria-label="Holes" className="flex flex-wrap gap-1.5">
          {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => {
            const has = (state.draw ?? []).some((g) => g.startHole === n);
            return (
              <button
                key={n}
                type="button"
                aria-pressed={hole === n}
                aria-label={`Hole ${n}${HOLE_ART[n] ? ", has course picture" : ""}`}
                onClick={() => setHole(n)}
                className={cn(
                  "relative grid size-9 place-items-center rounded-full border font-display text-xs font-extrabold tnum transition-colors",
                  hole === n
                    ? "border-gold bg-gold text-on-gold"
                    : "border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken",
                )}
              >
                {n}
                {has && hole !== n && (
                  <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-fairway" />
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="notice flex items-start gap-2.5" role="note">
        <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
        <p className="text-[13px]">
          These pictures are a rendered illustration, not Iloilo Golf &amp; Country Club’s real hole
          1. Yardages come from the illustration. Real hole pictures and positions come from the
          club; until then, use them to check the layout only.
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-label="Hole picture" className="min-w-0">
          {view && art ? (
            <>
              <div className="tabs mb-3 max-w-[360px]" role="tablist" aria-label="View">
                {art.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="tab"
                    aria-selected={v.id === view.id}
                    onClick={() => setViewId(v.id)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <div
                className="relative overflow-hidden rounded-[20px] border border-line shadow-card"
                style={{ aspectRatio: `${view.width} / ${view.height}` }}
              >
                <Image
                  src={view.image}
                  alt={`${view.label} of hole ${hole} (illustration)`}
                  fill
                  sizes="(min-width: 1280px) 900px, 100vw"
                  className="object-cover"
                  priority
                />
                <Overlay v={view} />
              </div>
            </>
          ) : (
            <div className="card grid min-h-[320px] place-items-center text-center">
              <div className="grid justify-items-center gap-2">
                <ImageOff className="size-6 text-ink-muted" aria-hidden="true" />
                <h2>No picture for hole {hole}</h2>
                <p className="hint max-w-sm">
                  Add a drone photo or the club’s hole layout with its anchor file to show the shot
                  line and yardage markers here.
                </p>
              </div>
            </div>
          )}
        </section>

        <aside className="stack" style={{ gap: 16 }}>
          <section className="card" aria-labelledby="starts-h">
            <h2 id="starts-h" className="mb-1">
              Starting on hole {hole}
            </h2>
            <p className="hint mb-3">
              {state.draw
                ? `${groups.length} group${groups.length === 1 ? "" : "s"} · ${shotgun ? "shotgun" : "two-tee"} start`
                : "No draw yet"}
            </p>
            {!state.draw ? (
              <Button variant="primary" asChild>
                <Link href="/draw">Go to the draw</Link>
              </Button>
            ) : groups.length === 0 ? (
              <p className="hint">No group starts here.</p>
            ) : (
              <div className="grid gap-3">
                {groups.map((g) => (
                  <article key={g.number} className="rounded-[14px] border border-line">
                    <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
                      <span className="hole !size-8 !text-[11px]">
                        {g.startHole}
                        {g.wave ?? ""}
                      </span>
                      <div className="min-w-0 flex-1">
                        <b className="block text-sm">
                          {fmtTime(g.time)} · {names.flight(g.flightId)}
                        </b>
                        <span className="hint">Group {g.number}</span>
                      </div>
                      {g.locked && <span className="pill gold">Locked</span>}
                    </div>
                    <ul className="plain">
                      {g.playerIds.map((id) => {
                        const p = playerById.get(id);
                        const r = regById.get(id);
                        if (!p) return null;
                        return (
                          <li
                            key={id}
                            className="flex items-center gap-2.5 border-b border-line px-3 py-2 text-sm last:border-b-0"
                          >
                            <span className="avatar !size-7 !text-[10px]">{initials(p.name)}</span>
                            <Link
                              href={`/players/${id}`}
                              className="min-w-0 flex-1 truncate text-ink no-underline hover:underline"
                            >
                              {p.name}
                            </Link>
                            <span className="text-[10px] font-bold tracking-[.06em] text-ink-muted">
                              HI
                            </span>
                            <b className="w-9 text-right tnum">{fmtIndex(p.index)}</b>
                            <span className="text-[10px] font-bold tracking-[.06em] text-ink-muted">
                              PH
                            </span>
                            <b className="w-6 text-right tnum">
                              {fmtHcp(r?.playingHandicap ?? null)}
                            </b>
                          </li>
                        );
                      })}
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
