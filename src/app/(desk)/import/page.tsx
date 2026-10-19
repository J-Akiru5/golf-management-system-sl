"use client";

import {
  Check,
  CircleCheck,
  FileSpreadsheet,
  Info,
  OctagonAlert,
  TriangleAlert,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { Pager } from "@/components/paging/Pager";
import { usePagedList } from "@/components/paging/usePagedList";
import { Button } from "@/components/ui/button";
import { fmtIso } from "@/lib/data/labels";
import { fmtIndex } from "@/lib/format";
import {
  type ColumnMapping,
  type DateFormat,
  type MergeDecision,
  type MergeRow,
  type ParsedFile,
  resolveImport,
  reviewBuckets,
} from "@/lib/ngap";
import { useDesk } from "@/lib/store/desk-store";

const NONE = "";
const DECISION_LABEL: Record<MergeDecision["action"], string> = {
  link: "Link",
  create: "Create new",
  separate: "Keep separate",
  defer: "Decide later",
};

/** The three buckets a file's rows fall into, in the order the desk works through them. */
type ReviewTab = "decide" | "decided" | "deferred";

export default function ImportPage() {
  const { tournament, deferred, state, adapters, dispatch, status } = useDesk();
  // The sample file holds invented golfers. In the demo that is harmless; on the club's database
  // applying it would write them as real players, so it is only offered in the demo.
  const demo = status === "demo";
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [readError, setReadError] = useState("");
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});
  const [dateFormat, setDateFormat] = useState<DateFormat>("mdy");
  const [defaultDate, setDefaultDate] = useState("2026-11-01");
  const [decisions, setDecisions] = useState<Record<number, MergeDecision | undefined>>({});
  const [applied, setApplied] = useState("");

  function load(text: string, label: string) {
    setReadError("");
    setApplied("");
    setDecisions({});
    try {
      const parsed = adapters.imports.parse(text);
      setFile(parsed);
      setFileName(label);
      setMapping(adapters.imports.guessMapping(parsed.headers).mapping);
    } catch (e) {
      setFile(null);
      setReadError((e as Error).message);
    }
  }

  const queue = useMemo(() => {
    if (!file || !mapping.name || !mapping.index) return null;
    try {
      return {
        value: adapters.imports.review(file, state.players, {
          mapping: mapping as ColumnMapping,
          dateFormat,
          defaultEffectiveDate: defaultDate,
        }),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [file, mapping, dateFormat, defaultDate, adapters, state.players]);

  const value = queue && "value" in queue ? queue.value : null;
  const resolution = useMemo(
    () =>
      value
        ? resolveImport(value, Object.values(decisions).filter(Boolean) as MergeDecision[])
        : null,
    [value, decisions],
  );

  // The buckets are read back out of the resolution, so the tab counts and the Apply button are
  // answering from the same rule about what still needs a decision.
  const buckets = useMemo(
    () => (value && resolution ? reviewBuckets(value, resolution) : null),
    [value, resolution],
  );
  const [tab, setTab] = useState<ReviewTab>("decide");
  const tabRows: MergeRow[] = !buckets
    ? []
    : tab === "decide"
      ? buckets.needsDecision
      : tab === "decided"
        ? buckets.decided
        : buckets.deferred;
  // Filter (the tab) first, then page. Switching tab returns the desk to page 1, and so does a new
  // file or a changed mapping, because those rebuild the queue the pages are counting.
  const queueKey = [
    tab,
    fileName,
    mapping.name ?? "",
    mapping.index ?? "",
    mapping.ngapId ?? "",
    mapping.effectiveDate ?? "",
    mapping.dob ?? "",
    mapping.contact ?? "",
    dateFormat,
    defaultDate,
    value?.rows.length ?? 0,
  ].join("|");
  const { page, setPage } = usePagedList(tabRows, queueKey);

  const select = (field: keyof ColumnMapping, label: string, optional: boolean) => (
    <label className="field">
      <span>
        {label}
        {optional ? " (optional)" : ""}
      </span>
      <select
        value={mapping[field] ?? NONE}
        onChange={(e) => {
          setMapping({ ...mapping, [field]: e.target.value || undefined });
          setDecisions({});
        }}
      >
        {optional && <option value={NONE}>Not in the file</option>}
        {!optional && !mapping[field] && <option value={NONE}>Choose a column</option>}
        {file?.headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );

  const decide = (row: number, decision: MergeDecision | undefined) =>
    setDecisions((d) => ({ ...d, [row]: decision }));

  function applyImport() {
    if (!value || !resolution) return;
    adapters.imports.apply({
      fileName,
      rowCount: value.summary.total,
      skippedCount: value.summary.skipped,
      note:
        value.summary.link > 0 || value.summary.create > 0
          ? `Applied ${resolution.rows.length}, deferred ${resolution.deferred.length}.`
          : "Applied with no changes.",
      rows: resolution.rows,
      deferred: resolution.deferred,
    });
    const created = resolution.rows.filter((r) => r.createNew).length;
    setApplied(
      `Wrote ${resolution.rows.length} handicap record${resolution.rows.length === 1 ? "" : "s"} (${created} as new player records needing birthdate and gender). ${resolution.deferred.length} row${resolution.deferred.length === 1 ? "" : "s"} deferred.`,
    );
  }

  if (!tournament) return <NeedsTournament what="Handicap imports" />;

  const unresolved = resolution?.unresolved.length ?? 0;

  return (
    <div className="grid gap-6">
      <PageHeader
        overline="Handicaps"
        title="Handicap imports"
        crumbs={[{ label: tournament.name, href: "/tournaments" }, { label: "Handicap imports" }]}
        actions={
          <Button variant="secondary" asChild>
            <Link href="/register">Open the registration desk</Link>
          </Button>
        }
      >
        The club exports the file; this desk reviews it and decides every match. There is no NGAP
        connection: it reads a CSV and shows exactly what it would write before you apply it.
      </PageHeader>

      <div className="notice" role="note">
        <b>Cut-off:</b> the event freezes the latest index on or before{" "}
        {fmtIso(tournament.cutOffDate)}. Records dated after the cut-off are stored but do not
        change this event. Nothing is written to a server; a refresh resets the session.
      </div>

      <SectionCard
        id="file-h"
        icon={<Step n={1} />}
        title="Choose the file"
        subtitle="CSV for now. A real NGAP export has not been supplied, so column names are guesses you can correct."
      >
        <div className="flex flex-wrap items-stretch gap-3">
          <label className="relative flex min-h-[96px] min-w-0 flex-[1_1_18rem] cursor-pointer items-center gap-3.5 rounded-[14px] border border-dashed border-line-strong bg-surface-sunken px-4 py-3 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus hover:bg-fairway-soft">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-raised text-fairway shadow-card">
              <Upload className="size-[18px]" aria-hidden="true" />
            </span>
            <span className="grid min-w-0">
              <span className="font-semibold">NGAP export file</span>
              <span className="truncate text-[13px] text-ink-muted">
                {fileName || "Choose a .csv file"}
              </span>
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              data-help="import-upload"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) load(await f.text(), f.name);
              }}
            />
          </label>
          {demo && (
            <Button
              variant="secondary"
              className="h-auto min-h-10 self-center"
              onClick={() => load(adapters.imports.sample(), adapters.imports.sampleFileName)}
            >
              <FileSpreadsheet aria-hidden="true" />
              Try the sample file
            </Button>
          )}
        </div>
        <p className="hint">
          {demo &&
            "The sample file is invented to exercise the review queue: exact matches, a new golfer, an NH row, a name that matches two players, an NGAP ID that disagrees with the record, a duplicate line, and an unreadable date. "}
          Excel files (.xlsx) are not supported yet.
        </p>
        {readError && (
          <Notice tone="bad" alert>
            {readError}
          </Notice>
        )}
      </SectionCard>

      {file && (
        <SectionCard
          id="columns-h"
          icon={<Step n={2} />}
          title="Which column is which?"
          subtitle={`${fileName}: ${file.rows.length} rows. Guessed from the headers; change anything that looks wrong.`}
        >
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {select("name", "Player name", false)}
            {select("index", "Handicap index", false)}
            {select("ngapId", "NGAP ID", true)}
            {select("effectiveDate", "Date of the index", true)}
            {select("dob", "Birthdate", true)}
            {select("contact", "Contact number", true)}
            <label className="field">
              <span>Dates are written as</span>
              <select
                value={dateFormat}
                onChange={(e) => {
                  setDateFormat(e.target.value as DateFormat);
                  setDecisions({});
                }}
              >
                <option value="mdy">Month/Day/Year</option>
                <option value="dmy">Day/Month/Year</option>
                <option value="iso">Year-Month-Day</option>
              </select>
            </label>
            {!mapping.effectiveDate && (
              <label className="field">
                <span>Index date for all rows</span>
                <input
                  type="date"
                  value={defaultDate}
                  onChange={(e) => {
                    setDefaultDate(e.target.value);
                    setDecisions({});
                  }}
                />
              </label>
            )}
          </div>
          <p className="hint">
            Mapping is reviewable and nothing is assumed: an unknown column simply stays unmapped.
            The match signals are NGAP ID first, then name, with birthdate and contact when the file
            carries them.
          </p>
        </SectionCard>
      )}

      {queue && "error" in queue && (
        <Notice tone="bad" alert>
          {queue.error}
        </Notice>
      )}

      {value && resolution && (
        <SectionCard
          id="review-h"
          icon={<Step n={3} />}
          title="Match and merge queue"
          subtitle="Every row is decided by you. Nothing is merged silently."
        >
          <div className="tiles grid-cols-2 lg:grid-cols-5">
            <div className="tile">
              <b>{value.summary.link}</b>
              <span>Ready to link</span>
            </div>
            <div className="tile">
              <b>{value.summary.create}</b>
              <span>New players</span>
            </div>
            <div className={`tile${value.summary.decisions ? " warn" : ""}`}>
              <b>{value.summary.decisions}</b>
              <span>Need a decision</span>
            </div>
            <div className="tile">
              <b>{value.summary.skipped}</b>
              <span>Repeated lines skipped</span>
            </div>
            <div className={`tile${value.summary.errors ? " bad" : ""}`}>
              <b>{value.summary.errors}</b>
              <span>Rows with problems</span>
            </div>
          </div>

          {value.errors.length > 0 && (
            <Notice tone="bad" alert>
              <b>These rows will be skipped:</b>
              <ul>
                {value.errors.map((e) => (
                  <li key={`${e.row}-${e.message}`}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </Notice>
          )}
          {value.warnings.length > 0 && (
            <Notice tone="warn">
              <b>Please check:</b>
              <ul>
                {value.warnings.map((w) => (
                  <li key={`${w.row}-${w.message}`}>
                    Row {w.row}: {w.message}
                  </li>
                ))}
              </ul>
            </Notice>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="seg" role="group" aria-label="Review tabs" data-help="import-tabs">
              {(
                [
                  {
                    id: "decide",
                    label: "Needs decision",
                    count: buckets?.needsDecision.length ?? 0,
                  },
                  { id: "decided", label: "Decided", count: buckets?.decided.length ?? 0 },
                  { id: "deferred", label: "Deferred", count: buckets?.deferred.length ?? 0 },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tab === t.id}
                  onClick={() => setTab(t.id)}
                >
                  {t.label} ({t.count})
                </button>
              ))}
            </div>
            {buckets && (
              <span className="hint" role="status">
                {buckets.progress.settled} of {buckets.progress.total} decided
              </span>
            )}
          </div>

          {buckets && buckets.progress.total > 0 && (
            <div
              className="h-1.5 w-full overflow-hidden rounded-full"
              style={{ background: "var(--line)" }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={buckets.progress.total}
              aria-valuenow={buckets.progress.settled}
              aria-label="Rows decided"
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.round((buckets.progress.settled / buckets.progress.total) * 100)}%`,
                  background: "var(--gold)",
                }}
              />
            </div>
          )}

          <div className="table-wrap !shadow-none" data-help="import-review">
            <table>
              <thead>
                <tr>
                  <th className="num">Row</th>
                  <th>Name in file</th>
                  <th className="num">Index</th>
                  <th>Effective</th>
                  <th>Match</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((row) => (
                  <RowDecision
                    key={row.row}
                    row={row}
                    cutOffDate={tournament.cutOffDate}
                    decision={decisions[row.row]}
                    onDecide={(d) => decide(row.row, d)}
                  />
                ))}
              </tbody>
            </table>
            {page.total === 0 && (
              <p className="muted p-4 text-[14px]">
                {tab === "decide"
                  ? "Nothing needs a decision. Every row in this file is settled."
                  : tab === "decided"
                    ? "No rows are settled yet. Work through Needs decision."
                    : "No rows deferred from this file."}
              </p>
            )}
          </div>

          <Pager page={page} onPage={setPage} />

          {tab === "decided" && buckets && buckets.decided.length > 1 && (
            <p className="hint">
              These rows already have an answer, so they import as they stand. Change one here and
              it moves to its new tab straight away.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button
              variant="primary"
              disabled={resolution.rows.length === 0 || unresolved > 0}
              onClick={applyImport}
            >
              <Check aria-hidden="true" />
              Apply {resolution.rows.length} record{resolution.rows.length === 1 ? "" : "s"}
            </Button>
            {unresolved > 0 && (
              <span className="hint" role="status">
                {unresolved} row{unresolved === 1 ? "" : "s"} still need a decision. Link, create a
                new player, keep separate, or defer.
              </span>
            )}
            {applied && (
              <span
                role="status"
                className="inline-flex items-start gap-1.5 rounded-md bg-success-soft px-2.5 py-1.5 text-[13px] font-semibold text-success"
              >
                <CircleCheck className="mt-px size-4 shrink-0" aria-hidden="true" />
                {applied}
              </span>
            )}
          </div>
          <p className="hint">
            New player records are created as stubs (name and NGAP ID only). They show as{" "}
            <b>Needs review</b> until birthdate and gender are filled in, because category and tee
            depend on them.{demo && " This is session-only demo data."}
          </p>
        </SectionCard>
      )}

      {deferred.length > 0 && (
        <SectionCard
          id="deferred-h"
          icon={<Info />}
          title="Deferred rows"
          subtitle="Rows you chose to decide later. They are not imported yet."
        >
          <ul className="plain grid gap-2">
            {deferred.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-line px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <b className="block truncate">{d.name}</b>
                  <span className="hint">
                    {d.ngapId ? `NGAP ${d.ngapId} · ` : ""}index {fmtIndex(d.index)} ·{" "}
                    {fmtIso(d.effectiveDate)} · {d.reason} · from {d.fileName}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      dispatch({ type: "resolveDeferred", id: d.id, decision: "link" })
                    }
                  >
                    Link to first match
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      dispatch({ type: "resolveDeferred", id: d.id, decision: "create" })
                    }
                  >
                    Create new
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      dispatch({ type: "resolveDeferred", id: d.id, decision: "drop" })
                    }
                  >
                    Drop
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {state.batches.length > 0 && (
        <SectionCard
          id="batches-h"
          icon={<FileSpreadsheet />}
          title="Import history (this session)"
        >
          <ul className="plain grid gap-1.5 text-[14px]">
            {state.batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-3">
                <b className="mono">{b.fileName}</b>
                <span className="hint">
                  {fmtIso(b.importedAt.slice(0, 10))} · {b.appliedCount} record
                  {b.appliedCount === 1 ? "" : "s"} written · {b.skippedCount} repeated line
                  {b.skippedCount === 1 ? "" : "s"} skipped
                </span>
                {b.note && <span className="hint">{b.note}</span>}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

/** Decision controls for one queue row. Link is only offered when there is a candidate. */
function RowDecision({
  row,
  cutOffDate,
  decision,
  onDecide,
}: {
  row: MergeRow;
  cutOffDate: string;
  decision: MergeDecision | undefined;
  onDecide: (d: MergeDecision | undefined) => void;
}) {
  const top = row.candidates[0];
  const active = decision?.action ?? (row.conflicts.length > 0 ? null : row.recommendation);

  return (
    <tr className={row.conflicts.length > 0 ? "bg-warning-soft/40" : undefined}>
      <td className="num mono">{row.row}</td>
      <td>
        <b>{row.name}</b>
        {row.ngapId && <span className="hint block">NGAP {row.ngapId}</span>}
        {row.conflicts.length > 0 && (
          <span className="hint block !text-warning">{row.conflicts.join(" ")}</span>
        )}
        {row.warnings.length > 0 && <span className="hint block">{row.warnings.join(" ")}</span>}
      </td>
      <td className="num mono">{fmtIndex(row.index)}</td>
      <td className="mono nowrap">
        {fmtIso(row.effectiveDate)}
        <span className="hint block">
          {row.effectiveDate <= cutOffDate
            ? "On or before the cut-off · freezes for this event"
            : "After the cut-off · stored, not frozen"}
        </span>
      </td>
      <td>
        {row.candidates.length === 0 ? (
          <span className="pill info">No match</span>
        ) : (
          <span className="grid gap-1">
            {row.candidates.map((c) => (
              <span key={c.playerId} className="flex flex-wrap items-center gap-1.5 text-[13px]">
                <span className="pill">
                  {c.confidence === "exact"
                    ? "Exact"
                    : c.confidence === "strong"
                      ? "Strong"
                      : "Weak"}
                </span>
                <span className="truncate">{c.fullName}</span>
                <span className="hint">
                  {c.signals.map((s) => s.detail).join(" · ") || "name only"}
                </span>
              </span>
            ))}
          </span>
        )}
      </td>
      <td>
        <span className="flex flex-wrap gap-1.5">
          {active === "link" && top && <span className="pill ok">Links to {top.fullName}</span>}
          {active === "create" && <span className="pill info">Creates a new player record</span>}
          {active === "separate" && <span className="pill">Kept separate</span>}
          {active === "defer" && <span className="pill warn">Deferred</span>}
          {top && (
            <button
              type="button"
              className="btn small ghost"
              onClick={() => onDecide({ row: row.row, action: "link", playerId: top.playerId })}
            >
              {DECISION_LABEL.link}
            </button>
          )}
          {(row.candidates.length !== 1 || row.conflicts.length > 0) && (
            <button
              type="button"
              className="btn small ghost"
              onClick={() => onDecide({ row: row.row, action: "create" })}
            >
              {DECISION_LABEL.create}
            </button>
          )}
          {row.candidates.length > 0 && (
            <button
              type="button"
              className="btn small ghost"
              onClick={() => onDecide({ row: row.row, action: "separate" })}
            >
              {DECISION_LABEL.separate}
            </button>
          )}
          <button
            type="button"
            className="btn small ghost"
            onClick={() => onDecide({ row: row.row, action: "defer" })}
          >
            {DECISION_LABEL.defer}
          </button>
          {decision && (
            <button
              type="button"
              className="btn small ghost"
              onClick={() => onDecide(undefined)}
              aria-label="Clear this decision"
            >
              Clear
            </button>
          )}
        </span>
      </td>
    </tr>
  );
}

function Step({ n }: { n: number }) {
  return <span className="font-display text-sm font-extrabold tnum">{n}</span>;
}

const NOTICE_ICON = { bad: OctagonAlert, warn: TriangleAlert, info: Info } as const;
const NOTICE_TEXT = { bad: "text-danger", warn: "text-warning", info: "text-info" } as const;

/** A notice with its tone's icon, so the tone never rests on colour alone. */
function Notice({
  tone,
  alert,
  children,
}: {
  tone: keyof typeof NOTICE_ICON;
  alert?: boolean;
  children: ReactNode;
}) {
  const Icon = NOTICE_ICON[tone];
  return (
    <div
      className={`notice${tone === "info" ? "" : ` ${tone}`} flex items-start gap-2.5`}
      role={alert ? "alert" : undefined}
    >
      <Icon className={`mt-0.5 size-4 shrink-0 ${NOTICE_TEXT[tone]}`} aria-hidden="true" />
      <div className="min-w-0 text-[14px]">{children}</div>
    </div>
  );
}
