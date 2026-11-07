"use client";

import { useEffect, useMemo, useState } from "react";
import { type CauseAction, summariseIssues } from "@/lib/draw/issue-causes";
import type { Issue, Severity } from "@/lib/draw/validate";
import { pageWindow } from "@/lib/ui/pagination";

const META: Record<Severity, { label: string; cls: string; hint: string }> = {
  blocking: {
    label: "Must fix",
    cls: "bad",
    hint: "Publishing is switched off until these are fixed.",
  },
  warning: { label: "Check", cls: "warn", hint: "Allowed, but look at them before you publish." },
  info: { label: "Note", cls: "info", hint: "" },
};

const ORDER: Severity[] = ["blocking", "warning", "info"];

type Fix = Exclude<CauseAction, null>;

const ACTION_LABEL: Record<Fix, (n: number) => string> = {
  refreeze: (n) => `Step 1: freeze ${n} ${n === 1 ? "index" : "indexes"} again`,
  redraw: () => "Step 2: redraw this day",
};

export function IssuesPanel({
  issues,
  onShow,
  onFix,
  busy = false,
}: {
  issues: Issue[];
  onShow: (i: Issue) => void;
  /** Runs the one step that clears a whole cause. Left out, the cards only explain. */
  onFix?: (action: Fix) => void;
  busy?: boolean;
}) {
  // The list can run to hundreds of entries, so it is paged rather than one long scroll.
  const [page, setPage] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const causes = useMemo(() => summariseIssues(issues), [issues]);
  const ordered = useMemo(
    () => ORDER.flatMap((s) => issues.filter((i) => i.severity === s)),
    [issues],
  );
  // With causes shown, the lines they already explain stay out of the list until asked for.
  const folding = causes.length > 0 && !showAll;
  const listed = useMemo(() => {
    if (!folding) return ordered;
    const folded = new Set(causes.flatMap((c) => c.issueIds));
    return ordered.filter((i) => !folded.has(i.id));
  }, [folding, ordered, causes]);
  const window = pageWindow(listed, page);
  const firstId = listed[0]?.id ?? "";
  const total = listed.length;

  // A different board or a fixed check should not leave the desk deep inside the old list.
  useEffect(() => {
    setPage(0);
  }, [firstId, total]);

  const counts = ORDER.map((s) => [s, issues.filter((i) => i.severity === s).length] as const);

  if (issues.length === 0) {
    return (
      <div className="notice ok" role="status">
        <b>No problems found.</b> Every ready player has a group and every group is within the
        limits.
      </div>
    );
  }

  // Keep the severity headings, but only for the severities that appear on this page.
  const blocks = ORDER.map((severity) => ({
    severity,
    items: window.items.filter((i) => i.severity === severity),
  })).filter((b) => b.items.length > 0);

  return (
    <details className="issues" open>
      <summary>
        <b>Checks</b>
        {counts.map(([s, n]) =>
          n > 0 ? (
            <span key={s} className={`pill ${META[s].cls}`}>
              {n} {META[s].label.toLowerCase()}
            </span>
          ) : null,
        )}
      </summary>

      {causes.length > 0 && (
        <section aria-label="What is behind these checks" className="grid gap-2 py-3">
          <h3 className="text-[15px]">
            {ordered.length} checks, {causes.length === 1 ? "one cause" : `${causes.length} causes`}
          </h3>
          {causes.map((cause) => (
            <div
              key={cause.kind}
              className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div className="grid gap-0.5">
                <b>{cause.title}</b>
                <span className="hint">{cause.detail}</span>
              </div>
              {cause.action && onFix && (
                <button
                  type="button"
                  className="btn small"
                  disabled={busy}
                  onClick={() => onFix(cause.action as Fix)}
                >
                  {ACTION_LABEL[cause.action as Fix](cause.count)}
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn small ghost justify-self-start"
            aria-expanded={showAll}
            onClick={() => {
              setShowAll(!showAll);
              setPage(0);
            }}
          >
            {showAll ? "Hide the lines the causes explain" : `Show all ${ordered.length} lines`}
          </button>
        </section>
      )}

      {blocks.map((block) => (
        <section key={block.severity} className="issue-block">
          <h3>
            <span className={`pill ${META[block.severity].cls}`}>{META[block.severity].label}</span>
            {META[block.severity].hint && <span className="hint">{META[block.severity].hint}</span>}
          </h3>
          <ul>
            {block.items.map((i) => (
              <li key={i.id}>
                <span>{i.message}</span>
                {(i.group || i.playerId) && (
                  <button type="button" className="btn small ghost" onClick={() => onShow(i)}>
                    Show
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {listed.length > 0 && (
        <nav className="row between" aria-label="Check pages">
          <span className="hint">
            {window.from}–{window.to} of {window.total}
          </span>
          <div className="row">
            <button
              type="button"
              className="btn small ghost"
              disabled={window.page === 0}
              onClick={() => setPage(window.page - 1)}
            >
              Previous
            </button>
            <span className="hint">
              Page {window.page + 1} of {window.pageCount}
            </span>
            <button
              type="button"
              className="btn small ghost"
              disabled={window.page >= window.pageCount - 1}
              onClick={() => setPage(window.page + 1)}
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </details>
  );
}
