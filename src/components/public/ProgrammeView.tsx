"use client";

import Link from "next/link";
import { Fragment, type KeyboardEvent, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/bits";
import { fmtIso } from "@/lib/data/labels";
import type { PublicProgramme } from "@/lib/data/types";
import { fmtIndex, fmtTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { matchesName } from "@/lib/name-match";
import { manilaToday } from "@/lib/player/dashboard";
import { openingDayNumber } from "@/lib/public/programme-day";
import { confirmedTeeTime, teeBoardSections } from "@/lib/public/tee-board";

/**
 * The public programme: the day's tee times, the player cards and the organizers' rules of play.
 *
 * It only ever receives the allow-listed `PublicProgramme` object. Names, home club, the frozen
 * index, category, flight and a confirmed start time are the whole vocabulary; contact details,
 * birthdates, gender, notes and photos are not part of the type and cannot leak from here.
 *
 * The pairings stay separate (`PairingsView`) so the pairings page can put them above the tee-time
 * board and the rules, while the roster and the profile have their own pages. The tee-time board is
 * deliberately only a timetable: one row per player, grouped by the session the day runs (AM, PM, or
 * "time not assigned"), never by group, pair or hole. That is what keeps the board readable while
 * the draw itself is held.
 *
 * Everything here is read one-handed on a phone: the day chips wrap instead of clipping, and every
 * control is at least 44px tall.
 */

/**
 * One player's place on the board, flattened across every day so a search is never day-bound.
 * A row carries the player's own name and time. It deliberately has no room for a group mate, a
 * pair number or a starting hole: the board may not answer those questions.
 */
interface SearchRow {
  key: string;
  dayNumber: number;
  dayLabel: string;
  playDate: string;
  teeTime: string | null;
  name: string;
}

/** Lower case, no accents, no punctuation: the words the reader typed, without the decoration. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Marks the words that made the name match, so a result explains itself. */
function HighlightedName({ name, query }: { name: string; query: string }) {
  const tokens = query
    .split(/\s+/)
    .map(fold)
    .filter((token) => token !== "");
  return (
    <>
      {name.split(/(\s+)/).map((part, index) => {
        const folded = fold(part);
        const hit = folded !== "" && tokens.some((token) => folded.includes(token));
        return hit ? (
          <mark key={`${part}-${index}`}>{part}</mark>
        ) : (
          <Fragment key={`${part}-${index}`}>{part}</Fragment>
        );
      })}
    </>
  );
}

export function TeeTimesBoard({ programme }: { programme: PublicProgramme }) {
  const { t } = useI18n();
  // Today in the club's time zone, then the next day still ahead, then the first day.
  const [selected, setSelected] = useState<number>(
    () => openingDayNumber(programme.days, manilaToday()) ?? programme.days[0]?.dayNumber ?? 1,
  );
  const [query, setQuery] = useState("");
  const searching = query.trim() !== "";
  const day = programme.days.find((item) => item.dayNumber === selected) ?? programme.days[0];
  const dayIndex = day ? programme.days.findIndex((item) => item.dayNumber === day.dayNumber) : -1;
  // The day is a timetable: its AM players, its PM players, then anyone whose session cannot be
  // read from a confirmed time. A section with nobody in it is not printed.
  const sections = useMemo(
    () =>
      day
        ? teeBoardSections(day, dayIndex, programme.days.length).filter(
            (section) => section.players.length > 0,
          )
        : [],
    [day, dayIndex, programme.days.length],
  );
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  // Every player on every day: their own name and their confirmed time, and nothing about who
  // they play with. A search looks across all days, so tomorrow answers too.
  const rows = useMemo(() => {
    const all: SearchRow[] = [];
    for (const item of programme.days) {
      item.players.forEach((player, playerIndex) => {
        const name = player.name.trim();
        if (name === "") return;
        const teeTime = confirmedTeeTime(player);
        all.push({
          key: `${item.dayNumber}|${name}|${teeTime ?? "no-time"}|${playerIndex}`,
          dayNumber: item.dayNumber,
          dayLabel: item.label,
          playDate: item.playDate,
          teeTime,
          name,
        });
      });
    }
    return all;
  }, [programme.days]);

  const results = useMemo(() => {
    if (!searching) return [];
    const order = (row: SearchRow) =>
      [String(row.dayNumber).padStart(3, "0"), row.teeTime ?? "99:99", row.name].join("|");
    return rows
      .filter((row) => matchesName(row.name, query))
      .sort((a, b) => order(a).localeCompare(order(b)));
  }, [rows, query, searching]);

  const clearSearch = () => {
    setQuery("");
    searchRef.current?.focus();
  };

  // Arrow keys move between day chips, as a tab list should.
  const onChipKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = programme.days.findIndex((item) => item.dayNumber === selected);
    if (index < 0) return;
    const count = programme.days.length;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? count - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + count) % count;
    const target = programme.days[next];
    if (!target) return;
    setSelected(target.dayNumber);
    chipRefs.current[next]?.focus();
  };

  return (
    <section className="card grid gap-3" id="tee-times">
      <div>
        <h2 className="text-[20px] leading-7">{t("programme.teeTimesTitle")}</h2>
        <p className="hint m-0">{t("programme.teeTimesIntro")}</p>
      </div>

      {programme.days.length > 0 && (
        <div className="p-search-wrap no-print">
          <input
            ref={searchRef}
            type="search"
            className={`p-search${query !== "" ? " has-clear" : ""}`}
            placeholder={t("programme.findPlayer")}
            aria-label={t("programme.findPlayer")}
            aria-describedby="tee-search-hint"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span id="tee-search-hint" className="sr-only">
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
      )}

      {searching ? (
        results.length === 0 ? (
          <p className="muted">{t("programme.noTeeTimeMatch")}</p>
        ) : (
          <ul className="plain grid gap-2" data-testid="tee-search-results">
            {results.map((row) => (
              <li key={row.key} className="tee-slot" data-testid="tee-search-result">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <b className="text-[15px] leading-6 font-semibold text-ink-muted">
                    {row.dayLabel} · {fmtIso(row.playDate)}
                  </b>
                  {row.teeTime !== null && (
                    <b className="font-display text-[20px] leading-6 font-bold tabular-nums text-ink">
                      {fmtTime(row.teeTime)}
                    </b>
                  )}
                </div>
                {/* One name, the player who was searched for. No group mate, no pair, no hole. */}
                <p className="m-0 text-[16px] leading-6 text-ink" data-testid="tee-search-name">
                  <HighlightedName name={row.name} query={query} />
                </p>
              </li>
            ))}
          </ul>
        )
      ) : !day ? (
        <p className="muted">{t("programme.noDays")}</p>
      ) : (
        <>
          <div
            className="no-print flex w-full min-w-0 flex-wrap gap-2 pb-1"
            role="tablist"
            aria-label={t("programme.daysLabel")}
          >
            {programme.days.map((item, index) => {
              const active = item.dayNumber === day.dayNumber;
              return (
                <button
                  key={item.dayNumber}
                  ref={(element) => {
                    chipRefs.current[index] = element;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-pressed={active}
                  onKeyDown={onChipKeyDown}
                  onClick={() => setSelected(item.dayNumber)}
                  className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold whitespace-nowrap ${
                    active
                      ? "border-forest bg-forest text-on-forest"
                      : "border-line bg-surface-raised text-ink"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <h3 className="m-0 text-[17px] leading-6">
            {day.label} · {fmtIso(day.playDate)}
          </h3>

          {sections.length === 0 ? (
            <p className="muted">{t("programme.noPlayersDay")}</p>
          ) : (
            <div className="grid items-start gap-3 sm:grid-cols-2" data-testid="tee-sessions">
              {sections.map((section) => (
                <article
                  key={section.key}
                  className="tee-slot"
                  data-testid="tee-session"
                  data-session={section.key}
                >
                  <h4 className="m-0 text-[13px] leading-5 font-semibold tracking-wide text-ink-muted uppercase">
                    {section.key === "unassigned" ? t("programme.sessionUnassigned") : section.key}
                  </h4>
                  <ul className="plain">
                    {section.players.map((player, index) => (
                      <li
                        key={`${player.name}-${index}`}
                        data-testid="tee-session-player"
                        className="flex min-h-11 items-center justify-between gap-3 text-[16px] leading-6 text-ink"
                      >
                        <span data-testid="tee-session-name" className="min-w-0 break-words">
                          {player.name}
                        </span>
                        {/* The time sits beside the name only when the desk confirmed it. A row
                            with no time belongs under "time not assigned" and prints nothing. */}
                        {player.teeTime !== null && (
                          <b className="shrink-0 font-display text-[17px] leading-6 font-bold tabular-nums text-ink">
                            {fmtTime(player.teeTime)}
                          </b>
                        )}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function PlayerDirectory({ programme }: { programme: PublicProgramme }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = programme.players.filter(
    (player) =>
      !q ||
      player.name.toLowerCase().includes(q) ||
      (player.homeCourse ?? "").toLowerCase().includes(q),
  );

  return (
    <section className="card grid gap-3" id="players">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[20px] leading-7">{t("programme.playersTitle")}</h2>
          <p className="hint m-0">{t("programme.playersIntro")}</p>
        </div>
        <span className="pill">
          {programme.players.length === 1
            ? t("programme.playerCountOne")
            : t("programme.playerCount", { count: programme.players.length })}
        </span>
      </div>

      <input
        type="search"
        className="no-print"
        placeholder={t("programme.findPlayer")}
        aria-label={t("programme.findPlayer")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {matches.length === 0 ? (
        <p className="muted">{t("programme.noPlayerMatch")}</p>
      ) : (
        <ul className="plain player-cards">
          {matches.map((player, index) => (
            <li key={`${player.name}-${index}`} className="player-card">
              <span className="who">
                <Avatar name={player.name} />
                <b className="min-w-0 break-words">{player.name}</b>
              </span>
              <span className="muted text-[13px]">
                {[player.category, player.flight].filter(Boolean).join(" · ") ||
                  t("programme.unflighted")}
              </span>
              <dl className="player-facts">
                <div>
                  <dt>{t("programme.index")}</dt>
                  <dd>{fmtIndex(player.index)}</dd>
                </div>
                {player.homeCourse && (
                  <div>
                    <dt>{t("programme.homeCourse")}</dt>
                    <dd className="min-w-0 break-words text-right">{player.homeCourse}</dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RulesOfPlay({ text }: { text: string }) {
  const { t } = useI18n();
  const paragraphs = text.split(/\n{2,}/);
  return (
    <section className="card grid gap-3" id="rules">
      <div>
        <h2 className="text-[20px] leading-7">{t("programme.rulesTitle")}</h2>
        <p className="hint m-0">{t("programme.rulesIntro")}</p>
      </div>
      <div className="rules-text">
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line">
            {paragraph}
          </p>
        ))}
      </div>
      <Link className="btn ghost justify-self-start no-print" href="/rules?from=pairings">
        Full tournament rules
      </Link>
    </section>
  );
}
