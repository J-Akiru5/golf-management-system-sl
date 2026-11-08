"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/bits";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { PlayerBottomBar } from "@/components/MobileTabBar";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { filterRoster, rosterFlights } from "@/lib/data/public";
import type { PublicRosterPlayer } from "@/lib/data/types";
import { fmtIndex } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

/**
 * The public player roster.
 *
 * It receives `PublicRosterPlayer[]` and nothing else: name, home club, frozen index, category and
 * flight are the whole vocabulary. Tee times, start holes, groups, pairings, contact details,
 * birthdate, gender, notes and photo paths are not part of the type, so this page cannot show them
 * even if a richer record exists on the server.
 *
 * An unpublished event or a failed read renders the privacy notice and an empty state only. The list
 * itself is never filled from a private table.
 */

export type RosterUnavailable = "none" | "unpublished" | "failed";

const PRIVACY_NOTICE =
  "Name, home club, handicap index, category and flight only. Nothing else from the player record is shown.";

export function RosterPage({
  players,
  unavailable = "none",
}: {
  players: PublicRosterPlayer[];
  unavailable?: RosterUnavailable;
}) {
  const { t } = useI18n();
  return (
    <main className="public public-pairings mobile-bar-space">
      <header className="public-head !p-4 sm:!p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <TeeLineLogo variant="reverse" width={144} />
            <span className="leading-tight">
              <b className="block font-display text-[13px] font-semibold">
                {t("programme.playersTitle")}
              </b>
              <span className="text-xs text-on-forest-muted">Iloilo Golf &amp; Country Club</span>
            </span>
          </div>
          <LanguageSwitcher tone="on-forest" />
        </div>
        <h1 className="font-serif text-[25px] leading-8 font-semibold !text-on-forest sm:text-[40px] sm:leading-[44px] lg:text-[52px] lg:leading-[56px]">
          Player roster
        </h1>
        <p className="text-on-forest-muted">{t("programme.playersIntro")}</p>
      </header>

      <p className="notice no-print" data-testid="roster-privacy">
        {PRIVACY_NOTICE}
      </p>

      {unavailable === "failed" ? (
        <div className="notice grid gap-3" role="status" data-testid="roster-failed">
          <p className="m-0">
            <b>{t("pairings.failedTitle")}</b> {t("pairings.failedBody")}
          </p>
          <a className="btn ghost no-print justify-self-start" href="/roster">
            {t("pairings.retry")}
          </a>
        </div>
      ) : unavailable === "unpublished" ? (
        <section className="pairings-empty" role="status" data-testid="roster-empty">
          <h2>The player roster is not out yet.</h2>
          <p>The roster appears when the organizers publish the event.</p>
          <Link className="btn ghost no-print" href="/pairings">
            {t("programme.navPairings")}
          </Link>
        </section>
      ) : players.length === 0 ? (
        <section className="pairings-empty" role="status" data-testid="roster-empty">
          <h2>No confirmed players yet.</h2>
          <p>The roster appears when the organizers confirm the field.</p>
        </section>
      ) : (
        <RosterDirectory players={players} />
      )}

      <p className="hint no-print">
        <Link href="/pairings">{t("programme.navPairings")}</Link> ·{" "}
        <Link href="/">{t("pairings.home")}</Link>
      </p>
      <PlayerBottomBar />
    </main>
  );
}

function RosterDirectory({ players }: { players: PublicRosterPlayer[] }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [flight, setFlight] = useState("");
  const flights = useMemo(() => rosterFlights(players), [players]);
  const matches = useMemo(() => filterRoster(players, { query, flight }), [players, query, flight]);

  return (
    <section className="card grid gap-3" aria-labelledby="roster-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="roster-heading" className="text-[20px] leading-7">
            {t("programme.playersTitle")}
          </h2>
          <p className="hint m-0">{t("programme.playersIntro")}</p>
        </div>
        <span className="pill">
          {matches.length === 1
            ? t("programme.playerCountOne")
            : t("programme.playerCount", { count: matches.length })}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] sm:items-end">
        <div className="grid gap-2">
          <input
            type="search"
            className="no-print"
            placeholder={t("programme.findPlayer")}
            aria-label={t("programme.findPlayer")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-testid="roster-search"
          />
          {query !== "" && (
            <button
              type="button"
              className="btn ghost justify-self-start no-print"
              onClick={() => setQuery("")}
            >
              {t("pairings.clearQuery")}
            </button>
          )}
        </div>
        <label className="grid gap-1 text-sm">
          <span className="hint">{t("pairings.filterFlight")}</span>
          <select
            className="no-print"
            value={flight}
            onChange={(event) => setFlight(event.target.value)}
            data-testid="roster-flight"
          >
            <option value="">{t("pairings.allFlights")}</option>
            {flights.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {matches.length === 0 ? (
        <p className="muted" role="status">
          {t("pairings.noMatch")}
        </p>
      ) : (
        <ul className="plain player-cards" data-testid="roster-list">
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
