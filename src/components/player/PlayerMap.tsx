"use client";

import { useState } from "react";
import {
  COURSE_NAME,
  holePath,
  mapBounds,
  PLAYER_MAP_HOLES,
  viewBoxOf,
} from "@/lib/course/player-map";
import { useI18n } from "@/lib/i18n/context";

const HOLES = [...PLAYER_MAP_HOLES].sort((a, b) => a.hole - b.hole);
const VIEW_BOX = viewBoxOf(mapBounds(PLAYER_MAP_HOLES));

/**
 * The holes as a diagram a phone can use: a routing drawing plus eighteen numbered chips.
 *
 * The chips are the tap targets, because a pin drawn on a 375px-wide illustration is smaller than
 * a thumb. The drawing follows the selection, so picking a hole shows where it runs.
 */
export function PlayerMap() {
  const { t } = useI18n();
  const [selected, setSelected] = useState<number | null>(null);
  const pick = (hole: number) => setSelected((current) => (current === hole ? null : hole));

  return (
    <div className="grid gap-3">
      <div className="player-map">
        <svg viewBox={VIEW_BOX} role="img" aria-label={COURSE_NAME}>
          {HOLES.map((hole) => (
            <g key={hole.hole}>
              <path
                d={holePath(hole)}
                className={selected === hole.hole ? "hole-line is-selected" : "hole-line"}
              />
              <circle cx={hole.tee[0]} cy={hole.tee[1]} r={5} className="hole-tee" />
              <circle cx={hole.green[0]} cy={hole.green[1]} r={9} className="hole-green" />
              <g
                role="button"
                tabIndex={0}
                aria-pressed={selected === hole.hole}
                aria-label={t("player.course.hole", { hole: hole.hole })}
                onClick={() => pick(hole.hole)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    pick(hole.hole);
                  }
                }}
              >
                <circle
                  cx={hole.pin[0]}
                  cy={hole.pin[1]}
                  r={15}
                  className={selected === hole.hole ? "hole-pin is-selected" : "hole-pin"}
                />
                <text
                  x={hole.pin[0]}
                  y={hole.pin[1] + 4}
                  textAnchor="middle"
                  className="hole-number"
                >
                  {hole.hole}
                </text>
              </g>
            </g>
          ))}
        </svg>
      </div>

      <p className="text-[15px] font-semibold" aria-live="polite">
        {selected === null
          ? t("player.course.choose")
          : t("player.course.hole", { hole: selected })}
      </p>

      <div className="hole-grid" role="group" aria-label={t("player.course.list")}>
        {HOLES.map((hole) => (
          <button
            key={hole.hole}
            type="button"
            className="hole-chip tnum"
            aria-pressed={selected === hole.hole}
            onClick={() => pick(hole.hole)}
          >
            {hole.hole}
          </button>
        ))}
      </div>
    </div>
  );
}
