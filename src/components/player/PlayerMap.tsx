"use client";

import { Check } from "lucide-react";
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
 * The holes as a diagram a phone can use: the routing drawing, then one 44px chip per hole.
 *
 * The drawing is the illustration the page labels as such; the chips are the labelled controls. A
 * pin on the phone is about 11px across, and the closest two pins are 24px apart, so a pin cannot be
 * a 44px target without covering its neighbour. The pins stay a pointer shortcut for a wide screen;
 * a chip is the target for a thumb, and it moves the gold line and the gold pin to the choice.
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
            <g
              key={hole.hole}
              className="cursor-pointer"
              aria-hidden="true"
              onClick={() => pick(hole.hole)}
            >
              <path
                d={holePath(hole)}
                className={selected === hole.hole ? "hole-line is-selected" : "hole-line"}
              />
              <circle cx={hole.tee[0]} cy={hole.tee[1]} r={5} className="hole-tee" />
              <circle cx={hole.green[0]} cy={hole.green[1]} r={9} className="hole-green" />
              <circle
                cx={hole.pin[0]}
                cy={hole.pin[1]}
                r={15}
                className={selected === hole.hole ? "hole-pin is-selected" : "hole-pin"}
              />
              <text x={hole.pin[0]} y={hole.pin[1] + 4} textAnchor="middle" className="hole-number">
                {hole.hole}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <p
        className={
          selected === null
            ? "flex min-h-11 items-center text-[15px] font-semibold"
            : "flex min-h-11 items-center gap-2 rounded-xl border border-gold bg-gold-soft px-3 text-[15px] font-semibold text-gold-ink"
        }
        aria-live="polite"
      >
        {selected !== null && <Check className="size-4 shrink-0" aria-hidden="true" />}
        {selected === null
          ? t("player.course.choose")
          : t("player.course.hole", { hole: selected })}
      </p>

      <div className="hole-grid" role="group" aria-label={t("player.course.list")}>
        {HOLES.map((hole) => (
          <button
            key={hole.hole}
            type="button"
            className="hole-chip tnum flex min-h-11 items-center justify-center text-[15px]"
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
