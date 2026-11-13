"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { manilaToday } from "@/lib/player/dashboard";
import type { PublicAdvisory } from "@/lib/public/advisory";

/**
 * The organizer's advisory, shown above the page content.
 *
 * It is an inline panel, not a dialog or an overlay, so it can never cover the pairings or trap a
 * tap. The text is always open, on a phone as well as a desktop: most of the club's players are
 * older and a notice that has to be tapped open is one they never read. Tapping the cross hides it
 * for the rest of that calendar day in the club's time zone; tomorrow it shows again, unless the
 * organizer's text has changed, in which case it shows straight away. The dismissal lives in
 * localStorage only, so nothing reaches the organizer's records.
 */
const DISMISS_KEY = "teeline:advisory-dismissed";

function advisoryId(advisory: PublicAdvisory): string {
  return `${advisory.title}|${advisory.until}`;
}

/** Read after mount, so the server render and the first client paint agree. */
function dismissedForToday(advisory: PublicAdvisory): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const record = JSON.parse(raw) as { day?: unknown; id?: unknown };
    return record.day === manilaToday() && record.id === advisoryId(advisory);
  } catch {
    return false;
  }
}

export function PublicAdvisoryBanner({ advisory }: { advisory: PublicAdvisory }) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissedForToday(advisory)) setDismissed(true);
  }, [advisory]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(
        DISMISS_KEY,
        JSON.stringify({ day: manilaToday(), id: advisoryId(advisory) }),
      );
    } catch {
      // Storage unavailable: the banner simply returns on the next visit.
    }
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <aside
      className="public-advisory no-print"
      aria-labelledby="public-advisory-title"
      data-testid="public-advisory"
    >
      <div className="public-advisory-head">
        <h2 id="public-advisory-title">{advisory.title}</h2>
        <button
          type="button"
          className="public-advisory-dismiss"
          aria-label={t("common.close")}
          onClick={dismiss}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <div id="public-advisory-body" className="public-advisory-body">
        {advisory.lines.length > 0 && (
          <ul className="public-advisory-lines">
            {advisory.lines.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
        )}
        {advisory.signature !== "" && (
          <p className="public-advisory-signature">{advisory.signature}</p>
        )}
      </div>
    </aside>
  );
}
