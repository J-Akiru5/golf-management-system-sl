"use client";

import { useEffect, useMemo, useState } from "react";
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

export function IssuesPanel({ issues, onShow }: { issues: Issue[]; onShow: (i: Issue) => void }) {
  // The list can run to hundreds of entries, so it is paged rather than one long scroll.
  const [page, setPage] = useState(0);
  const ordered = useMemo(
    () => ORDER.flatMap((s) => issues.filter((i) => i.severity === s)),
    [issues],
  );
  const window = pageWindow(ordered, page);
  const firstId = ordered[0]?.id ?? "";
  const total = ordered.length;

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
    </details>
  );
}
