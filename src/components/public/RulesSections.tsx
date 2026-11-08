"use client";

import { AlertOctagon, ChevronDown, Info, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import type { RulesCallout, RulesSection, RulesTable } from "@/lib/public/tournament-rules";

const CALLOUT_ICONS = {
  penalty: AlertOctagon,
  local: MapPin,
  note: Info,
} as const;

const CALLOUT_LABELS: Record<RulesCallout["tone"], string> = {
  penalty: "Penalty",
  local: "Local rule",
  note: "Note",
};

function RulesTableView({ table }: { table: RulesTable }) {
  return (
    <div
      className="rules-table-wrap"
      role="region"
      aria-label={table.caption}
      data-columns={table.columns.length}
      tabIndex={0}
    >
      <table aria-label={table.caption}>
        <caption>{table.caption}</caption>
        <thead>
          <tr>
            {table.columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={`${table.caption}-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td
                  key={`${table.caption}-${rowIndex}-${cellIndex}`}
                  data-first={cellIndex === 0}
                  data-label={table.columns[cellIndex]}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RulesCalloutView({ callout }: { callout: RulesCallout }) {
  const Icon = CALLOUT_ICONS[callout.tone];
  return (
    <aside className={`rules-callout ${callout.tone}`} aria-label={CALLOUT_LABELS[callout.tone]}>
      <Icon className="rules-callout-icon" aria-hidden="true" />
      <div className="rules-callout-copy">
        <p className="rules-callout-title" role="heading" aria-level={3}>
          {callout.title}
        </p>
        <p>{callout.body}</p>
        {callout.items && callout.items.length > 0 && (
          <ul>
            {callout.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

/**
 * The accordion part of the Rules page.
 *
 * Native `<details>` keeps the content readable without JavaScript and gives the browser the
 * keyboard and screen-reader behaviour for free. The small amount of state here does two jobs:
 * it opens the section a jump link points at, and it powers Expand all for a reader who wants to
 * scan the whole document.
 */
export function RulesSections({ sections }: { sections: readonly RulesSection[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sections.map((section) => [section.id, Boolean(section.defaultOpen)])),
  );

  useEffect(() => {
    const openFromHash = () => {
      const id = window.location.hash.slice(1);
      if (!id || !sections.some((section) => section.id === id)) return;
      setOpen((previous) => (previous[id] ? previous : { ...previous, [id]: true }));
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [sections]);

  const allOpen = sections.every((section) => open[section.id]);

  const setEverySection = (value: boolean) => {
    setOpen(Object.fromEntries(sections.map((section) => [section.id, value])));
  };

  return (
    <>
      <div className="rules-jump-row no-print">
        <nav className="rules-jump" aria-label="Rules sections">
          <span className="rules-jump-label">On this page</span>
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={() =>
                setOpen((previous) =>
                  previous[section.id] ? previous : { ...previous, [section.id]: true },
                )
              }
            >
              {section.title}
            </a>
          ))}
        </nav>
        <button
          type="button"
          className="rules-expand"
          onClick={() => setEverySection(!allOpen)}
          aria-label={allOpen ? "Collapse every rules section" : "Expand every rules section"}
        >
          <ChevronDown
            className={allOpen ? "rules-expand-icon is-open" : "rules-expand-icon"}
            aria-hidden="true"
          />
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>

      <div className="rules-list" data-testid="rules-sections">
        {sections.map((section, index) => (
          <details
            key={section.id}
            id={section.id}
            className="rules-section"
            data-testid={`rules-section-${section.id}`}
            open={Boolean(open[section.id])}
            onToggle={(event) => {
              const next = event.currentTarget.open;
              setOpen((previous) =>
                Boolean(previous[section.id]) === next
                  ? previous
                  : { ...previous, [section.id]: next },
              );
            }}
          >
            <summary>
              <span className="rules-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="rules-summary-copy">
                <span className="rules-summary-title" role="heading" aria-level={2}>
                  {section.title}
                </span>
                <span className="rules-summary-dek">{section.summary}</span>
              </span>
              <ChevronDown className="rules-chevron" aria-hidden="true" />
            </summary>

            <div className="rules-section-body">
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}

              {section.groups?.map((group) => (
                <div key={group.title} className="rules-group">
                  <h3>{group.title}</h3>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}

              {section.bullets && section.bullets.length > 0 && (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}

              {section.tables?.map((table) => (
                <RulesTableView key={table.caption} table={table} />
              ))}

              {section.callouts?.map((callout) => (
                <RulesCalloutView key={callout.title} callout={callout} />
              ))}

              <p className="rules-source">Source: {section.source}</p>
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
