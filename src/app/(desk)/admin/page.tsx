"use client";

import { PanelRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CourseCanvas, useCover } from "@/components/control-room/CourseCanvas";
import { HoleCard, HolePin } from "@/components/control-room/HolePin";
import {
  ActivityPanel,
  AttentionPanel,
  DivisionsPanel,
  HandicapHistogram,
  PublishPanel,
  ReadinessPanel,
  SessionLogDrawer,
} from "@/components/control-room/panels";
import { NeedsTournament } from "@/components/NeedsTournament";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { COURSE_IS_PLACEHOLDER, MAP_HOLES } from "@/lib/course/layout";
import type { Tournament } from "@/lib/data/types";
import { fmtTime } from "@/lib/format";
import { useBoard } from "@/lib/ui/board";
import { cn } from "@/lib/ui/cn";

/**
 * Overview: the tournament control room from the approved mockup. The course is the canvas, each
 * hole's flight sits on it as a pin, and operations float around it on glass. Below 1280px the
 * right column becomes a drawer and the bottom row moves under the map.
 */
export default function ControlRoom() {
  const b = useBoard();
  if (!b.tournament) return <NeedsTournament what="The control room" />;
  return <ControlRoomInner b={b} tournament={b.tournament} />;
}

function ControlRoomInner({
  b,
  tournament,
}: {
  b: ReturnType<typeof useBoard>;
  tournament: Tournament;
}) {
  const config = tournament.config;
  const draw = b.draw;
  const mapRef = useRef<HTMLElement>(null);
  const cover = useCover(mapRef);
  const shotgun = config.startFormat === "shotgun";
  const [wave, setWave] = useState<string>("A");
  const [selected, setSelected] = useState<number | null>(null);

  // Open the first hole that needs work, as the mockup shows, once a draw exists.
  const opened = useRef(false);
  useEffect(() => {
    if (!draw || opened.current) return;
    opened.current = true;
    const first = MAP_HOLES.map((h) => b.slot(h.hole, shotgun ? "A" : null)).find(
      (s) => s.status === "blocking" || s.status === "short",
    );
    if (first) setSelected(first.hole);
  }, [draw, b, shotgun]);

  const waveGroups = draw?.filter((g) => !shotgun || g.wave === wave) ?? [];
  const date = new Date(`${config.date}T00:00:00`).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const waveStart = waveGroups[0]?.time ?? config.firstTeeTime;

  const holes = MAP_HOLES.map((h) => {
    const slot = b.slot(h.hole, shotgun ? wave : null);
    if (!shotgun) {
      const n = draw?.filter((g) => g.startHole === h.hole).length ?? 0;
      return { h, slot: { ...slot, label: n ? `${n} groups` : "No start" } };
    }
    return { h, slot };
  }).filter(({ h }) => shotgun || h.hole === 1 || h.hole === 10);

  return (
    <div>
      <section
        ref={mapRef}
        aria-label="Course map"
        className="relative h-[460px] overflow-hidden sm:h-[max(640px,100dvh)] xl:h-[max(100dvh,900px)]"
      >
        <CourseCanvas cover={cover} />

        <div className="on-photo absolute top-[104px] left-4 max-w-[min(560px,calc(100%-32px))] sm:left-6 lg:top-[118px] lg:left-[112px]">
          <p className="text-[11px] font-bold tracking-[.14em] text-[#e0bc65] uppercase">
            {shotgun ? "Shotgun start" : "Two-tee start"} · {fmtTime(waveStart)} · {date}
          </p>
          <h1 className="mt-1.5 font-serif text-[34px] leading-[38px] font-semibold !text-on-forest sm:text-[44px] sm:leading-[46px]">
            {draw ? (shotgun ? "Shotgun draw" : "Two-tee draw") : tournament.name}
          </h1>
          <p className="mt-1.5 text-sm opacity-85">
            {draw
              ? `${tournament.name} · ${waveGroups.length} groups across ${shotgun ? `18 holes · Wave ${wave}` : "holes 1 and 10"}`
              : `${b.ready.length} players ready · no draw yet`}
          </p>
          {tournament.nameNeedsConfirmation && !draw && (
            <p className="mt-1 text-xs opacity-80">
              Sample event title; confirm it with the organizer. Demo data only.
            </p>
          )}
          {shotgun && b.waves.length > 1 && (
            <div
              className="seg mt-3 !border-[rgba(238,240,234,.3)] bg-[rgba(14,22,18,.5)]"
              role="group"
              aria-label="Wave"
            >
              {b.waves.map((w) => (
                <button key={w} type="button" aria-pressed={wave === w} onClick={() => setWave(w)}>
                  Wave {w}
                </button>
              ))}
            </div>
          )}
        </div>

        {cover &&
          holes.map(({ h, slot }) => {
            const code = `${h.hole}${shotgun && slot.wave ? slot.wave : ""}`;
            const isSel = selected === h.hole;
            const label =
              isSel && slot.status === "short" && b.unplaced.length > 0
                ? `${slot.label} · drop here`
                : slot.label;
            return (
              <Popover
                key={h.hole}
                open={isSel}
                onOpenChange={(o) => setSelected(o ? h.hole : null)}
              >
                <PopoverAnchor asChild>
                  <HolePin
                    code={code}
                    label={label}
                    status={isSel ? "selected" : slot.status}
                    className="hidden sm:flex"
                    x={cover.ox + h.pin[0] * cover.s}
                    y={cover.oy + h.pin[1] * cover.s}
                    aria-label={`Hole ${code}: ${slot.status === "empty" ? "open" : slot.label}${slot.status === "blocking" ? ", blocking issue" : ""}`}
                    aria-expanded={isSel}
                    onClick={() => setSelected(isSel ? null : h.hole)}
                  />
                </PopoverAnchor>
                <PopoverContent
                  side="right"
                  align="start"
                  className="scheme-dark bg-[rgba(16,26,21,.9)]"
                >
                  <HoleCard b={b} slot={slot} />
                </PopoverContent>
              </Popover>
            );
          })}

        {COURSE_IS_PLACEHOLDER && (
          <p className="absolute bottom-3 left-4 rounded-full bg-[rgba(14,22,18,.7)] px-3 py-1 text-[11px] text-[#c9d3cc] sm:left-6 lg:left-[112px] xl:bottom-[262px]">
            Illustrated layout · not IGCC’s real holes
          </p>
        )}

        {/* ≥1280px: the mockup's floating columns. The session log opens from this rail, so nothing
            sits on top of it. */}
        <aside className="absolute top-[100px] right-6 hidden max-h-[calc(100dvh-130px)] w-[380px] flex-col gap-3.5 overflow-y-auto pb-6 [scrollbar-width:none] xl:flex">
          <SessionLogDrawer />
          <AttentionPanel b={b} />
          <ReadinessPanel b={b} />
          <PublishPanel b={b} />
        </aside>
        <div className="absolute right-[428px] bottom-6 left-[112px] hidden h-[230px] grid-cols-[300px_minmax(0,1fr)] gap-3.5 xl:grid">
          <DivisionsPanel b={b} />
          <HandicapHistogram b={b} />
        </div>

        {/* <1280px: readiness and publish in a drawer. */}
        <Sheet>
          <SheetTrigger className="glass absolute right-4 bottom-12 flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold sm:top-[100px] sm:right-6 sm:bottom-auto xl:hidden">
            <PanelRight className="size-4" aria-hidden="true" />
            Draw status
            {b.blocking.length > 0 && <span className="pill bad">{b.blocking.length}</span>}
          </SheetTrigger>
          <SheetContent title="Draw status" description={tournament.name} className="scheme-dark">
            <AttentionPanel b={b} variant="card" />
            <ReadinessPanel b={b} variant="card" />
            <PublishPanel b={b} variant="card" />
          </SheetContent>
        </Sheet>
      </section>

      <section aria-label="Holes" className="grid gap-2 px-4 pt-4 sm:hidden">
        <h2 className="text-base">Holes{shotgun ? ` · Wave ${wave}` : ""}</h2>
        <div className="flex flex-wrap gap-2">
          {holes.map(({ h, slot }) => {
            const code = `${h.hole}${shotgun && slot.wave ? slot.wave : ""}`;
            return (
              <Popover key={h.hole}>
                <PopoverAnchor asChild>
                  <PopoverTrigger asChild>
                    <HolePin
                      code={code}
                      label={slot.label}
                      status={slot.status}
                      aria-label={`Hole ${code}: ${slot.label}`}
                    />
                  </PopoverTrigger>
                </PopoverAnchor>
                <PopoverContent side="bottom" className="scheme-dark bg-[rgba(16,26,21,.94)]">
                  <HoleCard b={b} slot={slot} />
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      </section>

      <div className={cn("grid gap-4 p-4 sm:p-6 md:grid-cols-2 lg:pl-[112px] xl:hidden")}>
        <AttentionPanel b={b} variant="card" className="md:col-span-2" />
        <DivisionsPanel b={b} variant="card" />
        <HandicapHistogram b={b} variant="card" />
        <ActivityPanel variant="card" className="md:col-span-2" />
      </div>
    </div>
  );
}
