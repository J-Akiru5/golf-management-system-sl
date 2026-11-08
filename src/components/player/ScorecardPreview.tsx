"use client";

import { useMemo, useState } from "react";
import { ScorecardBreakdown } from "@/components/player/ScorecardBreakdown";
import { useI18n } from "@/lib/i18n/context";
import type { PortalScorecard } from "@/lib/player/portal";
import { scorecardRows, teamFormatLabel, withGrossEdits } from "@/lib/player/scorecard";
import { TEAM_COMBINED_FORMATS, type TeamCombinedFormat } from "@/lib/scoring/team";

/** The sample gross scores a reader can change. The preview is local state only. */
function parseDrafts(drafts: Readonly<Record<number, string>>): Record<number, number> {
  const edits: Record<number, number> = {};
  for (const [key, raw] of Object.entries(drafts)) {
    const value = Number(raw);
    if (Number.isInteger(value) && value >= 1 && value <= 99) edits[Number(key)] = value;
  }
  return edits;
}

export function ScorecardPreview({
  card,
  partner,
  sharedCard,
  partnerName,
}: {
  card: PortalScorecard;
  partner: PortalScorecard | null;
  sharedCard: PortalScorecard | null;
  partnerName?: string | null;
}) {
  const { t } = useI18n();
  const [format, setFormat] = useState<TeamCombinedFormat>("four-ball");
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const edits = useMemo(() => parseDrafts(drafts), [drafts]);
  const previewCard = useMemo(() => withGrossEdits(card, edits), [card, edits]);
  const rows = scorecardRows(card);
  const showPartner = format === "scramble" ? null : partner;
  const shared = format === "scramble" ? sharedCard : null;

  return (
    <div className="grid gap-4">
      <p className="notice grid gap-2" role="status">
        <b>{t("player.scorecard.previewBadge")}</b>
        <span>{t("player.scorecard.previewDemoNote")}</span>
      </p>

      <fieldset className="card grid gap-2">
        <legend className="small-h">{t("player.scorecard.previewFormat")}</legend>
        <div className="flex flex-wrap gap-2">
          {TEAM_COMBINED_FORMATS.map((option) => (
            <button
              key={option}
              type="button"
              className={option === format ? "btn small" : "btn small ghost"}
              aria-pressed={option === format}
              onClick={() => setFormat(option)}
            >
              {teamFormatLabel(t, option)}
            </button>
          ))}
        </div>
      </fieldset>

      <ScorecardBreakdown
        card={previewCard}
        t={t}
        format={format}
        partner={showPartner}
        shared={shared}
        partnerName={showPartner ? partnerName : null}
        preview
      />

      <details className="card grid gap-3">
        <summary className="cursor-pointer font-semibold">
          {t("player.scorecard.previewHeading")}
        </summary>
        <p className="hint">{t("player.scorecard.previewBody")}</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {rows.map((hole, index) => {
            const number = index + 1;
            return (
              <label key={number} className="field">
                <span>{t("player.scorecard.previewHole", { hole: number })}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={99}
                  value={drafts[number] ?? (hole ? String(hole.grossStrokes) : "")}
                  disabled={!hole}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDrafts((current) => ({ ...current, [number]: value }));
                  }}
                />
              </label>
            );
          })}
        </div>
        <button
          type="button"
          className="btn small ghost justify-self-start"
          onClick={() => setDrafts({})}
        >
          {t("player.scorecard.previewReset")}
        </button>
      </details>
    </div>
  );
}
