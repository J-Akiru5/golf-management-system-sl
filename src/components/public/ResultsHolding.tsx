"use client";

import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/context";
import {
  type BlackoutFlags,
  formatCountdown,
  revealPhase,
  revealPollBaseMs,
  revealSignature,
} from "@/lib/public/results-reveal";
import { RevealPoller } from "./RevealPoller";
import { useRevealCountdown } from "./useRevealCountdown";

/**
 * The public answer while the results and players are held for the awarding.
 *
 * It carries no score, name or photo: the page it replaces fetched none of them. When the organizer
 * has stored a reveal time the screen counts down to it; when the time passes the poller asks the
 * server for a fresh render, and the results appear only because the database has released them.
 */
export function ResultsHolding({
  revealAt,
  serverNow,
  held,
}: {
  revealAt: string | null;
  /** The server's clock at render, or null in the demo, which has no server clock to trust. */
  serverNow: string | null;
  /** The blackout keys as the page rendered them, for the poll's change detection. */
  held: BlackoutFlags;
}) {
  const { t } = useI18n();
  const remaining = useRevealCountdown(revealAt, serverNow);
  const phase = revealPhase({ held: true, remainingMs: revealAt ? remaining : null });
  const counting = revealAt !== null;

  return (
    <section className="pairings-empty" role="status" data-testid="results-holding">
      <LockKeyhole className="mx-auto mb-2 size-7 text-ink-muted" aria-hidden="true" />
      <h2>{t("release.blackoutTitle")}</h2>
      <p>{t("release.blackoutBody")}</p>

      {counting && (
        <div className="reveal-countdown" data-testid="reveal-countdown">
          {phase === "due" ? (
            <p className="reveal-countdown-label">{t("release.revealing")}</p>
          ) : (
            <>
              <p className="reveal-countdown-label">{t("release.countdownLabel")}</p>
              <p className="reveal-countdown-value" aria-live="polite">
                {formatCountdown(remaining)}
              </p>
            </>
          )}
        </div>
      )}

      {counting && <p className="hint m-0">{t("release.countdownNote")}</p>}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <a className="btn ghost no-print" href="">
          {t("pairings.checkAgain")}
        </a>
        <Link className="btn ghost no-print" href="/">
          {t("pairings.home")}
        </Link>
      </div>

      <RevealPoller
        rendered={revealSignature(held, revealAt)}
        baseMs={revealPollBaseMs(remaining)}
      />
    </section>
  );
}
