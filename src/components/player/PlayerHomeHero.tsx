"use client";

import {
  CalendarPlus,
  Check,
  ClipboardList,
  Flag,
  MapPin,
  Share2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { fmtTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { buildCalendarFile, calendarDataUrl, calendarFileName } from "@/lib/player/calendar";
import type { PortalEntry } from "@/lib/player/portal";
import {
  defaultDayIndex,
  formatDuration,
  manilaStartIso,
  teeCountdown,
  teeDays,
} from "@/lib/player/tee-time";

/**
 * The answer to the first question a player asks: when and where do I tee off?
 *
 * The card is built from the frozen published snapshot only. It shows one day at a time, with a
 * chip per playing day, and it never repeats a time on a day the snapshot does not cover. The
 * countdown runs on the phone in Manila time and stops at the tee time, when the card switches to
 * the next step. A sticky "Add to calendar" appears once the hero scrolls away, so the one primary
 * action stays in thumb reach without covering the card on arrival.
 */
export function PlayerHomeHero({
  entry,
  today,
  groupMates,
  demo = false,
}: {
  entry: PortalEntry;
  /** Today in the club's time zone, ISO. */
  today: string;
  /** The other players in the published group, empty when the pairing read failed. */
  groupMates: string[];
  demo?: boolean;
}) {
  const { t } = useI18n();
  const days = teeDays(entry, today);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stickyAction, setStickyAction] = useState(false);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const storageKey = `teeline.player-day:${entry.tournamentId}`;

  // The chosen day is remembered per event, so a two-day player does not reselect it each visit.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved && days.some((day) => day.date === saved)) setSelectedDate(saved);
    } catch {
      // No storage: today or the published day is a fine default.
    }
  }, [storageKey, days]);

  // One tick a minute is enough for "Starts in 1h 20m", and it is cheap on the battery.
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Show the sticky primary action only after the hero's own actions have scrolled away.
  useEffect(() => {
    const node = actionsRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entryState]) => setStickyAction(entryState ? !entryState.isIntersecting : false),
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const chooseDay = (date: string) => {
    setSelectedDate(date);
    try {
      window.localStorage.setItem(storageKey, date);
    } catch {
      // A blocked store only costs the memory of the choice.
    }
  };

  const fallback = days[defaultDayIndex(days, today)];
  const active = days.find((day) => day.date === selectedDate) ?? fallback;
  const started = active && active.hasStart && active.time ? active : null;
  const startIso = started ? manilaStartIso(started.date, started.time) : null;
  const countdown = startIso && now !== null ? teeCountdown(startIso, new Date(now)) : null;

  const where =
    started && active
      ? entry.startFormat === "two_tee"
        ? t("player.home.tee", { hole: active.hole ?? "?" })
        : t("player.home.hole", { hole: active.hole ?? "?" })
      : null;

  const sessionLabel =
    active?.session === "AM"
      ? t("player.home.sessionAm")
      : active?.session === "PM"
        ? t("player.home.sessionPm")
        : null;

  const whenLabel = active
    ? active.isToday
      ? t("player.app.playingToday")
      : active.date < today
        ? t("player.app.lastPlayed")
        : t("player.app.nextUp")
    : t("player.app.nextUp");

  const addToCalendar = () => {
    if (!started || !active) return;
    const ics = buildCalendarFile({
      title: `${entry.eventName} (${t("player.home.day", { day: active.dayNumber })})`,
      date: active.date,
      time: started.time ?? "",
      location: where,
      description: [where, started.flight].filter(Boolean).join(". "),
    });
    if (!ics) {
      setNotice(t("player.home.calendarFailed"));
      return;
    }
    try {
      const link = document.createElement("a");
      link.href = calendarDataUrl(ics);
      link.download = calendarFileName({
        title: entry.eventName,
        date: active.date,
        time: started.time ?? "",
      });
      document.body.appendChild(link);
      link.click();
      link.remove();
      setNotice(t("player.home.calendarAdded"));
    } catch {
      setNotice(t("player.home.calendarFailed"));
    }
  };

  const share = async () => {
    if (!active) return;
    const text = [
      entry.eventName,
      `${active.label}, ${started?.time ? fmtTime(started.time) : ""}`.replace(/, $/, ""),
      where,
      `${window.location.origin}/pairings`,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: entry.eventName, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setNotice(t("player.home.shareCopied"));
    } catch {
      setNotice(t("player.home.shareFailed"));
    }
  };

  const quickActions = (
    <div
      ref={actionsRef}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      data-testid="hero-actions"
    >
      {started ? (
        <button
          type="button"
          className="btn gold min-h-12 justify-start gap-2"
          onClick={addToCalendar}
          data-onboard="add-to-calendar"
        >
          <CalendarPlus className="size-[18px] shrink-0" aria-hidden="true" />
          <span>{t("player.home.addCalendar")}</span>
        </button>
      ) : (
        <Link href="/pairings" className="btn gold min-h-12 justify-start gap-2 no-underline">
          <Flag className="size-[18px] shrink-0" aria-hidden="true" />
          <span>{t("player.home.notOutAction")}</span>
        </Link>
      )}
      <button
        type="button"
        className="btn ghost min-h-12 justify-start gap-2"
        onClick={share}
        disabled={!active}
      >
        <Share2 className="size-[18px] shrink-0" aria-hidden="true" />
        <span>{t("player.home.share")}</span>
      </button>
      <Link href="/my/course" className="btn ghost min-h-12 justify-start gap-2 no-underline">
        <MapPin className="size-[18px] shrink-0" aria-hidden="true" />
        <span>{t("player.home.directions")}</span>
      </Link>
      <Link href="/my/card" className="btn ghost min-h-12 justify-start gap-2 no-underline">
        <ClipboardList className="size-[18px] shrink-0" aria-hidden="true" />
        <span>{t("player.home.scorecard")}</span>
      </Link>
    </div>
  );

  return (
    <section className="grid gap-3" aria-labelledby="tee-time-h" data-onboard="tee-time-hero">
      {demo && (
        <p className="notice" role="note">
          {t("player.home.demoBanner")}
        </p>
      )}

      <div className="hero-card">
        <p className="overline !text-[#d7b568]">{whenLabel}</p>
        <h2 id="tee-time-h" className="hero-event">
          {entry.eventName}
        </h2>

        {days.length > 1 && (
          <div
            className="day-chips no-print"
            role="tablist"
            aria-label={t("player.home.days")}
            data-onboard="day-chips"
          >
            {days.map((day) => {
              const on = day.date === active?.date;
              return (
                <button
                  key={day.date}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-pressed={on}
                  className="day-chip"
                  onClick={() => chooseDay(day.date)}
                >
                  <b>{t("player.home.day", { day: day.dayNumber })}</b>
                  <span>{day.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {started && active ? (
          <div className="grid gap-3">
            <p className="hero-label">{t("player.home.teeTime")}</p>
            <p className="hero-time">
              {started.time ? fmtTime(started.time) : t("programme.toBeConfirmed")}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {sessionLabel && <span className="hero-pill">{sessionLabel}</span>}
              {where && <span className="hero-pill">{where}</span>}
              {started.flight && <span className="hero-pill">{started.flight}</span>}
            </div>

            {active.isToday && countdown && (
              <p className="hero-countdown" aria-live="polite" data-testid="tee-countdown">
                {countdown.kind === "before" && (
                  <>{t("player.home.startsIn", { time: formatDuration(countdown.ms) })}</>
                )}
                {countdown.kind === "starting" && <>{t("player.home.startingNow")}</>}
                {countdown.kind === "after" && <>{t("player.home.teedOff")}</>}
              </p>
            )}

            {groupMates.length > 0 && (
              <div className="hero-group">
                <p className="hero-label flex items-center gap-2">
                  <Users className="size-4" aria-hidden="true" />
                  {t("player.home.yourGroup")}
                </p>
                <ul className="plain">
                  {groupMates.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
                <p className="hero-meta">
                  {t("player.home.groupCount", { count: groupMates.length + 1 })}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-2" data-testid="tee-time-empty">
            <p className="hero-time hero-time-empty">
              {entry.published ? t("player.home.dayNotOut") : t("player.home.notOutTitle")}
            </p>
            <p className="hero-meta">{t("player.home.notOutBody")}</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/pairings" className="btn gold no-underline">
                {t("player.home.notOutAction")}
              </Link>
              <Link href="/pairings#tee-times" className="btn ghost no-underline">
                {t("player.home.notOutProgramme")}
              </Link>
            </div>
          </div>
        )}
      </div>

      {started && active?.isToday && where && (
        <div className="next-step" data-testid="next-step">
          <p className="overline">{t("player.home.nextSteps")}</p>
          <p className="text-[17px] font-semibold">{where}</p>
        </div>
      )}

      {quickActions}

      <p className="sr-only" aria-live="polite">
        {notice}
      </p>
      {notice && (
        <p className="hint flex items-center gap-2" role="status">
          <Check className="size-4 shrink-0" aria-hidden="true" />
          {notice}
        </p>
      )}

      {stickyAction && started && (
        <div className="sticky-start no-print">
          <button
            type="button"
            className="btn gold min-h-12 w-full justify-center gap-2"
            onClick={addToCalendar}
          >
            <CalendarPlus className="size-[18px]" aria-hidden="true" />
            <span>{t("player.home.addCalendar")}</span>
            <span className="sr-only">{where}</span>
          </button>
        </div>
      )}
    </section>
  );
}
