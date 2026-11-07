"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/bits";
import { TextSizeToggle } from "@/components/player/TextSizeToggle";
import type { PublicPairingPlayer, PublicPairings } from "@/lib/data/types";
import { fmtTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { publicPhotoUrl } from "@/lib/photo";

/** The signed-in player, when the page could work out who is reading. */
export interface PairingsYou {
  /** The player record id, or null when the account is linked by name only. */
  id: string | null;
  name: string;
}

/** "Reyes, Ana" and "Ana Reyes" are the same person: compare the words, not the punctuation. */
function nameKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function groupAnchor(number: number): string {
  return `pairing-group-${number}`;
}

/**
 * Player-facing pairings: names, flight, hole and time only. Built from an allow-listed
 * `PublicPairings` object, never from player or registration records. Used by the public page and
 * by the organizer's publish preview, so what they check is what players get.
 *
 * The words come from the i18n context. Outside the player/public layouts (the desk's publish
 * preview) the context falls back to English, which is what the organizer expects there.
 *
 * On a phone the search and print controls sit in a sticky bar so a player can find their name
 * without scrolling back to the top, and their own group is marked so it is visible at a glance.
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
  const [focusRequest, setFocusRequest] = useState<{ number: number; seq: number } | null>(null);
  const [notListed, setNotListed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const q = query.trim().toLowerCase();
  const flights = [...new Set(pairings.groups.map((g) => g.flight))].sort();
  const groups = pairings.groups.filter(
    (g) =>
      (!flight || g.flight === flight) &&
      (!q || g.players.some((player) => player.name.toLowerCase().includes(q))),
  );
  const shotgun = pairings.startFormat === "shotgun";

  const youKey = you?.name ? nameKey(you.name) : "";
  const isYou = (player: PublicPairingPlayer) =>
    you !== null &&
    ((you.id !== null && player.id === you.id) ||
      (youKey !== "" && nameKey(player.name) === youKey));
  const ownGroup =
    you !== null ? (pairings.groups.find((group) => group.players.some(isYou)) ?? null) : null;

  // Scroll after the render that added the group, not before it exists.
  useEffect(() => {
    if (!focusRequest) return;
    const target = document.getElementById(groupAnchor(focusRequest.number));
    if (!target) return;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Center the card: the sticky toolbar's height changes with the flight filter and the
    // safe-area inset, so "start" could leave the tee time hidden behind it.
    target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [focusRequest]);

  const groupLabel = (startHole: number) => {
    if (!shotgun) return t("pairings.groupTee", { hole: startHole });
    return t("pairings.groupHole", { hole: startHole });
  };

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
    setQuery((own?.name ?? you.name).trim());
    seq.current += 1;
    setFocusRequest({ number: ownGroup.number, seq: seq.current });
  };

  const clearSearch = () => {
    setQuery("");
    setFlight("");
    setFocusRequest(null);
    setNotListed(false);
    searchRef.current?.focus();
  };

  const timeClass = "m-0 font-display text-[24px] leading-7 font-bold tabular-nums";

  return (
    <>
      {searchable && (
        <div
          className="no-print sticky top-0 z-30 grid gap-2 border-b border-line bg-surface-raised/95 px-2 pb-2 backdrop-blur-sm [padding-top:max(env(safe-area-inset-top,0px),8px)]"
          data-testid="pairings-toolbar"
        >
          <input
            ref={searchRef}
            type="search"
            className="w-full text-[16px]"
            data-help="pairings-search"
            placeholder={t("pairings.findName")}
            aria-label={t("pairings.findName")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setFocusRequest(null);
              setNotListed(false);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            {flightFilter && flights.length > 1 && (
              <select
                aria-label={t("pairings.filterFlight")}
                data-help="pairings-flight"
                className="h-11 min-w-0 flex-1 basis-40"
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
            <button type="button" className="btn ghost" onClick={findMe}>
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
            <TextSizeToggle className="min-h-11" />
          </div>
          {notListed && (
            <p className="m-0 text-[13px] leading-5 text-ink-muted" role="status">
              {t("pairings.noOwnGroup")}
            </p>
          )}
        </div>
      )}

      <div className="groups" data-help="pairings-groups">
        {groups.map((g) => {
          const own = ownGroup !== null && ownGroup.number === g.number;
          const highlighted = focusRequest !== null && focusRequest.number === g.number;
          return (
            <article
              // A new key restarts the one-off flash when Find me is pressed again.
              key={
                own && highlighted && focusRequest ? `${g.number}-${focusRequest.seq}` : g.number
              }
              id={groupAnchor(g.number)}
              data-testid="pairing-group"
              data-own={own ? "true" : undefined}
              className={`group relative [scroll-margin-top:7.5rem]${own ? " bg-gold-soft" : ""}${
                own && highlighted ? " flash outline-2 outline-gold" : ""
              }`}
            >
              {own && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1 bg-gold"
                />
              )}
              <div className="group-head">
                <div className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  {headingLevel === "section" ? (
                    <h3 className={timeClass}>{fmtTime(g.time)}</h3>
                  ) : (
                    <b className={timeClass}>{fmtTime(g.time)}</b>
                  )}
                  <span className="pill">{groupLabel(g.startHole)}</span>
                  <span className="pill">{g.flight}</span>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 text-[12px] text-ink-muted">
                  <span>
                    {g.players.length === 1
                      ? t("pairings.groupCountOne")
                      : t("pairings.groupCount", { count: g.players.length })}
                  </span>
                  {own && (
                    <span className="inline-flex min-h-6 items-center rounded-full bg-gold px-2 text-[11px] font-bold tracking-wide uppercase text-on-gold">
                      {t("pairings.ownGroup")}
                    </span>
                  )}
                </div>
              </div>
              {g.players.map((player) => {
                const hit = q && player.name.toLowerCase().includes(q);
                const mine = isYou(player);
                const photo = publicPhotoUrl(player.photoPath);
                return (
                  <div
                    key={`${g.number}-${player.id ?? player.name}`}
                    className={`slot${hit ? " hit" : ""}`}
                    data-you={mine ? "true" : undefined}
                  >
                    <span className="who">
                      <Avatar name={player.name} photo={photo} />
                      <span className="min-w-0 break-words">
                        <span className={mine ? "font-bold" : undefined}>{player.name}</span>
                        {mine && (
                          <span className="ml-2 inline-flex min-h-6 items-center rounded-full bg-gold px-2 align-middle text-[11px] font-bold tracking-wide uppercase text-on-gold">
                            {t("pairings.you")}
                          </span>
                        )}
                      </span>
                    </span>
                  </div>
                );
              })}
            </article>
          );
        })}
      </div>

      {groups.length === 0 && (
        <div className="grid justify-items-start gap-3 rounded-[14px] border border-dashed border-line-strong px-4 py-6">
          <p className="m-0 text-ink-muted">{t("pairings.noMatch")}</p>
          {(q || flight) && (
            <button type="button" className="btn ghost" onClick={clearSearch}>
              {t("pairings.clearSearch")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
