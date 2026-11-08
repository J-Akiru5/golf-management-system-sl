"use client";

import Link from "next/link";
import { useState } from "react";
import { searchProfilePlayers } from "@/lib/data/public-profile";
import { publicTabHref } from "@/lib/data/public-tabs";
import type { PublicPlayerProfile } from "@/lib/data/types";
import { useI18n } from "@/lib/i18n/context";

/**
 * The search on the profile tab. It keeps the selected player in the URL, so the server can load
 * only that player's frozen card and a shared link opens the same profile.
 */
export function PlayerProfileSearch({
  players,
  selectedId,
}: {
  players: PublicPlayerProfile[];
  selectedId: string | null;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const matches = searchProfilePlayers(players, query);

  return (
    <section className="card grid gap-3" aria-labelledby="profile-search-heading">
      <div>
        <h2 id="profile-search-heading" className="text-[20px] leading-7">
          {t("programme.profileTitle")}
        </h2>
        <p className="hint m-0">{t("programme.profileIntro")}</p>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="hint">{t("programme.findPlayer")}</span>
        <input
          type="search"
          className="no-print"
          placeholder={t("programme.findPlayer")}
          aria-label={t("programme.findPlayer")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          data-testid="profile-search"
        />
      </label>

      {query.trim() === "" ? (
        <p className="muted">{t("programme.profileSearchPrompt")}</p>
      ) : matches.length === 0 ? (
        <p className="muted" role="status">
          {t("programme.noPlayerMatch")}
        </p>
      ) : (
        <ul className="plain grid gap-1" data-testid="profile-results">
          {matches.map((player) => {
            const current = player.id === selectedId;
            return (
              <li key={player.id}>
                <Link
                  href={publicTabHref("profile", { player: player.id })}
                  aria-current={current ? "page" : undefined}
                  className={`flex min-h-11 items-center justify-between gap-3 rounded-[12px] border px-3 no-underline ${
                    current
                      ? "border-forest bg-fairway-soft text-ink"
                      : "border-line bg-surface-raised text-ink hover:bg-fairway-soft"
                  }`}
                >
                  <span className="min-w-0 break-words font-semibold">{player.name}</span>
                  <span className="shrink-0 text-[12px] text-ink-muted">
                    {[player.flight, player.category].filter(Boolean).join(" · ") ||
                      t("programme.unflighted")}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
