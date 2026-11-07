"use client";

import { useState } from "react";
import { Avatar } from "@/components/bits";
import type { PublicPairingGroup, PublicPairings } from "@/lib/data/types";
import { fmtTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { publicPhotoUrl } from "@/lib/photo";

/**
 * Player-facing pairings: names, flight, hole and time only. Built from an allow-listed
 * `PublicPairings` object, never from player or registration records. Used by the public page and
 * by the organizer's publish preview, so what they check is what players get.
 *
 * When the snapshot carries playing days, the list is drawn in day sections, so a two-day event
 * reads as day 1 then day 2 instead of two group 1s in one list. The day labels are the event's own
 * labels, not new copy.
 *
 * The words come from the i18n context. Outside the player/public layouts (the desk's publish
 * preview) the context falls back to English, which is what the organizer expects there.
 */
export function PairingsView({
  pairings,
  searchable = true,
  headingLevel = "group",
  flightFilter = false,
}: {
  pairings: PublicPairings;
  searchable?: boolean;
  /** Adds a flight dropdown beside the name search. */
  flightFilter?: boolean;
  /** "group" inside a dialog, "section" when it is the page's main content. */
  headingLevel?: "group" | "section";
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [flight, setFlight] = useState("");
  const q = query.trim().toLowerCase();
  const flights = [...new Set(pairings.groups.map((g) => g.flight))].sort();
  const matches = (g: PublicPairingGroup) =>
    (!flight || g.flight === flight) &&
    (!q || g.players.some((player) => player.name.toLowerCase().includes(q)));
  const groups = pairings.groups.filter(matches);
  // One day needs no heading; a multi-day event is split so two group 1s never read as one list.
  const daySections =
    pairings.days && pairings.days.length > 1
      ? pairings.days
          .map((day) => ({ ...day, groups: day.groups.filter(matches) }))
          .filter((day) => day.groups.length > 0)
      : null;
  const shotgun = pairings.startFormat === "shotgun";

  const groupLabel = (startHole: number) => {
    if (!shotgun) return t("pairings.groupTee", { hole: startHole });
    return t("pairings.groupHole", { hole: startHole });
  };

  const renderGroup = (g: PublicPairingGroup) => (
    <article key={`${g.dayNumber ?? 1}-${g.number}`} className="group">
      <div className="group-head">
        <b>{groupLabel(g.startHole)}</b>
        <span className="mono">{fmtTime(g.time)}</span>
      </div>
      {g.players.map((player) => {
        const hit = q && player.name.toLowerCase().includes(q);
        const photo = publicPhotoUrl(player.photoPath);
        return (
          <div
            key={`${g.dayNumber ?? 1}-${g.number}-${player.id ?? player.name}`}
            className={`slot${hit ? " hit" : ""}`}
          >
            <span className="who">
              <Avatar name={player.name} photo={photo} />
              <span>{player.name}</span>
            </span>
          </div>
        );
      })}
      <div className="slot muted">
        {headingLevel === "section" ? <span className="small-h">{g.flight}</span> : g.flight}
      </div>
    </article>
  );

  return (
    <>
      {searchable && (
        <div className="row no-print">
          <input
            type="search"
            className="grow"
            data-help="pairings-search"
            placeholder={t("pairings.findName")}
            aria-label={t("pairings.findName")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {flightFilter && flights.length > 1 && (
            <select
              aria-label={t("pairings.filterFlight")}
              data-help="pairings-flight"
              value={flight}
              onChange={(e) => setFlight(e.target.value)}
            >
              <option value="">{t("pairings.allFlights")}</option>
              {flights.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
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
      {daySections ? (
        <div className="grid gap-5" data-help="pairings-groups">
          {daySections.map((day) => (
            <section key={day.dayNumber} className="grid gap-3">
              <div>
                <h3 className="text-[17px] leading-6">{day.label}</h3>
                {day.playDate && <span className="hint">{day.playDate}</span>}
              </div>
              <div className="groups">{day.groups.map(renderGroup)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="groups" data-help="pairings-groups">
          {groups.map(renderGroup)}
        </div>
      )}
      {groups.length === 0 && <p className="muted">{t("pairings.noMatch")}</p>}
    </>
  );
}
