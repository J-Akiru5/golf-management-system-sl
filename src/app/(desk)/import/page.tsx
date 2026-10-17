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
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { SAMPLE_NGAP_CSV } from "@/lib/demo/data";
import { fmtIndex } from "@/lib/format";
import {
  buildImportPlan,
  type ColumnMapping,
  type DateFormat,
  type ParsedFile,
  parseCsv,
  suggestMapping,
} from "@/lib/ngap";
import { useDesk } from "@/lib/store/desk-store";

const NONE = "";

export default function ImportPage() {
  const { state, dispatch } = useDesk();
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [readError, setReadError] = useState("");
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});
  const [dateFormat, setDateFormat] = useState<DateFormat>("mdy");
  const [defaultDate, setDefaultDate] = useState("2026-11-01");
  const [applied, setApplied] = useState<string>("");

  function load(text: string, label: string) {
    setReadError("");
    setApplied("");
    try {
      const parsed = parseCsv(text);
      setFile(parsed);
      setFileName(label);
      setMapping(suggestMapping(parsed.headers).mapping);
    } catch (e) {
      setFile(null);
      setReadError((e as Error).message);
    }
  }

  const known = useMemo(
    () => state.players.map((p) => ({ id: p.id, fullName: p.name, ngapId: p.ngapId })),
    [state.players],
  );

  const result = useMemo(() => {
    if (!file || !mapping.name || !mapping.index) return null;
    try {
      return {
        plan: buildImportPlan(file, known, {
          mapping: mapping as ColumnMapping,
          dateFormat,
          defaultEffectiveDate: defaultDate,
        }),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [file, known, mapping, dateFormat, defaultDate]);

  const plan = result && "plan" in result ? result.plan : null;
  const matched = plan?.records.filter((r) => r.playerId) ?? [];
  const newcomers = plan?.records.filter((r) => !r.playerId) ?? [];

  const select = (field: keyof ColumnMapping, label: string, optional: boolean) => (
    <label className="field">
      <span>
        {label}
        {optional ? " (optional)" : ""}
      </span>
      <select
        value={mapping[field] ?? NONE}
        onChange={(e) => setMapping({ ...mapping, [field]: e.target.value || undefined })}
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

  return (
    <div className="grid gap-6">
      <PageHeader overline="Handicaps" title="Import handicaps">
        Upload the NGAP export (CSV). Check what will change, then apply. Nothing is saved until you
        apply.
      </PageHeader>

      <SectionCard
        id="file-h"
        icon={<StepNo n={1} />}
        title="Choose the file"
        subtitle="The CSV export from NGAP."
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
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) load(await f.text(), f.name);
              }}
            />
          </label>
          <Button
            variant="secondary"
            className="h-auto min-h-10 self-center"
            onClick={() => load(SAMPLE_NGAP_CSV, "sample-ngap.csv")}
          >
            <FileSpreadsheet aria-hidden="true" />
            Try the sample file
          </Button>
        </div>
        <p className="hint">
          Excel files (.xlsx) are not supported yet. In Excel, use Save As and choose CSV.
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
          icon={<StepNo n={2} />}
          title="Which column is which?"
          subtitle={`${fileName}: ${file.rows.length} rows. We guessed from the headers. Change any that look wrong.`}
        >
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {select("name", "Player name", false)}
            {select("index", "Handicap index", false)}
            {select("ngapId", "NGAP ID", true)}
            {select("effectiveDate", "Date of the index", true)}
            <label className="field">
              <span>Dates are written as</span>
              <select
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value as DateFormat)}
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
                  onChange={(e) => setDefaultDate(e.target.value)}
                />
              </label>
            )}
          </div>
        </SectionCard>
      )}

      {result && "error" in result && (
        <Notice tone="bad" alert>
          {result.error}
        </Notice>
      )}

      {plan && (
        <SectionCard
          id="changes-h"
          icon={<StepNo n={3} />}
          title="What will change"
          subtitle="Check the list, then apply. Only players already on your list are updated."
        >
          <div className="tiles grid-cols-2 lg:grid-cols-4">
            <div className="tile">
              <b>{matched.length}</b>
              <span>Players updated</span>
            </div>
            <div className="tile">
              <b>{newcomers.length}</b>
              <span>Not in your list</span>
            </div>
            <div className="tile">
              <b>{plan.summary.noHandicap}</b>
              <span>No handicap (NH)</span>
            </div>
            <div className={`tile${plan.errors.length ? " bad" : ""}`}>
              <b>{plan.errors.length}</b>
              <span>Rows with problems</span>
            </div>
          </div>

          {plan.errors.length > 0 && (
            <Notice tone="bad" alert>
              <b>These rows will be skipped:</b>
              <ul>
                {plan.errors.map((e) => (
                  <li key={`${e.row}-${e.message}`}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </Notice>
          )}
          {plan.warnings.length > 0 && (
            <Notice tone="warn">
              <b>Please check:</b>
              <ul>
                {plan.warnings.map((w) => (
                  <li key={`${w.row}-${w.message}`}>
                    Row {w.row}: {w.message}
                  </li>
                ))}
              </ul>
            </Notice>
          )}
          {newcomers.length > 0 && (
            <Notice tone="info">
              {newcomers.length} golfer(s) in the file are not on your list:{" "}
              {newcomers.map((n) => n.name).join(", ")}. They are not added here, because birthdate
              and gender are needed. Add them on the <Link href="/players">Players page</Link>.
            </Notice>
          )}

          <div className="table-wrap !shadow-none">
            <table>
              <thead>
                <tr>
                  <th className="num">Row</th>
                  <th>Name in file</th>
                  <th>Matched by</th>
                  <th className="num">New index</th>
                  <th>Index date</th>
                </tr>
              </thead>
              <tbody>
                {plan.records.map((r) => (
                  <tr key={r.row}>
                    <td className="num mono">{r.row}</td>
                    <td>{r.name}</td>
                    <td>
                      {r.matchedBy === "ngap_id" ? (
                        "NGAP ID"
                      ) : r.matchedBy === "name" ? (
                        "Name"
                      ) : (
                        <span className="pill info">Not on list</span>
                      )}
                    </td>
                    <td className="num mono">{fmtIndex(r.index)}</td>
                    <td className="mono">{r.effectiveDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button
              variant="primary"
              disabled={matched.length === 0}
              onClick={() => {
                dispatch({ type: "applyImport", records: plan.records });
                setApplied(
                  `Updated ${matched.length} player(s). Open Players to see their new flights.`,
                );
              }}
            >
              <Check aria-hidden="true" />
              Apply to {matched.length} player{matched.length === 1 ? "" : "s"}
            </Button>
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
        </SectionCard>
      )}
    </div>
  );
}

function StepNo({ n }: { n: number }) {
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
