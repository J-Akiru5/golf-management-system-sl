"use client";

import Link from "next/link";
import { Fragment, type KeyboardEvent, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/bits";
import { fmtIso } from "@/lib/data/labels";
import { daySessionBadge, daySessionSummary } from "@/lib/data/sessions";
import type { PublicProgramme, PublicTeeTimeDay, PublicTeeTimePlayer } from "@/lib/data/types";
import { fmtIndex, fmtTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { matchesName } from "@/lib/name-match";
import { manilaToday } from "@/lib/player/dashboard";
import { openingDayNumber } from "@/lib/public/programme-day";
import { orderTeeCards } from "@/lib/public/tee-card-order";

/**
 * The public programme: the day's tee times, the player cards and the organizers' rules of play.
 *
 * It only ever receives the allow-listed `PublicProgramme` object. Names, home club, the frozen
 * index, category, flight and a confirmed start time are the whole vocabulary; contact details,
 * birthdates, gender, notes and photos are not part of the type and cannot leak from here.
 *
 * The pairings stay separate (`PairingsView`) so the pairings page can put them above the tee-time
 * board and the rules, while the roster and the profile have their own pages.
 *
 * Everything here is read one-handed on a phone: the day chips wrap instead of clipping, and every
 * control is at least 44px tall.
 */

const PILL =
  "inline-flex min-h-6 shrink-0 items-center rounded-full border border-line bg-surface-raised px-2 text-[12px] font-semibold whitespace-nowrap text-ink-muted";

interface TimeGroup {
  key: string;
  teeTime: string | null;
  startHole: number | null;
  session: "AM" | "PM" | null;
  players: PublicTeeTimePlayer[];
}

/** One card per confirmed time and hole; everyone not confirmed shares a final card. */
function groupByTime(day: PublicTeeTimeDay, dayIndex: number, dayCount: number): TimeGroup[] {
  const groups = new Map<string, TimeGroup>();
  for (const player of day.players) {
    const key =
      player.teeTime === null
        ? "to-be-confirmed"
        : `${player.teeTime}|${player.startHole ?? "no-hole"}`;
    const session = player.teeTime
      ? daySessionBadge({ dayIndex, dayCount, teeTime: player.teeTime }).session
      : null;
    const group = groups.get(key) ?? {
      key,
      teeTime: player.teeTime,
      startHole: player.startHole,
      session,
      players: [],
    };
    group.players.push(player);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** One player's place on the board, flattened across every day so a search is never day-bound. */
interface SearchRow {
  key: string;
  dayNumber: number;
  dayLabel: string;
  playDate: string;
  teeTime: string | null;
  startHole: number | null;
  name: string;
  mates: string[];
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
  const groups = useMemo(
    () => (day ? orderTeeCards(groupByTime(day, dayIndex, programme.days.length)) : []),
    [day, dayIndex, programme.days.length],
  );
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  // Every player on every day, with the group they tee off with. A search looks across all days,
  // so "when does my buddy play?" is answered even when the buddy plays tomorrow.
  const rows = useMemo(() => {
    const all: SearchRow[] = [];
    programme.days.forEach((item, index) => {
      for (const group of groupByTime(item, index, programme.days.length)) {
        group.players.forEach((player, playerIndex) => {
          all.push({
            key: `${item.dayNumber}|${group.key}|${playerIndex}`,
            dayNumber: item.dayNumber,
            dayLabel: item.label,
            playDate: item.playDate,
            teeTime: group.teeTime,
            startHole: group.startHole,
            name: player.name,
            mates: group.players
              .filter((_, mateIndex) => mateIndex !== playerIndex)
              .map((mate) => mate.name),
          });
        });
      }
    });
    return all;
  }, [programme.days]);

  const results = useMemo(() => {
    if (!searching) return [];
    const order = (row: SearchRow) =>
      [
        String(row.dayNumber).padStart(3, "0"),
        row.teeTime ?? "99:99",
        String(row.startHole ?? 99).padStart(2, "0"),
        row.name,
      ].join("|");
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
                  <span className="flex flex-wrap items-center gap-1.5">
                    {row.teeTime !== null && (
                      <b className="font-display text-[20px] leading-6 font-bold tabular-nums text-ink">
                        {fmtTime(row.teeTime)}
                      </b>
                    )}
                    {row.teeTime !== null && row.startHole !== null && (
                      <span className={PILL}>{t("programme.hole", { hole: row.startHole })}</span>
                    )}
                  </span>
                </div>
                <p className="m-0 text-[16px] leading-6 text-ink">
                  <HighlightedName name={row.name} query={query} />
                </p>
                {row.mates.length > 0 && (
                  <p className="hint m-0">
                    {t("programme.withGroup", { names: row.mates.join(", ") })}
                  </p>
                )}
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

          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="m-0 text-[17px] leading-6">
              {day.label} · {fmtIso(day.playDate)}
            </h3>
            <span className="hint m-0">
              {daySessionSummary(dayIndex, programme.days.length)}
              {day.startTime
                ? ` · ${t("programme.dayStart", { time: fmtTime(day.startTime) })}`
                : null}
            </span>
          </div>

          {groups.length === 0 ? (
            <p className="muted">{t("programme.noPlayersDay")}</p>
          ) : (
            <div className="tee-slots">
              {groups.map((group) => (
                <article key={group.key} className="tee-slot" data-testid="tee-time-group">
                  {/* A time the desk has not confirmed is not shown at all: no placeholder, and
                      no head row to leave a gap. */}
                  {group.teeTime !== null && (
                    <div className="tee-slot-head flex-wrap">
                      <b className="font-display text-[22px] leading-7 font-bold tabular-nums text-ink">
                        {fmtTime(group.teeTime)}
                      </b>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {group.session && <span className={PILL}>{group.session}</span>}
                        {group.startHole !== null && (
                          <span className={PILL}>
                            {t("programme.hole", { hole: group.startHole })}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  <ul className="plain space-y-1">
                    {group.players.map((player, index) => (
                      <li
                        key={`${player.name}-${index}`}
                        className="flex min-h-11 items-center text-[16px] leading-6 text-ink"
                      >
                        <span className="min-w-0 break-words">{player.name}</span>
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
