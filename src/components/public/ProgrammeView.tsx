"use client";

import Link from "next/link";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/bits";
import { fmtIso } from "@/lib/data/labels";
import { daySessionBadge, daySessionSummary } from "@/lib/data/sessions";
import type { PublicProgramme, PublicTeeTimeDay } from "@/lib/data/types";
import { fmtIndex, fmtTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

/**
 * The public programme: the day's tee times, the player cards and the organizers' rules of play.
 *
 * It only ever receives the allow-listed `PublicProgramme` object. Names, home club, the frozen
 * index, category, flight and a confirmed start time are the whole vocabulary; contact details,
 * birthdates, gender, notes and photos are not part of the type and cannot leak from here.
 *
 * The pairings stay separate (`PairingsView`) so the page can put them between the player cards and
 * the rules, in the order players asked for.
 *
 * Everything here is read one-handed on a phone: the jump links and the day chips scroll sideways
 * instead of wrapping into several rows, and every control is at least 44px tall.
 */

const NAV_LINK =
  "inline-flex min-h-11 shrink-0 items-center rounded-full border border-line bg-surface-raised px-3.5 text-sm font-semibold whitespace-nowrap text-ink no-underline hover:bg-fairway-soft";
const PILL =
  "inline-flex min-h-6 shrink-0 items-center rounded-full border border-line bg-surface-raised px-2 text-[12px] font-semibold whitespace-nowrap text-ink-muted";

export function ProgrammeNav({
  programme,
  hasPairings,
}: {
  programme: PublicProgramme;
  hasPairings: boolean;
}) {
  const { t } = useI18n();
  const showRules = programme.rulesOfPlay !== null;
  return (
    <nav
      className="no-print flex w-full min-w-0 gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible"
      aria-label={t("programme.navLabel")}
    >
      {hasPairings && (
        <a className={NAV_LINK} href="#pairings">
          {t("programme.navPairings")}
        </a>
      )}
      {programme.days.length > 0 && (
        <a className={NAV_LINK} href="#tee-times">
          {t("programme.navTeeTimes")}
        </a>
      )}
      {programme.players.length > 0 && (
        <a className={NAV_LINK} href="#players">
          {t("programme.navPlayers")}
        </a>
      )}
      {showRules && (
        <a className={NAV_LINK} href="#rules">
          {t("programme.navRules")}
        </a>
      )}
      <Link className={NAV_LINK} href="/rules">
        {t("programme.navFullRules")}
      </Link>
    </nav>
  );
}

interface TimeGroup {
  key: string;
  teeTime: string | null;
  startHole: number | null;
  session: "AM" | "PM" | null;
  names: string[];
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
      names: [],
    };
    group.names.push(player.name);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function TeeTimesBoard({ programme }: { programme: PublicProgramme }) {
  const { t } = useI18n();
  const firstDay = programme.days[0]?.dayNumber ?? 1;
  const [selected, setSelected] = useState(firstDay);
  const day = programme.days.find((item) => item.dayNumber === selected) ?? programme.days[0];
  const dayIndex = day ? programme.days.findIndex((item) => item.dayNumber === day.dayNumber) : -1;
  const groups = useMemo(
    () => (day ? groupByTime(day, dayIndex, programme.days.length) : []),
    [day, dayIndex, programme.days.length],
  );
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);

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

      {!day ? (
        <p className="muted">{t("programme.noDays")}</p>
      ) : (
        <>
          <div
            className="no-print flex w-full min-w-0 gap-2 overflow-x-auto pb-1"
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
                : ` · ${t("programme.dayStartUnknown")}`}
            </span>
          </div>

          {groups.length === 0 ? (
            <p className="muted">{t("programme.noPlayersDay")}</p>
          ) : (
            <div className="tee-slots">
              {groups.map((group) => (
                <article key={group.key} className="tee-slot" data-testid="tee-time-group">
                  <div className="tee-slot-head flex-wrap">
                    <b
                      className={
                        group.teeTime
                          ? "font-display text-[22px] leading-7 font-bold tabular-nums text-ink"
                          : "font-display text-[15px] leading-6 font-semibold text-ink-muted"
                      }
                    >
                      {group.teeTime ? fmtTime(group.teeTime) : t("programme.toBeConfirmed")}
                    </b>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {group.session && <span className={PILL}>{group.session}</span>}
                      {group.teeTime && group.startHole !== null && (
                        <span className={PILL}>
                          {t("programme.hole", { hole: group.startHole })}
                        </span>
                      )}
                    </span>
                  </div>
                  <ul className="plain space-y-1">
                    {group.names.map((name, index) => (
                      <li
                        key={`${name}-${index}`}
                        className="flex min-h-11 items-center text-[16px] leading-6 text-ink"
                      >
                        <span className="min-w-0 break-words">{name}</span>
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
      <Link className="btn ghost justify-self-start no-print" href="/rules">
        Full tournament rules
      </Link>
    </section>
  );
}
