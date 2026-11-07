"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import styles from "@/app/(public)/join/join.module.css";
import { useI18n } from "@/lib/i18n/context";

export interface JoinQrProps {
  /** `NEXT_PUBLIC_SITE_URL`, already trimmed and stripped of trailing slashes. */
  configuredSiteUrl?: string;
}

/**
 * The code the desk points players at.
 *
 * The configured site URL wins whenever it is set, because the desk is often run on localhost while
 * the players are on the deployed domain. Only when no URL is configured does the browser's origin
 * become the target, and that can only be read on the client: the first server render shows an
 * empty box of the same size, so nothing jumps when the code appears.
 */
export function JoinQr({ configuredSiteUrl }: JoinQrProps) {
  const { t } = useI18n();
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (configuredSiteUrl) return;
    setOrigin(window.location.origin);
  }, [configuredSiteUrl]);

  const url = configuredSiteUrl || origin;

  return (
    <figure className={styles.qrFigure} data-qr-url={url}>
      <div className={styles.qrBox}>
        {url ? (
          <div className={styles.qrCode} role="img" aria-label={t("onboard.join.qrLabel")}>
            <QRCodeSVG value={url} size={168} level="M" />
          </div>
        ) : (
          <span className={styles.qrPlaceholder} aria-hidden="true" />
        )}
      </div>
      <figcaption className={styles.qrUrl}>
        <span className={styles.qrUrlLabel}>{t("onboard.join.urlLabel")}</span>
        <span className={styles.qrUrlText}>{url || "\u00a0"}</span>
      </figcaption>
    </figure>
  );
}

/**
 * Printing is a browser action, so it lives beside the code rather than in the server page. The
 * sheet itself is the card; the button and its hint are hidden in the print stylesheet.
 */
export function JoinPrintButton() {
  const { t } = useI18n();

  return (
    <div className={styles.printActions}>
      <button type="button" className={`btn ${styles.printButton}`} onClick={() => window.print()}>
        {t("onboard.join.print")}
      </button>
      <p className={`hint ${styles.printHint}`}>{t("onboard.join.printHint")}</p>
    </div>
  );
}
