"use client";

import { PanelRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CourseCanvas, MAP_MARGIN, useCover } from "@/components/control-room/CourseCanvas";
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
import { ScrollFade } from "@/components/ui/scroll-fade";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { COURSE_IS_PLACEHOLDER, MAP_H, MAP_HOLES, MAP_W } from "@/lib/course/layout";
import type { Tournament } from "@/lib/data/types";
import { fmtTime } from "@/lib/format";
import { useBoard } from "@/lib/ui/board";
import { cn } from "@/lib/ui/cn";
import { clampPan, clampZoom, type Pan, panBounds, zoomAbout } from "@/lib/ui/map-pan";

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
  const titleRef = useRef<HTMLDivElement>(null);
  const cover = useCover(mapRef, titleRef);
  // The map is drag-pannable so holes that sit behind the bottom row can be reached. The drag is
  // clamped to the map's own overhang, so no bare corner can ever show through the glass.
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; from: Pan; moved: boolean } | null>(null);
  // A drag that moved the map must not also read as a click on the pin it started on.
  const swallowClick = useRef(false);
  const moved = pan.x !== 0 || pan.y !== 0;
  // The wheel and pinch listeners are native, so they read the live view from a ref instead of a
  // closure frozen at the render that installed them.
  const view = useRef({ pan: { x: 0, y: 0 }, zoom: 1 });
  const boundsFor = (scale: number) => {
    const base = panBounds(
      { width: cover?.w ?? 0, height: cover?.h ?? 0 },
      {
        width: (cover?.s ?? 0) * MAP_W + 2 * (cover?.s ?? 0) * MAP_MARGIN,
        height: (cover?.s ?? 0) * MAP_H + 2 * (cover?.s ?? 0) * MAP_MARGIN,
      },
      scale,
    );
    // A fitted map sits off-centre; its slack is lopsided by that offset, which grows with zoom.
    const shiftX = (cover?.dx ?? 0) * scale;
    const shiftY = (cover?.dy ?? 0) * scale;
    return {
      minX: base.minX - shiftX,
      maxX: base.maxX - shiftX,
      minY: base.minY - shiftY,
      maxY: base.maxY - shiftY,
    };
  };
  const applyView = (nextPan: Pan, nextZoom: number) => {
    view.current = { pan: nextPan, zoom: nextZoom };
    setPan(nextPan);
    setZoom(nextZoom);
  };
  const bounds = useMemo(() => boundsFor(zoom), [cover, zoom]);
  const shotgun = config.startFormat === "shotgun";
  const [chosenStart, setChosenStart] = useState<string | null>(null);
  // Nothing is open on landing. The first hole card used to open itself when a draw existed,
  // which covered the map before anyone had asked for it.
  const [selected, setSelected] = useState<number | null>(null);

  // One start at a time on the map: a session can have more than one, and the pins can only hold
  // one group per hole. The first start is shown until the organizer picks another.
  const startTimes = b.startTimes;
  const start =
    chosenStart && startTimes.includes(chosenStart) ? chosenStart : (startTimes[0] ?? null);
  const startGroups = draw?.filter((g) => !shotgun || g.time === start) ?? [];
  const date = new Date(`${config.date}T00:00:00`).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const startClock = startGroups[0]?.time ?? config.firstTeeTime;

  const startPan = (e: React.PointerEvent<HTMLElement>) => {
    // A fresh press is a fresh intent: it clears the guard, so Reset view still works when the
    // organizer reaches for it straight after dragging.
    swallowClick.current = false;
    // Mouse and pen only: on a phone the page still has to scroll under the finger.
    if (e.button !== 0 || e.pointerType === "touch") return;
    const target = e.target as HTMLElement;
    if (!target.closest("[data-pan-surface]")) return;
    if (target.closest("button, a, input, select, textarea")) return;
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      from: view.current.pan,
      moved: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety; dragging still works while the pointer stays inside the map.
    }
    setDragging(true);
  };

  const movePan = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      setSelected(null);
    }
    applyView(clampPan({ x: d.from.x + dx, y: d.from.y + dy }, bounds), view.current.zoom);
  };

  const endPan = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!d.moved) return;
    swallowClick.current = true;
    window.setTimeout(() => {
      swallowClick.current = false;
    }, 300);
  };

  const guardClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  // Wheel and pinch zoom the map under the pointer, and the pan is clamped to the scaled map so no
  // bare corner shows through. One finger still scrolls the page: touch drag never pans the map.
  useEffect(() => {
    const el = mapRef.current;
    if (!el || !cover) return;

    const centreOf = () => {
      const rect = el.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    const zoomTo = (factor: number, focus: Pan) => {
      const from = view.current.zoom;
      const to = clampZoom(from * factor);
      if (to === from) return;
      applyView(
        clampPan(zoomAbout(view.current.pan, from, to, focus, centreOf()), boundsFor(to)),
        to,
      );
    };
    const onWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-pan-surface]")) return;
      event.preventDefault();
      zoomTo(Math.exp(-event.deltaY * 0.0016), { x: event.clientX, y: event.clientY });
    };

    const pair = (touches: TouchList) => {
      const a = touches.item(0);
      const b = touches.item(1);
      if (!a || !b) return null;
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      return {
        distance,
        focus: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
      };
    };
    let pinch: { distance: number; zoom: number; pan: Pan; focus: Pan } | null = null;
    const onTouchStart = (event: TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-pan-surface]")) return;
      const both = pair(event.touches);
      pinch =
        both && both.distance > 0
          ? {
              distance: both.distance,
              zoom: view.current.zoom,
              pan: view.current.pan,
              focus: both.focus,
            }
          : null;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!pinch) return;
      const both = pair(event.touches);
      if (!both || both.distance === 0) return;
      event.preventDefault();
      const from = pinch.zoom;
      const to = clampZoom(from * (both.distance / pinch.distance));
      if (to === from) return;
      applyView(
        clampPan(zoomAbout(pinch.pan, from, to, pinch.focus, centreOf()), boundsFor(to)),
        to,
      );
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch = null;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [cover]);

  const holes = MAP_HOLES.map((h) => {
    const slot = b.slot(h.hole, shotgun ? start : null);
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
        data-help="control-map"
        className={cn(
          "relative h-[460px] overflow-hidden sm:h-[max(640px,100dvh)] xl:h-dvh",
          dragging && "select-none",
        )}
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onClickCapture={guardClick}
      >
        <CourseCanvas cover={cover} pan={pan} zoom={zoom} />

        <div
          ref={titleRef}
          className="on-photo absolute top-[104px] left-4 max-w-[min(560px,calc(100%-32px))] sm:left-6 lg:top-[118px] lg:left-[var(--rail-pad)]">
          <p className="text-[11px] font-bold tracking-[.14em] text-[#e0bc65] uppercase">
            {shotgun ? "Shotgun start" : "Two-tee start"} · {fmtTime(startClock)} · {date}
          </p>
          <h1 className="mt-1.5 font-serif text-[34px] leading-[38px] font-semibold !text-on-forest sm:text-[44px] sm:leading-[46px]">
            {draw ? (shotgun ? "Shotgun draw" : "Two-tee draw") : tournament.name}
          </h1>
          <p className="mt-1.5 text-sm opacity-85">
            {draw
              ? `${tournament.name} · ${startGroups.length} groups across ${shotgun ? "18 holes" : "holes 1 and 10"}`
              : `${b.ready.length} players ready · no draw yet`}
          </p>
          {(tournament.nameNeedsConfirmation || b.status === "demo") && !draw && (
            <p className="mt-1 text-xs opacity-80">
              {tournament.nameNeedsConfirmation &&
                "The event name still needs the organizer's confirmation. "}
              {b.status === "demo" && "Demo data only."}
            </p>
          )}
          {shotgun && startTimes.length > 1 && (
            <div
              className="seg mt-3 !border-[rgba(238,240,234,.3)] bg-[rgba(14,22,18,.5)]"
              role="group"
              aria-label="Start time"
            >
              {startTimes.map((time) => (
                <button
                  key={time}
                  type="button"
                  aria-pressed={start === time}
                  onClick={() => setChosenStart(time)}
                >
                  {fmtTime(time)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          className="pointer-events-none absolute inset-0 will-change-transform [&_button]:pointer-events-auto"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            transformOrigin: "center",
          }}
        >
          {cover &&
            holes.map(({ h, slot }) => {
              const code = `${h.hole}`;
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
                  <PopoverContent side="right" align="start">
                    <HoleCard b={b} slot={slot} />
                  </PopoverContent>
                </Popover>
              );
            })}
        </div>

        {COURSE_IS_PLACEHOLDER && (
          <p className="absolute bottom-3 left-4 rounded-full bg-[rgba(14,22,18,.7)] px-3 py-1 text-[11px] text-[#c9d3cc] sm:left-6 lg:left-[var(--rail-pad)] xl:bottom-[262px]">
            Illustrated layout · not IGCC’s real holes
          </p>
        )}

        {/* ≥1280px: the mockup's floating columns. The session log opens from this rail, so nothing
            sits on top of it. */}
        <aside className="absolute top-[100px] right-3 bottom-6 hidden w-[396px] xl:block">
          {/* The rail scrolls inside the map, so its edges fade instead of cutting a card off. */}
          <ScrollFade
            aria-label="Tournament status"
            className="flex h-full flex-col gap-3.5 py-1 pr-3 pl-1"
          >
            <SessionLogDrawer />
            <AttentionPanel b={b} />
            <PublishPanel b={b} dataHelp="control-publish" />
            <ReadinessPanel b={b} dataHelp="control-readiness" />
          </ScrollFade>
        </aside>
        <div className="absolute right-[428px] bottom-6 left-[var(--rail-pad)] hidden h-[230px] grid-cols-[300px_minmax(0,1fr)] gap-3.5 xl:grid">
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
            <ReadinessPanel b={b} variant="card" dataHelp="control-readiness" />
            <PublishPanel b={b} variant="card" dataHelp="control-publish" />
          </SheetContent>
        </Sheet>

        {(moved || zoom !== 1) && (
          <button
            type="button"
            onClick={() => applyView({ x: 0, y: 0 }, 1)}
            className="absolute bottom-12 left-4 z-10 rounded-full bg-[rgba(14,22,18,.72)] px-3 py-1 text-[11px] text-[#c9d3cc] backdrop-blur-[8px] hover:text-[#eef0ea] sm:left-6 lg:left-[var(--rail-pad)] xl:bottom-[300px]"
          >
            Reset view
          </button>
        )}
      </section>

      <section aria-label="Holes" className="grid gap-2 px-4 pt-4 sm:hidden">
        <h2 className="text-base">Holes{shotgun && start ? ` · ${fmtTime(start)}` : ""}</h2>
        <div className="flex flex-wrap gap-2">
          {holes.map(({ h, slot }) => {
            const code = `${h.hole}`;
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
                <PopoverContent side="bottom">
                  <HoleCard b={b} slot={slot} />
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      </section>

      <div className={cn("grid gap-4 p-4 sm:p-6 md:grid-cols-2 lg:pl-[var(--rail-pad)] xl:hidden")}>
        <AttentionPanel b={b} variant="card" className="md:col-span-2" />
        <DivisionsPanel b={b} variant="card" />
        <HandicapHistogram b={b} variant="card" />
        <ActivityPanel variant="card" className="md:col-span-2" />
      </div>
    </div>
  );
}
