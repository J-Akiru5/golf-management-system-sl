"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/bits";
import type { PublicProgramme } from "@/lib/data/types";
import { fmtIndex } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { matchesText } from "@/lib/names";

/**
 * The public programme: the player cards and the organizers' rules of play.
 *
 * It only ever receives the allow-listed `PublicProgramme` object. Names, home club, the frozen
 * index, category, flight and a confirmed start time are the whole vocabulary; contact details,
 * birthdates, gender, notes and photos are not part of the type and cannot leak from here.
 *
 * The pairings stay separate (`PairingsView`) so the pairings page can put the groups above the
 * rules, while the roster and the profile have their own pages. Everything here is read one-handed
 * on a phone, so every control is at least 44px tall.
 */

export function PlayerDirectory({ programme }: { programme: PublicProgramme }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const matches = programme.players.filter((player) =>
    matchesText([player.name, player.homeCourse], query),
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
