"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { HelpButton } from "@/components/help";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { PublicBottomBar } from "@/components/MobileTabBar";
import { HeldNotice } from "@/components/public/HeldNotice";
import { PublicAdvisoryBanner } from "@/components/public/PublicAdvisoryBanner";
import { PublicBackLink } from "@/components/public/PublicBackLink";
import { PublicTournamentNav } from "@/components/public/PublicTournamentNav";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { filterRoster, rosterFlights } from "@/lib/data/public";
import { publicTabHref } from "@/lib/data/public-tabs";
import type { PublicRosterPlayer } from "@/lib/data/types";
import { fmtIndex } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import type { PublicAdvisory } from "@/lib/public/advisory";

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

export type RosterUnavailable = "none" | "unpublished" | "held" | "failed";

const PRIVACY_NOTICE =
  "Name, home club, handicap index, category and flight only. Nothing else from the player record is shown.";

export function RosterPage({
  players,
  unavailable = "none",
  advisory = null,
  holding = null,
}: {
  players: PublicRosterPlayer[];
  unavailable?: RosterUnavailable;
  advisory?: PublicAdvisory | null;
  /** What to show while the desk is holding the player list. Defaults to the held notice. */
  holding?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <main className="public public-pairings mobile-bar-space">
      <header className="public-head public-appbar p-4 sm:p-5">
        <PublicBackLink label={t("pairings.backHome")} />
        <div className="public-appbar-controls flex items-center gap-2">
          <ThemeToggle compact tone="nav" />
          <LanguageSwitcher tone="on-forest" />
          <HelpButton audience="player" screen="pairings" />
        </div>
        <div className="appbar-foot">
          <div className="public-appbar-brand flex flex-wrap items-center gap-3">
            <TeeLineLogo variant="reverse" width={144} />
            <span className="leading-tight">
              <span className="text-xs text-on-forest-muted">Iloilo Golf &amp; Country Club</span>
            </span>
          </div>
          <div className="appbar-title">
            <h1 className="font-serif text-[25px] leading-8 font-semibold !text-on-forest sm:text-[40px] sm:leading-[44px] lg:text-[52px] lg:leading-[56px]">
              {t("programme.playersTitle")}
            </h1>
            <p className="text-on-forest-muted">{t("programme.playersIntro")}</p>
          </div>
        </div>
      </header>

      {advisory && <PublicAdvisoryBanner advisory={advisory} />}

      <PublicTournamentNav active="players" />

      {unavailable !== "held" && (
        <p className="notice no-print" data-testid="roster-privacy">
          {PRIVACY_NOTICE}
        </p>
      )}

      {unavailable === "failed" ? (
        <div className="notice grid gap-3" role="status" data-testid="roster-failed">
          <p className="m-0">
            <b>{t("pairings.failedTitle")}</b> {t("pairings.failedBody")}
          </p>
          <a className="btn ghost no-print justify-self-start" href="/roster">
            {t("pairings.retry")}
          </a>
        </div>
      ) : unavailable === "held" ? (
        (holding ?? <HeldNotice testId="roster-held" />)
      ) : unavailable === "unpublished" ? (
        <section className="pairings-empty" role="status" data-testid="roster-empty">
          <h2>{t("pairings.notOutTitle")}</h2>
          <p>{t("pairings.notOutBody")}</p>
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

      <nav className="site-foot-nav no-print" aria-label="Footer">
        <Link href="/pairings">{t("programme.navPairings")}</Link>
        <span aria-hidden="true">·</span>
        <Link href="/rules">{t("programme.navFullRules")}</Link>
        <span aria-hidden="true">·</span>
        <Link href="/">{t("pairings.home")}</Link>
      </nav>
      <PublicBottomBar />
    </main>
  );
}

/**
 * The flight's colour, from its place in the roster: the same four tones the pairing cards use, so a
 * member reads a flight as one colour across both lists.
 */
function flightTone(flights: string[], flight: string): number {
  const index = flights.indexOf(flight);
  return index < 0 ? 0 : index % 4;
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
            className="p-search no-print"
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
            className="lb-select no-print"
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
        <ul className="plain player-cards roster-cards" data-testid="roster-list">
          {matches.map((player, index) => {
            const href = player.id ? publicTabHref("profile", { player: player.id }) : null;
            // The name holds the left and the index the far right, the way a pairing card holds its
            // hole and tee time; the class line sits under both with the flag beside it.
            const content = (
              <>
                <span className="player-card-top">
                  <b className="player-card-name">{player.name}</b>
                  <span className="player-card-index">
                    <span className="player-card-index-label">{t("programme.index")}</span>
                    {fmtIndex(player.index)}
                  </span>
                  <span className="player-card-class">
                    {[player.category, player.flight].filter(Boolean).join(" · ") ||
                      t("programme.unflighted")}
                  </span>
                </span>
                {player.homeCourse && (
                  <span className="player-card-row">
                    <span className="player-card-row-label">{t("programme.homeCourse")}</span>
                    <span className="player-card-row-value">{player.homeCourse}</span>
                  </span>
                )}
                {href && (
                  <>
                    {/* Holds the button off the last line and pins it to the card's foot, so every
                        card in a row presses at the same height. */}
                    <span className="player-card-gap" aria-hidden="true" />
                    <span className="player-card-foot">
                      {t("programme.viewScores")}
                      <ChevronRight aria-hidden="true" />
                    </span>
                  </>
                )}
                {/* The club's flag, the same mark the pairing cards carry, set into the card's face. */}
                <svg
                  className="player-card-golf"
                  viewBox="0 0 48 48"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M9 44V4" />
                  <path d="M9 6c9-4 9 4 18 0 6-2.6 7-3.2 12-4v14c-5 .8-6 1.4-12 4-9 4-9-4-18 0Z" />
                  <circle cx="23" cy="38" r="1.6" />
                </svg>
              </>
            );
            return (
              <li key={player.id ?? `${player.name}-${index}`}>
                {href ? (
                  <Link
                    href={href}
                    className="player-card player-card-link"
                    data-tone={player.flight ? flightTone(flights, player.flight) : undefined}
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    className="player-card"
                    data-tone={player.flight ? flightTone(flights, player.flight) : undefined}
                  >
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
