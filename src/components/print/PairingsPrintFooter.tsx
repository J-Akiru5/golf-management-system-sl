"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";

export interface PairingsPrintFooterProps {
  eventName: string;
}

/**
 * The paper's link back to the live list. It is hidden on screen and prints at the foot of the
 * notice-board sheet, so a copy on a wall can always be checked against the current pairings.
 */
export function PairingsPrintFooter({ eventName }: PairingsPrintFooterProps) {
  const { t } = useI18n();
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "";
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (configured) return;
    setOrigin(window.location.origin);
  }, [configured]);

  const url = configured || origin;

  return (
    <aside className="p2-print-only p2-print-qr">
      <div className="p2-print-qr-text">
        <b>{eventName}</b>
        <span>{t("pairings.scanLive")}</span>
        {url && <span className="p2-print-qr-url">{url}/pairings</span>}
      </div>
      {url ? (
        <QRCodeSVG value={`${url}/pairings`} size={104} level="M" marginSize={1} />
      ) : null}
    </aside>
  );
}
