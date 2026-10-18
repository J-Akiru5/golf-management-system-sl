/**
 * Poster artwork, drawn straight onto a canvas so the preview and the exported PNG are the same
 * pixels. The poster has its own palette: a dark one and a light one, both independent of the
 * site theme so a poster looks the same on any screen it is shared from.
 */
export type PosterLayout = "championship" | "card";
export type PosterTheme = "dark" | "light";

export interface PosterFact {
  label: string;
  value: string;
}

export interface PosterCrop {
  /** 1 = the photo just covers the frame. Larger zooms in. */
  zoom: number;
  /** -1 to 1. Pans along the spare width of the photo; 0 is centred. */
  x: number;
  /** -1 to 1. Pans along the spare height of the photo; 0 is centred. */
  y: number;
}

export interface PosterSpec {
  layout: PosterLayout;
  theme: PosterTheme;
  club: string;
  event: string;
  dateLabel: string;
  name: string;
  facts: PosterFact[];
  photo: CanvasImageSource | null;
  crop: PosterCrop;
}

export const POSTER_SIZE: Record<PosterLayout, { w: number; h: number }> = {
  championship: { w: 1080, h: 1350 },
  card: { w: 1080, h: 1080 },
};

export const POSTER_FONTS = {
  display: '"Manrope Variable", system-ui, sans-serif',
  body: '"Geist Variable", system-ui, sans-serif',
  mono: '"Manrope Variable", system-ui, sans-serif',
};

const PALETTE = {
  dark: {
    bgTop: "#171c19",
    bgBottom: "#0b2b23",
    ink: "#f7f5ee",
    muted: "#c5d3ca",
    accent: "#d7b568",
    frame: "#d7b568",
    placeholder: "#1d3428",
    stripe: "rgb(255 255 255 / 0.035)",
  },
  light: {
    bgTop: "#f7f5ee",
    bgBottom: "#efeee7",
    ink: "#073d2e",
    muted: "#626b64",
    accent: "#755719",
    frame: "#073d2e",
    placeholder: "#e3ebe3",
    stripe: "rgb(7 61 46 / 0.04)",
  },
} as const;

type Ctx = CanvasRenderingContext2D;

function setSpacing(ctx: Ctx, px: number) {
  // letterSpacing is not in every browser; the poster just looks slightly tighter without it.
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Shrinks the font until the text fits `maxW`, never below `minPx`. */
function fit(
  ctx: Ctx,
  text: string,
  font: (px: number) => string,
  startPx: number,
  maxW: number,
  minPx = 36,
) {
  let px = startPx;
  ctx.font = font(px);
  while (px > minPx && ctx.measureText(text).width > maxW) {
    px -= 2;
    ctx.font = font(px);
  }
  return px;
}

/** Where the photo lands inside its frame: cover-fit, then zoomed and panned. */
export function cropRect(
  imgW: number,
  imgH: number,
  frame: { x: number; y: number; w: number; h: number },
  crop: PosterCrop,
) {
  const zoom = Math.max(1, crop.zoom);
  const scale = Math.max(frame.w / imgW, frame.h / imgH) * zoom;
  const w = imgW * scale;
  const h = imgH * scale;
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const x = frame.x - (w - frame.w) / 2 + clamp(crop.x) * ((w - frame.w) / 2);
  const y = frame.y - (h - frame.h) / 2 + clamp(crop.y) * ((h - frame.h) / 2);
  return { x, y, w, h };
}

function drawPortrait(
  ctx: Ctx,
  spec: PosterSpec,
  frame: { x: number; y: number; w: number; h: number },
  radius: number,
) {
  const c = PALETTE[spec.theme];
  ctx.save();
  roundRect(ctx, frame.x, frame.y, frame.w, frame.h, radius);
  ctx.clip();
  ctx.fillStyle = c.placeholder;
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  const photo = spec.photo;
  if (photo) {
    const iw =
      "naturalWidth" in photo
        ? (photo as HTMLImageElement).naturalWidth
        : (photo as HTMLCanvasElement).width;
    const ih =
      "naturalHeight" in photo
        ? (photo as HTMLImageElement).naturalHeight
        : (photo as HTMLCanvasElement).height;
    const r = cropRect(iw, ih, frame, spec.crop);
    ctx.drawImage(photo, r.x, r.y, r.w, r.h);
  } else {
    const initials = spec.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
    ctx.fillStyle = c.accent;
    ctx.globalAlpha = 0.55;
    ctx.font = `600 ${Math.round(frame.h * 0.34)}px ${POSTER_FONTS.display}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials, frame.x + frame.w / 2, frame.y + frame.h / 2);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = c.frame;
  roundRect(ctx, frame.x, frame.y, frame.w, frame.h, radius);
  ctx.stroke();
}

function drawBackground(ctx: Ctx, spec: PosterSpec, w: number, h: number) {
  const c = PALETTE[spec.theme];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, c.bgTop);
  g.addColorStop(1, c.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Mowing stripes: faint diagonal bands, like a fairway seen from the air.
  ctx.save();
  ctx.fillStyle = c.stripe;
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.35);
  for (let x = -w; x < w; x += 140) ctx.fillRect(x, -h, 70, h * 2);
  ctx.restore();
}

function header(ctx: Ctx, spec: PosterSpec, w: number, y: number) {
  const c = PALETTE[spec.theme];
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = c.accent;
  ctx.font = `700 26px ${POSTER_FONTS.body}`;
  setSpacing(ctx, 7);
  ctx.fillText(spec.club.toUpperCase(), w / 2, y);
  setSpacing(ctx, 0);
  const px = fit(ctx, spec.event, (p) => `600 ${p}px ${POSTER_FONTS.display}`, 74, w - 160, 40);
  ctx.fillStyle = c.ink;
  ctx.font = `600 ${px}px ${POSTER_FONTS.display}`;
  ctx.fillText(spec.event, w / 2, y + 30 + px * 0.9);
  ctx.fillStyle = c.muted;
  ctx.font = `400 28px ${POSTER_FONTS.body}`;
  ctx.fillText(spec.dateLabel, w / 2, y + 30 + px * 0.9 + 46);
}

function factCells(
  ctx: Ctx,
  spec: PosterSpec,
  area: { x: number; y: number; w: number },
  vertical: boolean,
) {
  const c = PALETTE[spec.theme];
  const facts = spec.facts.slice(0, 3);
  if (facts.length === 0) return;
  const cell = vertical ? area.w : area.w / facts.length;
  facts.forEach((f, i) => {
    const cx = vertical ? area.x : area.x + cell * i + cell / 2;
    const cy = vertical ? area.y + i * 150 : area.y;
    ctx.textAlign = vertical ? "left" : "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = c.ink;
    const px = fit(ctx, f.value, (p) => `600 ${p}px ${POSTER_FONTS.mono}`, 54, cell - 24, 28);
    ctx.font = `600 ${px}px ${POSTER_FONTS.mono}`;
    ctx.fillText(f.value, cx, cy);
    ctx.fillStyle = c.muted;
    ctx.font = `700 21px ${POSTER_FONTS.body}`;
    setSpacing(ctx, 3);
    ctx.fillText(f.label.toUpperCase(), cx, cy + 34);
    setSpacing(ctx, 0);
  });
}

function championship(ctx: Ctx, spec: PosterSpec) {
  const { w, h } = POSTER_SIZE.championship;
  const c = PALETTE[spec.theme];
  drawBackground(ctx, spec, w, h);
  header(ctx, spec, w, 96);

  ctx.fillStyle = c.accent;
  ctx.fillRect(w / 2 - 60, 262, 120, 4);

  const side = 600;
  drawPortrait(ctx, spec, { x: (w - side) / 2, y: 304, w: side, h: side }, 28);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const px = fit(ctx, spec.name, (p) => `600 ${p}px ${POSTER_FONTS.display}`, 88, w - 120, 44);
  ctx.fillStyle = c.ink;
  ctx.font = `600 ${px}px ${POSTER_FONTS.display}`;
  ctx.fillText(spec.name, w / 2, 1010);

  factCells(ctx, spec, { x: 90, y: 1128, w: w - 180 }, false);

  ctx.fillStyle = c.accent;
  ctx.fillRect(0, h - 14, w, 14);
}

function card(ctx: Ctx, spec: PosterSpec) {
  const { w, h } = POSTER_SIZE.card;
  const c = PALETTE[spec.theme];
  drawBackground(ctx, spec, w, h);
  header(ctx, spec, w, 90);

  drawPortrait(ctx, spec, { x: 70, y: 290, w: 440, h: 700 }, 24);

  const x = 570;
  const words = spec.name.split(/\s+/).filter(Boolean);
  const last = words.length > 1 ? (words.pop() as string) : "";
  const first = words.join(" ");
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  if (last) {
    ctx.fillStyle = c.muted;
    const fp = fit(ctx, first, (p) => `400 ${p}px ${POSTER_FONTS.display}`, 48, w - x - 70, 28);
    ctx.font = `400 ${fp}px ${POSTER_FONTS.display}`;
    ctx.fillText(first, x, 350);
  }
  ctx.fillStyle = c.ink;
  const lp = fit(
    ctx,
    last || first,
    (p) => `600 ${p}px ${POSTER_FONTS.display}`,
    84,
    w - x - 70,
    40,
  );
  ctx.font = `600 ${lp}px ${POSTER_FONTS.display}`;
  ctx.fillText(last || first, x, 350 + lp * 0.95);

  ctx.fillStyle = c.accent;
  ctx.fillRect(x, 480, 90, 4);
  factCells(ctx, spec, { x, y: 590, w: w - x - 70 }, true);

  ctx.fillStyle = c.accent;
  ctx.fillRect(0, h - 14, w, 14);
}

export function drawPoster(canvas: HTMLCanvasElement, spec: PosterSpec) {
  const { w, h } = POSTER_SIZE[spec.layout];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  if (spec.layout === "championship") championship(ctx, spec);
  else card(ctx, spec);
}
