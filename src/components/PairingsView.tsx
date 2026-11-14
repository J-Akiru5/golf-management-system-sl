"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { datedHeading } from "@/lib/data/pairing-day";
import { type SessionKey, sessionForTime } from "@/lib/data/sessions";
import type {
  PublicPairingDay,
  PublicPairingGroup,
  PublicPairingPlayer,
  PublicPairings,
} from "@/lib/data/types";
import { fmtTime, shortDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { manilaToday } from "@/lib/player/dashboard";
import { openingPairingDay } from "@/lib/public/pairing-day";
import { publicTeeTime } from "@/lib/public/public-tee-time";

/** The signed-in player, when the page could work out who is reading. */
export interface PairingsYou {
  /** The player record id, or null when the account is linked by name only. */
  id: string | null;
  name: string;
}

type Density = "comfortable" | "compact";
type Bucket = SessionKey | "TBC";

const DENSITY_KEY = "teeline.pairings.density";

/** "Reyes, Ana" and "Ana Reyes" are the same person: compare the words, not the punctuation. */
function nameKey(value: string): string {
  return normalise(value).split(" ").filter(Boolean).sort().join(" ");
}

/** Lower case, no accents, no punctuation, single spaces. */
function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every word in the query must appear somewhere in the name, in any order. */
function tokensOf(value: string): string[] {
  return normalise(value).split(" ").filter(Boolean);
}

function matchesName(name: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const words = normalise(name);
  return tokens.every((token) => words.includes(token));
}

function groupAnchor(day: number, number: number): string {
  return `pairing-group-${day}-${number}`;
}

/**
 * The flight's colour, from its place in the draw. Four tones are enough for the club's flights and
 * they repeat rather than inventing a fifth: a colour that is never reused would stop being a cue.
 */
function flightTone(flights: string[], flight: string): number {
  // The list carries an empty entry for groups the desk left unflighted; it must not shift the
  // colours of the flights that do have a name.
  const named = flights.filter((name) => name !== "");
  const index = named.indexOf(flight);
  return index < 0 ? 0 : index % 4;
}

/** A time as "HH:MM" for ordering, with unconfirmed times last. */
function orderKey(group: PublicPairingGroup): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(group.time.trim());
  if (!match?.[1] || !match[2]) return "99:99";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function byTime(a: PublicPairingGroup, b: PublicPairingGroup): number {
  return orderKey(a).localeCompare(orderKey(b)) || a.number - b.number;
}

interface Section {
  key: string;
  heading: string;
  groups: PublicPairingGroup[];
}

function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or a blocked store: the choice still holds for this visit.
  }
}

/**
 * Player-facing pairings: when and where you tee off, and who is with you. Built from an
 * allow-listed `PublicPairings` object, never from player or registration records. Used by the
 * public page, the signed-in player and the organizer's publish preview, so what they check is
 * what players get.
 *
 * A card leads with the starting hole, then the tee time as a smaller pill, then the players, then
 * the flight. A group whose time is empty shows the hole and the players with no time line at all: no
 * placeholder is invented.
 *
 * A multi-day event is read one day at a time through the day dropdown, and the choice is
 * remembered on this phone. A second dropdown narrows the day to one starting hole. Within a day
 * the groups are split into AM and PM sessions, each with a heading that stays under the toolbar
 * while the list scrolls, so a long list always says where the reader is.
 *
 * The words come from the i18n context. Outside the player/public layouts (the desk's publish
 * preview) the context falls back to English, which is what the organizer expects there.
 *
 * With `publicTimes`, the time pill shows the session's one published time instead of the group's
 * stored wave time. The desk's publish preview leaves it off, because the organizer is checking the
 * draw itself. The session is still worked out from the stored time, so AM/PM, ordering and holes
 * never change.
 */
export function PairingsView({
  pairings,
  searchable = true,
  headingLevel = "group",
  flightFilter = false,
  you = null,
  publicTimes = false,
}: {
  pairings: PublicPairings;
  searchable?: boolean;
  /** Adds a flight dropdown beside the name search. */
  flightFilter?: boolean;
  /** "group" inside a dialog, "section" when it is the page's main content. */
  headingLevel?: "group" | "section";
  /** The signed-in player, so their own group can be found and marked "You". */
  you?: PairingsYou | null;
  /** Show one time per session on the public pages. Off for the desk's publish preview. */
  publicTimes?: boolean;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [flight, setFlight] = useState("");
  const [hole, setHole] = useState("");
  const [density, setDensity] = useState<Density>("comfortable");
  // Today in the club's time zone when the published snapshot has it, else its first day. The day
  // is a choice on this visit, not a stored one: a reader who comes back tomorrow opens on tomorrow.
  const [selectedDay, setSelectedDay] = useState<number | null>(() =>
    openingPairingDay(pairings.days ?? [], manilaToday()),
  );
  const [focusRequest, setFocusRequest] = useState<{
    day: number;
    number: number;
    seq: number;
  } | null>(null);
  const [notListed, setNotListed] = useState(false);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  // The phone action bar appears once the list is being read, so it never covers the first card.
  const [actionsVisible, setActionsVisible] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const tokens = useMemo(() => tokensOf(query), [query]);
  const searching = tokens.length > 0;
  const flights = useMemo(
    () => [...new Set(pairings.groups.map((g) => g.flight))].sort(),
    [pairings.groups],
  );
  const days = pairings.days ?? [];
  const multiDay = days.length > 1;

  const youKey = you?.name ? nameKey(you.name) : "";
  const isYou = (player: PublicPairingPlayer) =>
    you !== null &&
    ((you.id !== null && player.id === you.id) ||
      (youKey !== "" && nameKey(player.name) === youKey));
  const ownGroup = you
    ? (pairings.groups.find((group) => group.players.some(isYou)) ?? null)
    : null;

  // The day the reader wants: the chip they chose, else today when the snapshot has it, else the
  // first day present. A saved day is deliberately not reused: a chip chosen yesterday should not
  // hide today's groups.
  const activeDay = days.find((day) => day.dayNumber === selectedDay) ?? days[0] ?? null;

  // The hole filter only offers holes that the current view actually contains. A search or a
  // flight looks across every day, so its hole options are the whole event's holes; browsing a
  // day offers that day's holes.
  const holeOptions = useMemo(() => {
    const scope =
      days.length === 0
        ? pairings.groups
        : (searching
            ? days
            : days.filter((day) => day.dayNumber === (activeDay?.dayNumber ?? days[0]?.dayNumber))
          ).flatMap((day) => day.groups);
    const holes = new Set<number>();
    for (const group of scope) if (group.startHole > 0) holes.add(group.startHole);
    return [...holes].sort((a, b) => a - b);
  }, [activeDay, days, pairings.groups, searching]);

  // A selected hole that is not on the new day (or not in the new search scope) falls back to
  // all holes instead of leaving an empty board behind a filter the reader cannot see.
  useEffect(() => {
    if (hole !== "" && !holeOptions.includes(Number(hole))) setHole("");
  }, [hole, holeOptions]);

  // Remember the last day and the last density on this phone.
  useEffect(() => {
    const savedDensity = readStore(DENSITY_KEY);
    if (savedDensity === "compact" || savedDensity === "comfortable") setDensity(savedDensity);
  }, []);

  // The sticky session heading sits directly under the sticky toolbar, so the toolbar's real
  // height is measured instead of guessed (the day, hole and flight filters change it).
  useEffect(() => {
    const element = toolbarRef.current;
    if (!element) return;
    const measure = () => setToolbarHeight(element.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The phone action bar appears once the reader has scrolled into the list. Before that the
  // search field is the action, and the first card is not covered.
  useEffect(() => {
    if (!searchable) return;
    const onScroll = () => setActionsVisible(window.scrollY > 160);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [searchable]);

  // Scroll after the render that added the group, not before it exists.
  useEffect(() => {
    if (!focusRequest) return;
    const target = document.getElementById(groupAnchor(focusRequest.day, focusRequest.number));
    if (!target) return;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [focusRequest]);

  const chooseDensity = (next: Density) => {
    setDensity(next);
    writeStore(DENSITY_KEY, next);
  };

  const chooseDay = (dayNumber: number) => {
    setSelectedDay(dayNumber);
    setHole("");
    setFocusRequest(null);
    setNotListed(false);
  };

  const groupLabel = (startHole: number) => {
    if (!(startHole > 0)) return "";
    if (pairings.startFormat !== "shotgun") return t("pairings.groupTee", { hole: startHole });
    return t("pairings.groupHole", { hole: startHole });
  };

  const matched = (group: PublicPairingGroup) =>
    (!flight || group.flight === flight) &&
    (!hole || group.startHole === Number(hole)) &&
    (!searching || group.players.some((player) => matchesName(player.name, tokens)));

  /** Without a known name there is nothing to match, so the search field is the honest action. */
  const findMe = () => {
    if (!you) {
      setNotListed(false);
      searchRef.current?.focus();
      return;
    }
    if (!ownGroup) {
      setNotListed(true);
      return;
    }
    setNotListed(false);
    setFlight("");
    setHole("");
    const own = ownGroup.players.find(isYou);
    setQuery(own?.name ?? you.name);
    if (ownGroup.dayNumber) chooseDay(ownGroup.dayNumber);
    seq.current += 1;
    setFocusRequest({ day: ownGroup.dayNumber ?? 1, number: ownGroup.number, seq: seq.current });
  };

  const clearSearch = () => {
    setQuery("");
    setFlight("");
    setHole("");
    setFocusRequest(null);
    setNotListed(false);
    searchRef.current?.focus();
  };

  // The chosen day is the only day read: the search finds a name in that day's groups instead of
  // jumping to a different day, so switching a chip is the way to look at another day. Snapshots
  // written before days existed stay one flat list.
  const daysToRead: PublicPairingDay[] =
    days.length > 0
      ? searching
        ? days
        : days.filter((day) => day.dayNumber === (activeDay?.dayNumber ?? days[0]?.dayNumber))
      : [
          {
            dayNumber: 1,
            label: "",
            playDate: "",
            groups: pairings.groups,
          },
        ];

  const sections: Array<Section & { day: number }> = [];
  for (const day of daysToRead) {
    const dayIndex =
      days.length > 0 ? days.findIndex((item) => item.dayNumber === day.dayNumber) : 0;
    const dayCount = Math.max(1, days.length);
    const buckets: Record<Bucket, PublicPairingGroup[]> = { AM: [], PM: [], TBC: [] };
    for (const group of day.groups.filter(matched).sort(byTime)) {
      const session = sessionForTime(group.time || null, dayIndex, dayCount)?.key ?? "TBC";
      buckets[session].push(group);
    }
    for (const key of ["AM", "PM", "TBC"] as const) {
      const groups = buckets[key];
      if (groups.length === 0) continue;
      const base =
        key === "TBC"
          ? day.label
          : multiDay
            ? t("pairings.daySessionHeading", { day: day.label, session: key })
            : key === "AM"
              ? t("pairings.sessionAmHeading")
              : t("pairings.sessionPmHeading");
      // Every group bar names its date, so a reader can see which day the groups below belong to.
      // A snapshot written before days existed has no per-day date, so the event's own date label
      // stands in for it.
      const dateText = shortDate(day.playDate) ?? (days.length === 0 ? pairings.dateLabel : null);
      sections.push({
        key: `${day.dayNumber}-${key}`,
        heading: datedHeading(base, dateText),
        groups,
        day: day.dayNumber,
      });
    }
  }

  const shown = sections.reduce((sum, section) => sum + section.groups.length, 0);
  const countLabel =
    shown === 1
      ? t("pairings.groupCountGroupsOne")
      : t("pairings.groupCountGroups", { count: shown });
  const isOwnGroup = (group: PublicPairingGroup) => group.players.some(isYou);
  const dayOf = (group: PublicPairingGroup) => group.dayNumber ?? activeDay?.dayNumber ?? 1;

  const renderGroup = (group: PublicPairingGroup) => {
    const own = isOwnGroup(group);
    const highlighted =
      focusRequest !== null &&
      focusRequest.number === group.number &&
      focusRequest.day === dayOf(group);
    const dayNumber = dayOf(group);
    const storedTime = group.time.trim();
    // The session is read from the stored time exactly as the AM/PM split does, so the canonical
    // time can never move a group to another session. An unreadable or empty time stays as it is.
    const dayIndex = days.length > 0 ? days.findIndex((day) => day.dayNumber === dayNumber) : 0;
    const session = storedTime
      ? sessionForTime(storedTime, dayIndex, Math.max(1, days.length))
      : null;
    const sessionTime =
      publicTimes && session ? publicTeeTime({ dayNumber, afternoon: session.key === "PM" }) : null;
    const time = sessionTime ?? storedTime;
    const hole = groupLabel(group.startHole);
    return (
      <article
        // A new key restarts the one-off flash when Find me is pressed again.
        key={
          own && highlighted && focusRequest
            ? `${dayOf(group)}-${group.number}-${focusRequest.seq}`
            : `${dayOf(group)}-${group.number}`
        }
        id={groupAnchor(dayOf(group), group.number)}
        data-testid="pairing-group"
        data-own={own ? "true" : undefined}
        data-tone={group.flight === "" ? undefined : flightTone(flights, group.flight)}
        className={`p-card${own ? " is-own" : ""}${own && highlighted ? " is-hit" : ""}`}
      >
        <div className="p-card-top">
          {hole && <span className="p-hole">{hole}</span>}
          {time &&
            (headingLevel === "section" ? (
              <h4 className="p-time">{fmtTime(time)}</h4>
            ) : (
              <b className="p-time">{fmtTime(time)}</b>
            ))}
          {/* The hole alone on the first line and the tee time on the right; the class sits under
              them on the left, and the flag waits at the foot of the card. */}
          <div className="p-card-meta">
            {group.flight !== "" && <span className="p-flight-top">{group.flight}</span>}
            {own && <span className="p-own-chip">{t("pairings.ownGroup")}</span>}
          </div>
        </div>
        <ul className="p-players">
          {group.players.map((player) => {
            const hit = searching && matchesName(player.name, tokens);
            const mine = isYou(player);
            return (
              <li
                key={`${dayOf(group)}-${group.number}-${player.id ?? player.name}`}
                className={`p-row${hit ? " is-hit" : ""}`}
                data-you={mine ? "true" : undefined}
              >
                <span className="p-row-name">
                  <span className={mine ? "is-you-name" : undefined}>{player.name}</span>
                  {mine && <span className="p-you">{t("pairings.you")}</span>}
                </span>
              </li>
            );
          })}
        </ul>
        {group.flight !== "" && (
          <div className="p-card-foot">
            <span className="p-flight">{group.flight}</span>
          </div>
        )}
        {/* The card's own mark, at its foot, where a printed card carries one. */}
        <svg className="p-golf-flag" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <path d="M9 44V4" />
          <path d="M9 6c9-4 9 4 18 0 6-2.6 7-3.2 12-4v14c-5 .8-6 1.4-12 4-9 4-9-4-18 0Z" />
          <circle cx="23" cy="38" r="1.6" />
        </svg>
      </article>
    );
  };

  return (
    <div
      className={`p-pairings${density === "compact" ? " is-compact" : ""}`}
      data-testid="pairings-view"
      style={{ "--p-toolbar-h": `${toolbarHeight}px` } as CSSProperties}
    >
      {searchable && (
        <div className="p-toolbar no-print" ref={toolbarRef} data-testid="pairings-toolbar">
          <div className="p-toolbar-row">
            <div className="p-search-wrap">
              <input
                ref={searchRef}
                type="search"
                className={`p-search${query !== "" ? " has-clear" : ""}`}
                data-help="pairings-search"
                placeholder={t("pairings.findName")}
                aria-label={t("pairings.findName")}
                aria-describedby="pairings-search-hint"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setFocusRequest(null);
                  setNotListed(false);
                }}
              />
              <span id="pairings-search-hint" className="sr-only">
                {t("pairings.searchHint")}
              </span>
              {query !== "" && (
                <button
                  type="button"
                  className="p-clear"
                  aria-label={t("pairings.clearQuery")}
                  onClick={clearSearch}
                >
                  ×
                </button>
              )}
            </div>
            <button type="button" className="btn ghost p-toolbar-find" onClick={findMe}>
              {t("pairings.findMe")}
            </button>
          </div>

          {(multiDay || holeOptions.length > 1 || (flightFilter && flights.length > 1)) && (
            <div className="p-toolbar-tools">
              {multiDay && (
                <label className="p-filter">
                  <span className="p-filter-label">{t("pairings.filterDay")}</span>
                  <select
                    aria-label={t("pairings.filterDay")}
                    data-testid="pairings-day"
                    className="p-flight-select"
                    value={String(activeDay?.dayNumber ?? "")}
                    onChange={(e) => chooseDay(Number(e.target.value))}
                  >
                    {days.map((day) => {
                      const date = shortDate(day.playDate);
                      return (
                        <option key={day.dayNumber} value={String(day.dayNumber)}>
                          {date ? `${day.label} · ${date}` : day.label}
                        </option>
                      );
                    })}
                  </select>
                </label>
              )}
              {holeOptions.length > 1 && (
                <label className="p-filter">
                  <span className="p-filter-label">{t("pairings.filterHole")}</span>
                  <select
                    aria-label={t("pairings.filterHole")}
                    data-testid="pairings-hole"
                    className="p-flight-select"
                    value={hole}
                    onChange={(e) => {
                      setHole(e.target.value);
                      setFocusRequest(null);
                      setNotListed(false);
                    }}
                  >
                    <option value="">{t("pairings.allHoles")}</option>
                    {holeOptions.map((startHole) => (
                      <option key={startHole} value={String(startHole)}>
                        {groupLabel(startHole)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {flightFilter && flights.length > 1 && (
                <label className="p-filter">
                  <span className="p-filter-label">{t("pairings.filterFlightShort")}</span>
                  <select
                    aria-label={t("pairings.filterFlight")}
                    data-help="pairings-flight"
                    className="p-flight-select"
                    value={flight}
                    onChange={(e) => {
                      setFlight(e.target.value);
                      setFocusRequest(null);
                      setNotListed(false);
                    }}
                  >
                    <option value="">{t("pairings.allFlights")}</option>
                    {flights.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          <div className="p-toolbar-meta">
            <span className="p-count" role="status" aria-live="polite">
              {countLabel}
            </span>
            <div className="p-density" role="group" aria-label={t("pairings.density")}>
              <button
                type="button"
                className="p-density-btn"
                aria-pressed={density === "comfortable"}
                onClick={() => chooseDensity("comfortable")}
              >
                {t("pairings.densityComfortable")}
              </button>
              <button
                type="button"
                className="p-density-btn"
                aria-pressed={density === "compact"}
                onClick={() => chooseDensity("compact")}
              >
                {t("pairings.densityCompact")}
              </button>
            </div>
            <div className="p-toolbar-actions">
              <button type="button" className="btn p-action-primary" onClick={findMe}>
                {t("pairings.findMe")}
              </button>
            </div>
            {notListed && (
              <span className="p-notice" role="status">
                {t("pairings.noOwnGroup")}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="p-list" data-help="pairings-groups">
        {sections.map((section) => (
          <section key={section.key} className="p-session">
            <h3 className="p-session-bar" data-testid="pairings-session">
              {section.heading}
            </h3>
            <div className="p-groups">{section.groups.map(renderGroup)}</div>
          </section>
        ))}
        {shown === 0 && (
          <div className="p-empty" data-testid="pairings-empty">
            <p className="m-0">
              {searching || flight || hole ? t("pairings.noMatch") : t("pairings.dayEmpty")}
            </p>
            {(searching || flight || hole) && (
              <button type="button" className="btn ghost" onClick={clearSearch}>
                {searching ? t("pairings.clearSearch") : t("pairings.clearFilters")}
              </button>
            )}
          </div>
        )}
      </div>

      {searchable && (
        <div className={`p-actions no-print${actionsVisible ? " is-visible" : ""}`}>
          <button type="button" className="btn p-action-primary" onClick={findMe}>
            {t("pairings.findMe")}
          </button>
        </div>
      )}
    </div>
  );
}
