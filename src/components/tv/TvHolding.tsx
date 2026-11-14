"use client";

import { RevealPoller } from "@/components/public/RevealPoller";
import { useRevealCountdown } from "@/components/public/useRevealCountdown";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { useI18n } from "@/lib/i18n/context";
import {
  type BlackoutFlags,
  formatCountdown,
  revealPhase,
  revealPollBaseMs,
  revealSignature,
} from "@/lib/public/results-reveal";
import styles from "./tv.module.css";

/**
 * The clubhouse screen while the results and players are held.
 *
 * The same hold as the public pages, in the board's own layout: the club, the event, the line the
 * room will read, and the countdown when the organizer has set one. It draws no score.
 */
export function TvHoldingView({
  eventName,
  revealAt,
  serverNow,
  held,
}: {
  eventName?: string | null;
  revealAt: string | null;
  serverNow: string | null;
  held: BlackoutFlags;
}) {
  const { t } = useI18n();
  const remaining = useRevealCountdown(revealAt, serverNow);
  const phase = revealPhase({ held: true, remainingMs: revealAt ? remaining : null });

  return (
    <main className={styles.stage}>
      <div className={styles.idle}>
        <p className={styles.idleClub}>Iloilo Golf &amp; Country Club</p>
        <p className={styles.idleEvent}>{eventName ?? "Club tournament"}</p>
        <p className={styles.idleNote}>{t("release.blackoutTitle")}</p>
        {revealAt && (
          <p className={styles.idleCountdown} data-testid="reveal-countdown" aria-live="polite">
            {phase === "due" ? t("release.revealing") : formatCountdown(remaining)}
          </p>
        )}
        <div className={styles.idleBrand}>
          <span className={styles.poweredLabel}>Powered by</span>
          <TeeLineLogo variant="reverse" width={240} className={styles.idleLogo} />
        </div>
        <RevealPoller
          rendered={revealSignature(held, revealAt)}
          baseMs={revealPollBaseMs(remaining)}
        />
      </div>
    </main>
  );
}
