"use client";

import { Download, Moon, RectangleVertical, Share2, Square, Sun } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  drawPoster,
  POSTER_FONTS,
  type PosterCrop,
  type PosterFact,
  type PosterLayout,
  type PosterTheme,
} from "@/lib/poster/draw";
import { cn } from "@/lib/ui/cn";

export interface PosterFactOption extends PosterFact {
  id: string;
}

const LAYOUTS: { id: PosterLayout; label: string; note: string }[] = [
  { id: "championship", label: "Championship", note: "Tall, for announcements" },
  { id: "card", label: "Player card", note: "Square, for feeds and rosters" },
];

async function loadFonts() {
  if (!("fonts" in document)) return;
  await Promise.all([
    document.fonts.load(`600 80px ${POSTER_FONTS.display}`),
    document.fonts.load(`400 40px ${POSTER_FONTS.display}`),
    document.fonts.load(`700 24px ${POSTER_FONTS.body}`),
    document.fonts.load(`400 24px ${POSTER_FONTS.body}`),
    document.fonts.load(`600 50px ${POSTER_FONTS.mono}`),
  ]).catch(() => undefined);
}

/**
 * Builds a poster from a player's real record. Only facts that exist are offered; nothing is
 * invented. The picture, layout and theme are the organizer's choice; the content is the data.
 */
export function PosterStudio({
  playerName,
  photo,
  club,
  event,
  dateLabel,
  options,
}: {
  playerName: string;
  /** Only set when the player agreed to their photo being used. */
  photo: string | undefined;
  club: string;
  event: string;
  dateLabel: string;
  options: PosterFactOption[];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [layout, setLayout] = useState<PosterLayout>("championship");
  const [theme, setTheme] = useState<PosterTheme>("dark");
  const [crop, setCrop] = useState<PosterCrop>({ zoom: 1, x: 0, y: 0 });
  const [chosen, setChosen] = useState<string[]>(() => options.slice(0, 3).map((o) => o.id));
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    loadFonts().then(() => live && setFontsReady(true));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.canShare === "function");
  }, []);

  useEffect(() => {
    if (!photo) return setImg(null);
    let live = true;
    const i = new Image();
    i.onload = () => live && setImg(i);
    i.onerror = () => live && setImg(null);
    i.src = photo;
    return () => {
      live = false;
    };
  }, [photo]);

  const facts = useMemo(
    () => options.filter((o) => chosen.includes(o.id)).slice(0, 3),
    [options, chosen],
  );

  useEffect(() => {
    if (!canvas.current || !fontsReady) return;
    drawPoster(canvas.current, {
      layout,
      theme,
      club,
      event,
      dateLabel,
      name: playerName,
      facts,
      photo: img,
      crop,
    });
  }, [fontsReady, layout, theme, club, event, dateLabel, playerName, facts, img, crop]);

  const fileName = `${playerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-${layout}.png`;
  const toBlob = () =>
    new Promise<Blob | null>((ok) => {
      if (canvas.current) canvas.current.toBlob(ok, "image/png");
      else ok(null);
    });

  async function download() {
    setBusy(true);
    const blob = await toBlob();
    setBusy(false);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    // Some browsers ignore a click on a link that is not in the page.
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function share() {
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], fileName, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator
        .share({ files: [file], title: `${playerName} · ${event}` })
        .catch(() => undefined);
    }
  }

  const toggle = (id: string) =>
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="grid gap-2 rounded-[20px] bg-surface-sunken p-3 sm:p-4">
        <canvas
          ref={canvas}
          role="img"
          className="block h-auto w-full rounded-[14px] border border-line shadow-lift"
          aria-label={`Poster preview for ${playerName}${facts.length ? `: ${facts.map((f) => `${f.label} ${f.value}`).join(", ")}` : ""}`}
        />
        {!fontsReady && <p className="muted text-center text-[13px]">Getting fonts ready…</p>}
      </div>

      <div className="card grid gap-5 sm:p-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset className="grid gap-2">
            <legend className="overline mb-2">Layout</legend>
            <div className="grid gap-2">
              {LAYOUTS.map((l) => (
                <Choice
                  key={l.id}
                  on={layout === l.id}
                  onClick={() => setLayout(l.id)}
                  icon={l.id === "championship" ? <RectangleVertical /> : <Square />}
                  label={l.label}
                  note={l.note}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="overline mb-2">Look</legend>
            <div className="grid gap-2">
              {(["dark", "light"] as const).map((t) => (
                <Choice
                  key={t}
                  on={theme === t}
                  onClick={() => setTheme(t)}
                  icon={t === "dark" ? <Moon /> : <Sun />}
                  label={t === "dark" ? "Dark poster" : "Light poster"}
                />
              ))}
            </div>
          </fieldset>
        </div>

        <fieldset className="grid gap-2 border-t border-line pt-4">
          <legend className="overline float-left mb-2 w-full">Show on the poster (up to 3)</legend>
          {options.length === 0 ? (
            <p className="muted">
              No handicap or category on file, so there is nothing to show yet.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((o) => {
                const on = chosen.includes(o.id);
                const full = !on && chosen.length >= 3;
                return (
                  <label
                    key={o.id}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 py-2 text-[14px] transition-colors",
                      on ? "border-fairway bg-fairway-soft" : "border-line hover:bg-surface-sunken",
                      full && "cursor-not-allowed opacity-55",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={full}
                      onChange={() => toggle(o.id)}
                    />
                    <span className="min-w-0">
                      {o.label}: <b>{o.value}</b>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        <fieldset className="grid gap-1 border-t border-line pt-4" disabled={!photo}>
          <legend className="overline float-left mb-2 w-full">Photo position</legend>
          {!photo && (
            <p className="hint mb-1">
              No photo is on file with the player’s agreement, so the poster shows their initials.
              Add one above.
            </p>
          )}
          <label className="field">
            <span>Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={crop.zoom}
              onChange={(e) => setCrop({ ...crop, zoom: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Move left or right</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.02}
              value={crop.x}
              onChange={(e) => setCrop({ ...crop, x: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Move up or down</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.02}
              value={crop.y}
              onChange={(e) => setCrop({ ...crop, y: Number(e.target.value) })}
            />
          </label>
        </fieldset>

        <div className="grid gap-2 border-t border-line pt-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="gold" disabled={!fontsReady || busy} onClick={download}>
              <Download aria-hidden="true" />
              Download PNG
            </Button>
            {canShare && (
              <Button variant="secondary" disabled={!fontsReady} onClick={share}>
                <Share2 aria-hidden="true" />
                Share
              </Button>
            )}
          </div>
          <p className="hint">
            A poster shows a player’s name and handicap. Share it only with their agreement.
          </p>
        </div>
      </div>
    </div>
  );
}

function Choice({
  on,
  onClick,
  icon,
  label,
  note,
}: {
  on: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  note?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex min-h-11 items-center gap-2.5 rounded-[10px] border px-3 py-2 text-left transition-colors [&_svg]:size-4 [&_svg]:shrink-0",
        on
          ? "border-fairway bg-fairway-soft text-ink"
          : "border-line bg-surface-raised text-ink hover:bg-surface-sunken",
      )}
    >
      <span className={on ? "text-fairway" : "text-ink-muted"} aria-hidden="true">
        {icon}
      </span>
      <span className="grid min-w-0">
        <span className={cn("text-[14px]", on && "font-semibold")}>{label}</span>
        {note && <span className="text-xs text-ink-muted">{note}</span>}
      </span>
    </button>
  );
}
