"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  drawPoster,
  POSTER_FONTS,
  type PosterCrop,
  type PosterFact,
  type PosterLayout,
  type PosterTheme,
} from "@/lib/poster/draw";

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
    <div className="studio">
      <div className="studio-preview">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Poster preview for ${playerName}${facts.length ? `: ${facts.map((f) => `${f.label} ${f.value}`).join(", ")}` : ""}`}
        />
        {!fontsReady && <p className="muted">Getting fonts ready…</p>}
      </div>

      <div className="stack studio-controls">
        <fieldset className="stack tight">
          <legend>Layout</legend>
          <div className="chips">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                type="button"
                className="chip"
                aria-pressed={layout === l.id}
                title={l.note}
                onClick={() => setLayout(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="stack tight">
          <legend>Look</legend>
          <div className="chips">
            {(["dark", "light"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className="chip"
                aria-pressed={theme === t}
                onClick={() => setTheme(t)}
              >
                {t === "dark" ? "Dark poster" : "Light poster"}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="stack tight">
          <legend>Show on the poster (up to 3)</legend>
          {options.length === 0 ? (
            <p className="muted">
              No handicap or category on file, so there is nothing to show yet.
            </p>
          ) : (
            options.map((o) => {
              const on = chosen.includes(o.id);
              const full = !on && chosen.length >= 3;
              return (
                <label key={o.id} className="check">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={full}
                    onChange={() => toggle(o.id)}
                  />
                  <span>
                    {o.label}: <b>{o.value}</b>
                  </span>
                </label>
              );
            })
          )}
        </fieldset>

        <fieldset className="stack tight" disabled={!photo}>
          <legend>Photo position</legend>
          {!photo && (
            <p className="hint">
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

        <div className="row">
          <button
            type="button"
            className="btn gold"
            disabled={!fontsReady || busy}
            onClick={download}
          >
            Download PNG
          </button>
          {canShare && (
            <button type="button" className="btn ghost" disabled={!fontsReady} onClick={share}>
              Share
            </button>
          )}
        </div>
        <p className="hint">
          A poster shows a player’s name and handicap. Share it only with their agreement.
        </p>
      </div>
    </div>
  );
}
