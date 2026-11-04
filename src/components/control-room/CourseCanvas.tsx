"use client";

import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MAP_H, MAP_HOLES, MAP_W } from "@/lib/course/layout";
import type { Pan } from "@/lib/ui/map-pan";

export interface Cover {
  /** Scale from map units to CSS pixels. */
  s: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
}

/** Scales the MAP_W × MAP_H design space to cover the element, like object-fit: cover. */
export function useCover(ref: RefObject<HTMLElement | null>): Cover | null {
  const [cover, setCover] = useState<Cover | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const s = Math.max(w / MAP_W, h / MAP_H);
      setCover({ s, ox: (w - MAP_W * s) / 2, oy: (h - MAP_H * s) / 2, w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return cover;
}

// Small seeded generator so the illustration is the same on every load.
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return (a - 1) / 2147483646;
  };
}

const TONES = ["#173a24", "#1d4a2c", "#245632", "#2d6338", "#1a4128", "#33703e"];

/**
 * Canopy painted around the map, in map units, so a drag can reach holes that sit behind the
 * bottom row without ever exposing a bare edge.
 */
export const MAP_MARGIN = 220;

function paint(ctx: CanvasRenderingContext2D) {
  const rnd = rng(7);
  const w = MAP_W + 2 * MAP_MARGIN;
  const h = MAP_H + 2 * MAP_MARGIN;
  ctx.fillStyle = "#1a3a26";
  ctx.fillRect(-MAP_MARGIN, -MAP_MARGIN, w, h);

  // Water, top left.
  const lake = new Path2D("M0 0 H260 C300 60 250 130 180 150 C110 170 60 230 0 250 Z");
  ctx.fillStyle = "#1f4d5e";
  ctx.fill(lake);
  ctx.strokeStyle = "rgba(91,140,122,.5)";
  ctx.lineWidth = 3;
  ctx.stroke(lake);

  // Tree canopy, over the map and its margin at the same density.
  const trees = Math.round(2600 * ((w * h) / (MAP_W * MAP_H)));
  for (let i = 0; i < trees; i++) {
    const x = -MAP_MARGIN + rnd() * w;
    const y = -MAP_MARGIN + rnd() * h;
    const r = 5 + rnd() * 11;
    const tone = TONES[Math.floor(rnd() * TONES.length)] ?? "#1d4a2c";
    const alpha = 0.75 + rnd() * 0.25;
    if (x >= 0 && x < 260 && y < 150 - x / 3) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Fairways: rough edge, fairway, mowing stripes.
  ctx.lineCap = "round";
  const path = (h: (typeof MAP_HOLES)[number]) => {
    const p = new Path2D();
    p.moveTo(h.tee[0], h.tee[1]);
    p.quadraticCurveTo(h.bend[0], h.bend[1], h.green[0], h.green[1]);
    return p;
  };
  for (const h of MAP_HOLES) {
    const p = path(h);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = "#4f8a45";
    ctx.lineWidth = 46;
    ctx.stroke(p);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#6fa85a";
    ctx.lineWidth = 32;
    ctx.stroke(p);
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([12, 12]);
    ctx.lineCap = "butt";
    ctx.strokeStyle = "#7db866";
    ctx.stroke(p);
    ctx.restore();
  }

  // Greens with flags, and tees.
  for (const h of MAP_HOLES) {
    const [gx, gy] = h.green;
    ctx.fillStyle = "#5d9a4e";
    ctx.beginPath();
    ctx.ellipse(gx, gy, 24, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8cc56c";
    ctx.beginPath();
    ctx.ellipse(gx, gy, 18, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f7f5ee";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx, gy - 22);
    ctx.stroke();
    ctx.fillStyle = "#f7f5ee";
    ctx.beginPath();
    ctx.moveTo(gx, gy - 22);
    ctx.lineTo(gx + 12, gy - 18);
    ctx.lineTo(gx, gy - 14);
    ctx.fill();

    const [tx, ty] = h.tee;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(Math.atan2(h.bend[1] - ty, h.bend[0] - tx));
    ctx.fillStyle = "#8cc56c";
    ctx.beginPath();
    ctx.roundRect(-10, -7, 20, 14, 4);
    ctx.fill();
    ctx.restore();
  }

  // Bunkers beside a few greens.
  ctx.fillStyle = "#e7d9ad";
  ctx.strokeStyle = "#c8b783";
  ctx.lineWidth = 2;
  for (const [i, dx, dy, rot] of [
    [2, -26, 14, -0.3],
    [4, 22, -16, 0.2],
    [6, -24, -10, -0.5],
    [9, 26, 12, 0.3],
    [11, -22, 16, -0.2],
    [14, 24, -12, 0.4],
    [17, -26, -8, -0.3],
  ] as const) {
    const h = MAP_HOLES[i];
    if (!h) continue;
    ctx.save();
    ctx.translate(h.green[0] + dx, h.green[1] + dy);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Cart path along the routing.
  ctx.save();
  ctx.strokeStyle = "rgba(205,191,149,.7)";
  ctx.lineWidth = 3;
  ctx.setLineDash([2, 7]);
  ctx.beginPath();
  MAP_HOLES.forEach((h, i) => {
    const x = h.tee[0] + 30;
    const y = h.tee[1] + 6;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}

/**
 * The illustrated course drawn on a canvas, covering its parent. A placeholder until the club
 * supplies a drone photo or its hole layout; the darkening vignettes are part of the contract
 * (glass panels need a dark ground to keep text contrast).
 *
 * The canvas is painted at the map's own size and then slid by `pan`, which is how the organizer
 * brings holes that sit behind the bottom row into reach. Painting at viewport size would leave a
 * bare edge the moment it moved, so the extra paint is what makes the drag possible. The vignettes
 * stay put: they keep text legible and must line up with the panels, not with the map.
 */
export function CourseCanvas({
  cover,
  pan,
  zoom,
}: {
  cover: Cover | null;
  pan: Pan;
  zoom: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !cover) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round((MAP_W + 2 * MAP_MARGIN) * cover.s * dpr);
    c.height = Math.round((MAP_H + 2 * MAP_MARGIN) * cover.s * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const offset = MAP_MARGIN * cover.s * dpr;
    ctx.setTransform(cover.s * dpr, 0, 0, cover.s * dpr, offset, offset);
    paint(ctx);
  }, [cover]);

  return (
    <>
      <div
        aria-hidden="true"
        data-pan-surface=""
        className="absolute inset-0 cursor-grab will-change-transform active:cursor-grabbing"
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: "center",
        }}
      >
        <canvas
          ref={ref}
          className="absolute"
          style={{
            left: (cover?.ox ?? 0) - (cover?.s ?? 0) * MAP_MARGIN,
            top: (cover?.oy ?? 0) - (cover?.s ?? 0) * MAP_MARGIN,
            width: (cover?.s ?? 0) * MAP_W + 2 * (cover?.s ?? 0) * MAP_MARGIN,
            height: (cover?.s ?? 0) * MAP_H + 2 * (cover?.s ?? 0) * MAP_MARGIN,
          }}
        />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg,rgba(12,18,15,.55) 0,rgba(12,18,15,0) 22%,rgba(12,18,15,0) 62%,rgba(12,18,15,.7) 74%),linear-gradient(0deg,rgba(12,18,15,.85) 0,rgba(12,18,15,0) 42%),linear-gradient(180deg,rgba(12,18,15,.6) 0,rgba(12,18,15,0) 18%)",
        }}
      />
    </>
  );
}
