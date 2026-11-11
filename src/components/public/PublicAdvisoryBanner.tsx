"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import type { PublicAdvisory } from "@/lib/public/advisory";

/**
 * The organizer's advisory, shown above the page content.
 *
 * It is an inline panel, not a dialog or an overlay, so it can never cover the pairings or trap a
 * tap. Dismissing hides it for this visit only: the state is React's, nothing is written to
 * localStorage or a cookie, and reloading the page brings the advisory back while it is current.
 * The organizer's text is already English (and already expired-checked on the server), so the only
 * localised control here is the close label.
 */
export function PublicAdvisoryBanner({ advisory }: { advisory: PublicAdvisory }) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(false);
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
          onClick={() => setDismissed(true)}
        >
          <X aria-hidden="true" />
        </button>
      </div>
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
    </aside>
  );
}
