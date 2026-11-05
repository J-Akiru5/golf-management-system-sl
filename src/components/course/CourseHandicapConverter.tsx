"use client";

import { useState } from "react";
import { courseHandicap, playingHandicap, rawCourseHandicap, type Tee } from "@/lib/routing";

const INDEX_MIN = -10;
const INDEX_MAX = 54;

/**
 * Reads a course handicap off a tee's numbers, the way the club's printed tables do.
 *
 * The tables are the WHS formula rounded half up, so this converter is the same sum the draw and the
 * scoring use. It is here so the desk can answer "what does this index play off?" without a sheet.
 */
export function CourseHandicapConverter({
  tees,
  allowance = 1,
}: {
  tees: Tee[];
  /** 1 = 100%. Only shown when the event is not playing at full allowance. */
  allowance?: number;
}) {
  const [teeId, setTeeId] = useState(tees[0]?.id ?? "");
  const [index, setIndex] = useState("");
  const tee = tees.find((item) => item.id === teeId) ?? tees[0] ?? null;
  const parsed = index.trim() === "" ? null : Number(index);
  const valid =
    parsed !== null && Number.isFinite(parsed) && parsed >= INDEX_MIN && parsed <= INDEX_MAX;
  const raw = valid && tee ? rawCourseHandicap(parsed, tee) : null;
  const course = valid && tee ? courseHandicap(parsed, tee) : null;
  const playing = valid && tee ? playingHandicap(parsed, tee, allowance) : null;

  return (
    <div className="grid gap-3 rounded-[12px] border border-line bg-surface-sunken p-3">
      <div>
        <b className="text-[14px]">Course handicap converter</b>
        <p className="hint mt-0.5">
          The printed tables are this sum rounded half up: index × (slope ÷ 113) + (course rating −
          par). Scoring uses this number, not the index.
        </p>
      </div>

      {tees.length === 0 ? (
        <p className="hint m-0">Add a tee with its rating, slope and par to convert an index.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="field">
            <span>Tee</span>
            <select value={teeId} onChange={(event) => setTeeId(event.target.value)}>
              {tees.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.courseRating} / {item.slope} / par {item.par}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Handicap index</span>
            <input
              type="number"
              step="0.1"
              min={INDEX_MIN}
              max={INDEX_MAX}
              value={index}
              placeholder="e.g. 14.2"
              onChange={(event) => setIndex(event.target.value)}
            />
            <span className="hint">
              {index.trim() !== "" && !valid ? "An index is between -10 and 54." : ""}
            </span>
          </label>
          <div className="field">
            <span>Course handicap</span>
            <b className="font-display text-2xl">{course ?? "—"}</b>
            <span className="hint">
              {raw !== null && course !== null
                ? `${raw.toFixed(2)} rounds to ${course}.`
                : allowance === 1
                  ? "At 100% allowance this is also the playing handicap."
                  : ""}
            </span>
          </div>
        </div>
      )}

      {allowance !== 1 && playing !== null && (
        <p className="hint m-0">
          At {Math.round(allowance * 100)}% allowance the playing handicap is {playing}.
        </p>
      )}
    </div>
  );
}
