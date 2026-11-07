"use client";

import { type CSSProperties, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/bits";
import { sessionForTime, type SessionKey } from "@/lib/data/sessions";
import type {
  PublicPairingDay,
  PublicPairingGroup,
  PublicPairingPlayer,
  PublicPairings,
} from "@/lib/data/types";
import { fmtTime, shortDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { publicPhotoUrl } from "@/lib/photo";

/** The signed-in player, when the page could work out who is reading. */
export interface PairingsYou {
  /** The player record id, or null when the account is linked by name only. */
  id: string | null;
  name: string;
}

type Density = "comfortable" | "compact";
type Bucket = SessionKey | "TBC";

const DENSITY_KEY = "teeline.pairings.density";
const DAY_KEY = "teeline.pairings.day";

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
 * A card leads with the tee time, then the hole, then the players, then the flight. A group with
 * no time says so instead of showing a made-up hour.
 *
 * A multi-day event is read one day at a time through the chips, and the chips remember the last
 * choice on this phone. Within a day the groups are split into AM and PM sessions, each with a
 * heading that stays under the toolbar while the list scrolls, so a long list always says where
 * the reader is.
 *
 * The words come from the i18n context. Outside the player/public layouts (the desk's publish
 * preview) the context falls back to English, which is what the organizer expects there.
 */
export function PairingsView({
  pairings,
  searchable = true,
  headingLevel = "group",
  flightFilter = false,
  you = null,
}: {
  pairings: PublicPairings;
  searchable?: boolean;
  /** Adds a flight dropdown beside the name search. */
  flightFilter?: boolean;
  /** "group" inside a dialog, "section" when it is the page's main content. */
  headingLevel?: "group" | "section";
  /** The signed-in player, so their own group can be found and marked "You". */
  you?: PairingsYou | null;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [flight, setFlight] = useState("");
  const [density, setDensity] = useState<Density>("comfortable");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ day: number; number: number; seq: number } | null>(
    null,
  );
  const [notListed, setNotListed] = useState(false);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  // The phone action bar appears once the list is being read, so it never covers the first card.
  const [actionsVisible, setActionsVisible] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
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

  // The day the reader probably wants: their own day, then the saved choice, then the first day.
  const requestedDay = selectedDay ?? ownGroup?.dayNumber ?? days[0]?.dayNumber ?? null;
  const activeDay = days.find((day) => day.dayNumber === requestedDay) ?? days[0] ?? null;

  // Remember the last day and the last density on this phone.
  useEffect(() => {
    const savedDensity = readStore(DENSITY_KEY);
    if (savedDensity === "compact" || savedDensity === "comfortable") setDensity(savedDensity);
    const savedDay = Number(readStore(DAY_KEY));
    if (Number.isFinite(savedDay) && savedDay > 0) setSelectedDay(savedDay);
  }, []);

  // The sticky session heading sits directly under the sticky toolbar, so the toolbar's real
  // height is measured instead of guessed (the day chips and the flight filter change it).
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
    writeStore(DAY_KEY, String(dayNumber));
  };

  const groupLabel = (startHole: number) => {
    if (!(startHole > 0)) return "";
    if (pairings.startFormat !== "shotgun") return t("pairings.groupTee", { hole: startHole });
    return t("pairings.groupHole", { hole: startHole });
  };

  const matched = (group: PublicPairingGroup) =>
    (!flight || group.flight === flight) &&
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
    const own = ownGroup.players.find(isYou);
    setQuery(own?.name ?? you.name);
    if (ownGroup.dayNumber) chooseDay(ownGroup.dayNumber);
    seq.current += 1;
    setFocusRequest({ day: ownGroup.dayNumber ?? 1, number: ownGroup.number, seq: seq.current });
  };

  const clearSearch = () => {
    setQuery("");
    setFlight("");
    setFocusRequest(null);
    setNotListed(false);
    searchRef.current?.focus();
  };

  // A search looks across every day, so "when does my buddy tee off?" is answered even when the
  // buddy plays tomorrow. Browsing without a search stays on the chosen day.
  const daysToRead: PublicPairingDay[] =
    days.length > 0
      ? searching || Boolean(flight)
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
    const dayIndex = days.length > 0 ? days.findIndex((item) => item.dayNumber === day.dayNumber) : 0;
    const dayCount = Math.max(1, days.length);
    const buckets: Record<Bucket, PublicPairingGroup[]> = { AM: [], PM: [], TBC: [] };
    for (const group of day.groups.filter(matched).sort(byTime)) {
      const session = sessionForTime(group.time || null, dayIndex, dayCount)?.key ?? "TBC";
      buckets[session].push(group);
    }
    for (const key of ["AM", "PM", "TBC"] as const) {
      const groups = buckets[key];
      if (groups.length === 0) continue;
      const heading =
        key === "TBC"
          ? t("pairings.timeTbc")
          : multiDay
            ? t("pairings.daySessionHeading", { day: day.label, session: key })
            : key === "AM"
              ? t("pairings.sessionAmHeading")
              : t("pairings.sessionPmHeading");
      sections.push({ key: `${day.dayNumber}-${key}`, heading, groups, day: day.dayNumber });
    }
  }

  const shown = sections.reduce((sum, section) => sum + section.groups.length, 0);
  const countLabel =
    shown === 1 ? t("pairings.groupCountGroupsOne") : t("pairings.groupCountGroups", { count: shown });
  const isOwnGroup = (group: PublicPairingGroup) => group.players.some(isYou);
  const dayOf = (group: PublicPairingGroup) => group.dayNumber ?? activeDay?.dayNumber ?? 1;

  const onChipKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = days.findIndex((day) => day.dayNumber === activeDay?.dayNumber);
    if (index < 0) return;
    const count = days.length;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? count - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + count) % count;
    const target = days[next];
    if (!target) return;
    chooseDay(target.dayNumber);
    chipRefs.current[next]?.focus();
  };

  const renderGroup = (group: PublicPairingGroup) => {
    const own = isOwnGroup(group);
    const highlighted =
      focusRequest !== null &&
      focusRequest.number === group.number &&
      focusRequest.day === dayOf(group);
    const time = group.time.trim();
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
        className={`p-card${own ? " is-own" : ""}${own && highlighted ? " is-hit" : ""}`}
      >
        <div className="p-card-top">
          {headingLevel === "section" ? (
            <h4 className={`p-time${time ? "" : " is-tbc"}`}>
              {time ? fmtTime(time) : t("pairings.timeTbc")}
            </h4>
          ) : (
            <b className={`p-time${time ? "" : " is-tbc"}`}>
              {time ? fmtTime(time) : t("pairings.timeTbc")}
            </b>
          )}
          {hole && <span className="p-hole">{hole}</span>}
          {group.flight !== "" && <span className="p-flight-top">{group.flight}</span>}
          {own && <span className="p-own-chip">{t("pairings.ownGroup")}</span>}
        </div>
        <ul className="p-players">
          {group.players.map((player) => {
            const hit = searching && matchesName(player.name, tokens);
            const mine = isYou(player);
            const photo = publicPhotoUrl(player.photoPath);
            return (
              <li
                key={`${dayOf(group)}-${group.number}-${player.id ?? player.name}`}
                className={`p-row${hit ? " is-hit" : ""}`}
                data-you={mine ? "true" : undefined}
              >
                <Avatar name={player.name} photo={photo} />
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
                className="p-search"
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

          {multiDay && (
            <div className="p-toolbar-tools">
              <div className="p-chips" role="group" aria-label={t("pairings.dayChips")}>
                {days.map((day, index) => {
                  const active = day.dayNumber === activeDay?.dayNumber;
                  const date = shortDate(day.playDate);
                  return (
                    <button
                      key={day.dayNumber}
                      ref={(element) => {
                        chipRefs.current[index] = element;
                      }}
                      type="button"
                      className={`p-chip${active ? " is-active" : ""}`}
                      aria-pressed={active}
                      aria-label={date ? `${day.label} · ${date}` : day.label}
                      onKeyDown={onChipKeyDown}
                      onClick={() => chooseDay(day.dayNumber)}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
              {flightFilter && flights.length > 1 && (
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
            {!multiDay && flightFilter && flights.length > 1 && (
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
            )}
            <div className="p-toolbar-actions">
              <button type="button" className="btn p-action-primary" onClick={findMe}>
                {t("pairings.findMe")}
              </button>
              <button
                type="button"
                className="btn ghost"
                data-help="pairings-print"
                onClick={() => window.print()}
              >
                {t("common.print")}
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
          <div className="p-empty">
            <p className="m-0">{searching || flight ? t("pairings.noMatch") : t("pairings.dayEmpty")}</p>
            {(searching || flight) && (
              <button type="button" className="btn ghost" onClick={clearSearch}>
                {t("pairings.clearSearch")}
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
          <button
            type="button"
            className="btn ghost"
            data-help="pairings-print"
            onClick={() => window.print()}
          >
            {t("common.print")}
          </button>
        </div>
      )}
    </div>
  );
}
