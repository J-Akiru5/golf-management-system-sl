"use client";

import { ChevronDown, FileJson } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface SubmissionSummary {
  slug: string;
  event: string;
  label: string;
  updatedAt: string;
  at: string;
  by: string;
  cards: number;
  nameOnly: number;
  differences: number;
}

interface SubmissionCard {
  id?: string;
  name?: string;
  group?: string;
  tee?: string;
  hdcp?: string;
  written?: string;
  holes?: string[];
  note?: string;
  handicapSource?: string;
  checked?: boolean;
}

interface SubmissionDetail {
  label?: string;
  cards?: SubmissionCard[];
  nameOnly?: {
    id?: string;
    name?: string;
    day?: number;
    session?: string;
    holes?: string[];
    written?: string;
    note?: string;
  }[];
}

interface SubmissionResponse {
  ok?: boolean;
  message?: string;
  document?: { label?: string };
  submission?: SubmissionDetail;
}

interface TabulatorSubmissionsPanelProps {
  busy: boolean;
  onReview: (file: { name: string; text: string }) => void;
  /** The demo store has no saved submissions; skip the staff-only API request there. */
  enabled?: boolean;
}

/**
 * The queue of day documents a tabulator sent after checking cards against the paper.
 *
 * Reviewing a submission only loads it into the sheet import panel below, which shows every match
 * and refusal before anything is written. The desk still presses Import and then publishes. A
 * tabulation account cannot approve or publish its own cards.
 */
export function TabulatorSubmissionsPanel({
  busy,
  onReview,
  enabled = true,
}: TabulatorSubmissionsPanelProps) {
  const [rows, setRows] = useState<SubmissionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSlug, setLoadingSlug] = useState("");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/scorecards/submissions", { cache: "no-store" });
      const body = (await response.json()) as {
        ok?: boolean;
        message?: string;
        submissions?: SubmissionSummary[];
      };
      if (!response.ok || !body.ok) {
        throw new Error(body.message || "The tabulator submissions could not be read.");
      }
      setRows(body.submissions ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  async function review(slug: string) {
    setLoadingSlug(slug);
    setError("");
    try {
      const response = await fetch(`/api/scorecards/submissions?slug=${encodeURIComponent(slug)}`, {
        cache: "no-store",
      });
      const body = (await response.json()) as SubmissionResponse;
      if (!response.ok || !body.ok || !body.submission) {
        throw new Error(body.message || "That submission could not be read.");
      }
      const submission = body.submission;
      const cards = Array.isArray(submission.cards) ? submission.cards : [];
      const nameOnly = Array.isArray(submission.nameOnly) ? submission.nameOnly : [];
      const exportFile = {
        format: "bamboo-scores-edit",
        version: 1,
        slug,
        label: body.document?.label || submission.label || slug,
        mode: "written",
        cards: [
          ...cards.map((card) => ({
            id: card.id,
            name: card.name,
            group: card.group,
            tee: card.tee,
            hdcp: card.hdcp,
            written: card.written,
            cls: "",
            verified: true,
            manual: false,
            note: [
              card.note,
              card.checked === false
                ? "Not ticked as checked by the tabulator; check the paper card."
                : "",
              card.handicapSource === "system"
                ? `HDCP box blank; system playing handicap ${card.hdcp} used.`
                : "",
            ]
              .filter(Boolean)
              .join(" "),
            holes: card.holes,
          })),
          ...nameOnly.map((entry, index) => ({
            id: entry.id || `name-only-${index + 1}`,
            name: entry.name || "",
            group: "",
            tee: "",
            hdcp: "",
            written: entry.written || "",
            cls: "",
            verified: false,
            manual: true,
            note: entry.note || "Sent as a name only; the player is not on the field list.",
            holes: entry.holes ?? Array(18).fill(""),
          })),
        ],
      };
      onReview({
        name: `${slug}-submitted.json`,
        text: JSON.stringify(exportFile),
      });
      setSelected(slug);
      document.getElementById("sheet-import")?.scrollIntoView({ block: "start" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoadingSlug("");
    }
  }

  return (
    <details className="card group" id="tabulator-submissions" open>
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2">
        <FileJson className="size-4 text-fairway" aria-hidden="true" />
        <span className="font-semibold">
          Tabulator submissions{rows.length ? ` (${rows.length})` : ""}
        </span>
        <span className="hint">
          Cards checked on the tabulation page. Review one, then import and publish it below.
        </span>
        <ChevronDown
          className="ml-auto size-4 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void load()}
            disabled={!enabled || loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
          {selected && (
            <p className="text-sm text-ink-muted">Loaded into the import panel below.</p>
          )}
        </div>
        {!enabled ? (
          <p className="text-sm text-ink-muted">
            The demo has no saved tabulator submissions. A connected day is read from the database.
          </p>
        ) : error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : null}
        {enabled && rows.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No tabulator submission yet. A tabulator sends one from the day page after checking the
            cards against the paper.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {rows.map((row) => (
              <li key={row.slug} className="flex flex-wrap items-center gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{row.label || row.slug}</p>
                  <p className="text-xs text-ink-muted">
                    {row.cards} card{row.cards === 1 ? "" : "s"} · {row.nameOnly} name-only ·{" "}
                    {row.differences} card/system handicap difference
                    {row.differences === 1 ? "" : "s"} · sent{" "}
                    {row.at ? new Date(row.at).toLocaleString() : "unknown time"}
                    {row.by ? ` by ${row.by}` : ""}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy || loadingSlug !== ""}
                  onClick={() => void review(row.slug)}
                >
                  {loadingSlug === row.slug ? "Loading…" : "Review"}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-ink-muted">
          Reviewing loads the import preview. Nothing is approved until you press Import, and the
          result is published only when you publish the round.
        </p>
      </div>
    </details>
  );
}
