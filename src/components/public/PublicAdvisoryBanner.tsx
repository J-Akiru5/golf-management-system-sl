"use client";

import { ChevronDown, X } from "lucide-react";
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
 *
 * On a phone it starts as one tappable row with the title and the first line, so it tells the
 * player there is news without pushing the pairings off the first screen. Tapping the row opens the
 * full text. On a wider screen the stylesheet always shows the full text and hides the chevron.
 */
export function PublicAdvisoryBanner({ advisory }: { advisory: PublicAdvisory }) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  if (dismissed) return null;

  return (
    <aside
      className="public-advisory no-print"
      aria-labelledby="public-advisory-title"
      data-testid="public-advisory"
      data-expanded={expanded ? "true" : "false"}
    >
      <div className="public-advisory-head">
        <button
          type="button"
          className="public-advisory-toggle"
          aria-expanded={expanded}
          aria-controls="public-advisory-body"
          onClick={() => setExpanded((value) => !value)}
        >
          <h2 id="public-advisory-title">{advisory.title}</h2>
          <ChevronDown aria-hidden="true" className="public-advisory-chevron" />
        </button>
        <button
          type="button"
          className="public-advisory-dismiss"
          aria-label={t("common.close")}
          onClick={() => setDismissed(true)}
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
