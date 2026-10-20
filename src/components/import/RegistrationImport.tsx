"use client";

import {
  Check,
  CircleCheck,
  Info,
  OctagonAlert,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { Pager } from "@/components/paging/Pager";
import { usePagedList } from "@/components/paging/usePagedList";
import { Button } from "@/components/ui/button";
import {
  type ImportPreview,
  type MappingKey,
  type MappingSuggestion,
  type NormalizedRegistrationRow,
  type PreviewSummary,
  type RowDecision,
} from "@/lib/import";
import { useDesk } from "@/lib/store/desk-store";

const FIELD_LABEL: Record<MappingKey, string> = {
  memberName: "Member name",
  guestName: "Guest name",
  name: "Player name",
  firstName: "First name",
  lastName: "Last name",
  membershipType: "Member / guest",
  gender: "Gender",
  birthdate: "Date of birth",
  ngapId: "NGAP ID",
  whsId: "WHS ID",
  handicap: "Handicap / index",
  contactNumber: "Contact number",
  email: "Email",
  homeCourse: "Home course",
  shirtSize: "Shirt size",
  paymentStatus: "Paid / payment status",
  paymentAmount: "Amount",
  paymentReference: "Payment reference",
  sponsor: "Sponsor",
  sponsorDetails: "Sponsor details",
  gameDates: "Game dates",
  teeTimePreference: "Tee-time request",
  notes: "Notes",
};

const PRIMARY_FIELDS: MappingKey[] = [
  "memberName",
  "guestName",
  "name",
  "membershipType",
  "gender",
  "birthdate",
  "ngapId",
  "handicap",
  "contactNumber",
  "email",
  "homeCourse",
  "shirtSize",
  "paymentStatus",
  "paymentAmount",
  "gameDates",
  "teeTimePreference",
];

const SECONDARY_FIELDS: MappingKey[] = [
  "firstName",
  "lastName",
  "whsId",
  "sponsor",
  "sponsorDetails",
  "paymentReference",
  "notes",
];

interface PreviewPayload extends ImportPreview {
  sheets: string[];
  sheetName: string;
  storagePath: string | null;
  shapes: Record<string, string[]>;
}

interface CommitResult {
  ok: boolean;
  partial?: boolean;
  alreadyCommitted?: boolean;
  batchId?: string;
  inserted?: number;
  updated?: number;
  skipped?: number;
  rejected?: number;
  rowCount?: number;
  verification?: {
    ok: boolean;
    registrations: number;
    expectedRegistrations: number;
    days: number;
    expectedDays: number;
    batchStatus: string | null;
  };
}

type NoticeTone = "good" | "warn" | "bad" | "info";

export function RegistrationImport() {
  const { tournament, member, status, reload } = useDesk();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [mapping, setMapping] = useState<MappingSuggestion | null>(null);
  const [dateFormat, setDateFormat] = useState<"mdy" | "dmy" | "iso">("mdy");
  const [worksheet, setWorksheet] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<number, RowDecision>>({});
  const [dayOverrides, setDayOverrides] = useState<Record<number, number[]>>({});
  const [approval, setApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState("");
  const [commitError, setCommitError] = useState("");
  const [result, setResult] = useState<CommitResult | null>(null);
  const [dirty, setDirty] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const request = useRef(0);

  const canImport =
    member === undefined || member?.role === "owner" || member?.role === "organizer";
  const interactive = status === "ready" && canImport;

  const pagerKey = [
    preview?.fileSha256 ?? "",
    JSON.stringify(mapping?.mapping ?? {}),
    Object.keys(decisions).length,
    Object.keys(dayOverrides).length,
    preview?.summary.total ?? 0,
  ].join("|");
  const { page, setPage } = usePagedList(preview?.rows ?? [], pagerKey);
  const wrongEvent = Boolean(preview && preview.tournamentId !== tournament?.id);

  const blocking = useMemo(() => {
    if (!preview) return true;
    return !preview.schemaReady || preview.summary.needsDecision > 0 || dirty || wrongEvent;
  }, [preview, dirty, wrongEvent]);

  async function runPreview(
    options: {
      file?: File;
      mapping?: MappingSuggestion | null;
      worksheet?: string | null;
      decisions?: Record<number, RowDecision>;
      dayOverrides?: Record<number, number[]>;
      dateFormat?: "mdy" | "dmy" | "iso";
    } = {},
  ) {
    const chosen = options.file ?? file;
    if (!chosen || !tournament) return;
    const requestId = request.current + 1;
    request.current = requestId;
    setBusy(true);
    setError("");
    setCommitError("");
    setResult(null);

    const body = new FormData();
    body.append("file", chosen);
    body.append("tournamentId", tournament.id);
    body.append("dateFormat", options.dateFormat ?? dateFormat);
    const useWorksheet = options.worksheet !== undefined ? options.worksheet : worksheet;
    if (useWorksheet) body.append("worksheet", useWorksheet);
    const useMapping = options.mapping !== undefined ? options.mapping : mapping;
    if (useMapping) {
      body.append(
        "mapping",
        JSON.stringify({
          mapping: useMapping.mapping,
          fixedMembershipType: useMapping.fixedMembershipType ?? null,
        }),
      );
    }
    body.append("decisions", JSON.stringify(options.decisions ?? decisions));
    body.append("dayOverrides", JSON.stringify(options.dayOverrides ?? dayOverrides));

    try {
      const response = await fetch("/api/import/preview", { method: "POST", body });
      const data = (await response.json()) as {
        ok: boolean;
        message?: string;
        preview?: PreviewPayload;
        mappingErrors?: string[];
      };
      if (request.current !== requestId) return;
      if (!response.ok || !data.ok || !data.preview) {
        setError(
          data.message ?? data.mappingErrors?.join(" ") ?? "The preview could not be built.",
        );
        return;
      }
      setPreview(data.preview);
      setMapping(data.preview.mapping);
      setWorksheet(data.preview.sheetName);
      setDirty(false);
    } catch {
      if (request.current === requestId)
        setError("The preview request failed. Check the connection and try again.");
    } finally {
      if (request.current === requestId) setBusy(false);
    }
  }

  function chooseFile(next: File) {
    setFile(next);
    setPreview(null);
    setMapping(null);
    setDecisions({});
    setDayOverrides({});
    setApproval(false);
    setResult(null);
    setCommitError("");
    setDirty(false);
    void runPreview({
      file: next,
      mapping: null,
      decisions: {},
      dayOverrides: {},
      worksheet: null,
    });
  }

  function changeMapping(key: MappingKey, source: string) {
    if (!mapping) return;
    const next: MappingSuggestion = {
      ...mapping,
      mapping: { ...mapping.mapping, [key]: source || null },
      source: "manual",
      confidence: { ...mapping.confidence, [key]: 1 },
      reasons: { ...mapping.reasons, [key]: "Chosen by the operator." },
    };
    setMapping(next);
    setDirty(true);
    setDecisions({});
    setDayOverrides({});
    setApproval(false);
  }

  function decide(row: number, decision: RowDecision | undefined) {
    const next = { ...decisions };
    if (decision) next[row] = decision;
    else delete next[row];
    setDecisions(next);
    setApproval(false);
    void runPreview({ decisions: next });
  }

  function toggleDay(row: number, day: number, current: number[]) {
    const set = new Set(current);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    const next = [...set].sort((a, b) => a - b);
    const nextOverrides = { ...dayOverrides, [row]: next };
    setDayOverrides(nextOverrides);
    setApproval(false);
    void runPreview({ dayOverrides: nextOverrides });
  }

  async function askAi() {
    if (!preview) return;
    setAiBusy(true);
    setAiMessage("");
    try {
      const response = await fetch("/api/import/suggest-mapping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ headers: Object.keys(preview.shapes), shapes: preview.shapes }),
      });
      const data = (await response.json()) as {
        available?: boolean;
        reason?: string;
        error?: string;
        suggestion?: MappingSuggestion;
      };
      if (!data.available) {
        setAiMessage(data.reason ?? "The AI mapping is not configured.");
        return;
      }
      if (data.error || !data.suggestion) {
        setAiMessage(data.error ?? "The AI did not return a usable mapping.");
        return;
      }
      setMapping(data.suggestion);
      setDirty(true);
      setAiMessage("AI proposal loaded. Review every column, then refresh the preview.");
    } catch {
      setAiMessage("The AI mapping request failed. Map the columns by hand.");
    } finally {
      setAiBusy(false);
    }
  }

  async function commit() {
    if (!preview || !file || !mapping || !tournament) return;
    setCommitting(true);
    setCommitError("");
    setResult(null);
    const body = new FormData();
    body.append("file", file);
    body.append("tournamentId", tournament.id);
    body.append("dateFormat", dateFormat);
    body.append("worksheet", preview.sheetName);
    body.append(
      "mapping",
      JSON.stringify({
        mapping: mapping.mapping,
        fixedMembershipType: mapping.fixedMembershipType ?? null,
      }),
    );
    body.append("decisions", JSON.stringify(decisions));
    body.append("dayOverrides", JSON.stringify(dayOverrides));
    body.append("approval", "true");
    body.append("fileSha256", preview.fileSha256);
    if (preview.storagePath) body.append("storagePath", preview.storagePath);

    try {
      const response = await fetch("/api/import/commit", { method: "POST", body });
      const data = (await response.json()) as CommitResult & {
        message?: string;
        preview?: PreviewPayload;
      };
      if (!response.ok || !data.ok) {
        setCommitError(data.message ?? "The import was refused.");
        if (data.preview) setPreview(data.preview);
        return;
      }
      setResult(data);
      await reload();
    } catch {
      setCommitError(
        "The commit request failed. Nothing is confirmed until this page shows the batch and its read-back.",
      );
    } finally {
      setCommitting(false);
    }
  }

  if (!tournament) return null;

  if (status === "demo") {
    return (
      <Notice tone="info">
        The registration import needs a connected project. This build is showing the demo data, so
        the server cannot verify a commit and the import is disabled.
      </Notice>
    );
  }

  if (status !== "ready") {
    return (
      <Notice tone="info">
        The desk must finish loading the event and its players before an import can be previewed.
      </Notice>
    );
  }

  if (!canImport) {
    return (
      <Notice tone="warn">
        Only an owner or organizer can import registrations. The desk can preview the workbook but
        cannot write it.
      </Notice>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="notice" role="note">
        <b>Nothing is written until you approve the preview.</b> The server re-reads the same file,
        validates every row again, commits in one transaction, and reads the result back. The
        original upload is kept in a private bucket. A success message appears only after that
        read-back matches.
      </div>

      <section className="card grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">1. Choose the workbook</h2>
            <p className="hint">
              CSV or XLSX. The header row is detected and reported; every column mapping is shown
              before a row is normalized.
            </p>
          </div>
          <label className="field w-full max-w-xs">
            <span>Dates in the file</span>
            <select
              value={dateFormat}
              onChange={(e) => {
                const next = e.target.value as "mdy" | "dmy" | "iso";
                setDateFormat(next);
                setDirty(true);
              }}
            >
              <option value="mdy">Month / Day / Year</option>
              <option value="dmy">Day / Month / Year</option>
              <option value="iso">Year-Month-Day</option>
            </select>
          </label>
        </div>

        <label className="relative flex min-h-[96px] cursor-pointer items-center gap-3.5 rounded-[14px] border border-dashed border-line-strong bg-surface-sunken px-4 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-raised text-fairway shadow-card">
            <Upload className="size-[18px]" aria-hidden="true" />
          </span>
          <span className="grid min-w-0">
            <span className="font-semibold">Registration workbook</span>
            <span className="truncate text-[13px] text-ink-muted">
              {file?.name ?? "Choose a .csv or .xlsx file"}
            </span>
          </span>
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="absolute inset-0 cursor-pointer opacity-0"
            disabled={!interactive || busy || committing}
            onChange={(e) => {
              const next = e.target.files?.[0];
              if (next) chooseFile(next);
            }}
          />
        </label>

        {preview && preview.sheets.length > 1 && (
          <label className="field max-w-sm">
            <span>Worksheet</span>
            <select
              value={preview.sheetName}
              disabled={busy}
              onChange={(e) => {
                setWorksheet(e.target.value);
                setDecisions({});
                setDayOverrides({});
                setApproval(false);
                void runPreview({ worksheet: e.target.value, decisions: {}, dayOverrides: {} });
              }}
            >
              {preview.sheets.map((sheet) => (
                <option key={sheet} value={sheet}>
                  {sheet}
                </option>
              ))}
            </select>
          </label>
        )}

        {error && (
          <Notice tone="bad" alert>
            {error}
          </Notice>
        )}
      </section>

      {preview && mapping && (
        <>
          <section className="card grid gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold">2. Which column is which?</h2>
                <p className="hint">
                  {preview.fileName} · {preview.sheetName} · {preview.summary.total} normalized row
                  {preview.summary.total === 1 ? "" : "s"} from the sheet.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={askAi} disabled={aiBusy || busy}>
                  <Sparkles aria-hidden="true" />
                  {aiBusy ? "Asking…" : "Suggest with AI"}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setDecisions({});
                    setDayOverrides({});
                    void runPreview({
                      mapping,
                      decisions: {},
                      dayOverrides: {},
                      worksheet: preview.sheetName,
                    });
                  }}
                  disabled={busy}
                >
                  <RefreshCw aria-hidden="true" />
                  {busy ? "Reading…" : "Refresh preview"}
                </Button>
              </div>
            </div>

            {aiMessage && <Notice tone="info">{aiMessage}</Notice>}
            {wrongEvent && (
              <Notice tone="bad" alert>
                This preview belongs to a different event. Choose the file again for the event now
                selected.
              </Notice>
            )}
            {dirty && (
              <Notice tone="warn">
                The mapping or date format changed. Refresh the preview before committing.
              </Notice>
            )}
            {preview.warnings.map((warning) => (
              <Notice key={warning} tone="warn">
                {warning}
              </Notice>
            ))}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {PRIMARY_FIELDS.map((key) => (
                <MappingSelect
                  key={key}
                  field={key}
                  mapping={mapping}
                  headers={preview.sheets.length ? Object.keys(preview.shapes) : []}
                  onChange={changeMapping}
                />
              ))}
            </div>
            <details>
              <summary className="hint cursor-pointer select-none">
                Optional and less common columns
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {SECONDARY_FIELDS.map((key) => (
                  <MappingSelect
                    key={key}
                    field={key}
                    mapping={mapping}
                    headers={Object.keys(preview.shapes)}
                    onChange={changeMapping}
                  />
                ))}
              </div>
            </details>
            <p className="hint">
              {mapping.unmappedHeaders.length > 0
                ? `Not used: ${mapping.unmappedHeaders.join(", ")}. Their raw values are kept on the batch row.`
                : "Every column is used."}
            </p>
          </section>

          <section className="card grid gap-4">
            <div>
              <h2 className="font-display text-lg font-bold">3. Preview and approve</h2>
              <p className="hint">
                Member and guest rows are separate players. A guest from a member-and-guest row does
                not inherit the member&apos;s details. A new player with no birthdate or gender is
                saved as Needs review; nothing is invented.
              </p>
            </div>

            <Tiles summary={preview.summary} />

            {preview.summary.needsDecision > 0 && (
              <Notice tone="warn" alert>
                {preview.summary.needsDecision} row{preview.summary.needsDecision === 1 ? "" : "s"}{" "}
                need a decision. Choose the right player, create a separate record, or skip the row.
              </Notice>
            )}
            {!preview.schemaReady && (
              <Notice tone="bad" alert>
                Migration 20261035000000 is not applied to this database. The preview is valid, but
                the commit is disabled and nothing can be written.
              </Notice>
            )}

            <div className="table-wrap !shadow-none">
              <table>
                <thead>
                  <tr>
                    <th className="num">Row</th>
                    <th>Player</th>
                    <th>Membership</th>
                    <th>Days</th>
                    <th>Shirt</th>
                    <th>Payment</th>
                    <th>Match</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((row) => (
                    <PreviewRow
                      key={row.row}
                      row={row}
                      days={preview.dayRule.days}
                      expanded={expanded === row.row}
                      onExpand={() => setExpanded(expanded === row.row ? null : row.row)}
                      onDecide={(decision) => decide(row.row, decision)}
                      onToggleDay={(day) =>
                        toggleDay(row.row, day, dayOverrides[row.row] ?? row.days)
                      }
                      decision={decisions[row.row]}
                      busy={busy}
                    />
                  ))}
                </tbody>
              </table>
              {page.total === 0 && (
                <p className="muted p-4 text-[14px]">No rows were found in this sheet.</p>
              )}
            </div>
            <Pager page={page} onPage={setPage} />

            <label className="flex items-start gap-2 rounded-[12px] border border-line bg-surface-sunken p-3 text-[14px]">
              <input
                type="checkbox"
                className="mt-1"
                checked={approval}
                disabled={blocking || busy || committing || Boolean(result)}
                onChange={(e) => setApproval(e.target.checked)}
              />
              <span>
                I reviewed the mapping, the duplicates, the days and the rejected rows. I understand
                a partial commit writes the valid rows and records the rejected ones with their
                reasons.
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <Button
                variant="primary"
                disabled={blocking || !approval || busy || committing || Boolean(result)}
                onClick={commit}
              >
                <Check aria-hidden="true" />
                {committing
                  ? "Committing and verifying…"
                  : preview.summary.insert + preview.summary.update > 0
                    ? `Commit ${preview.summary.insert + preview.summary.update} registration${
                        preview.summary.insert + preview.summary.update === 1 ? "" : "s"
                      }`
                    : "Record the reviewed batch"}
              </Button>
              {result && (
                <span className="hint" role="status">
                  Batch {result.batchId?.slice(0, 8)} · read back{" "}
                  {result.verification?.registrations ?? 0} registration(s) and{" "}
                  {result.verification?.days ?? 0} day selection(s).
                </span>
              )}
              {commitError && (
                <Notice tone="bad" alert>
                  {commitError}
                </Notice>
              )}
            </div>

            {result && (
              <Notice tone={result.partial ? "warn" : "good"} alert>
                {result.alreadyCommitted
                  ? `This file was already committed as batch ${result.batchId?.slice(0, 8)}. No duplicate registrations were written.`
                  : result.partial
                    ? `Committed ${result.inserted ?? 0} new and ${result.updated ?? 0} updated registration(s). ${result.rejected ?? 0} row(s) were rejected and are recorded against batch ${result.batchId?.slice(0, 8)}.`
                    : `Committed and verified ${result.inserted ?? 0} new and ${result.updated ?? 0} updated registration(s) in batch ${result.batchId?.slice(0, 8)}. The dashboard was reloaded from the database.`}
              </Notice>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function MappingSelect({
  field,
  mapping,
  headers,
  onChange,
}: {
  field: MappingKey;
  mapping: MappingSuggestion;
  headers: string[];
  onChange: (field: MappingKey, source: string) => void;
}) {
  const value = mapping.mapping[field] ?? "";
  const confidence = mapping.confidence[field];
  return (
    <label className="field">
      <span className="flex items-center gap-2">
        {FIELD_LABEL[field]}
        {typeof confidence === "number" && (
          <span
            className={`pill ${confidence >= 0.85 ? "ok" : confidence >= 0.6 ? "warn" : "info"}`}
          >
            {Math.round(confidence * 100)}%
          </span>
        )}
      </span>
      <select value={value} onChange={(e) => onChange(field, e.target.value)}>
        <option value="">Not in the file</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </select>
      {mapping.reasons[field] && <span className="hint">{mapping.reasons[field]}</span>}
    </label>
  );
}

function Tiles({ summary }: { summary: PreviewSummary }) {
  const items: Array<{ label: string; value: number; tone?: string }> = [
    { label: "Rows read", value: summary.total },
    { label: "New registrations", value: summary.insert },
    { label: "Updates", value: summary.update },
    { label: "Already registered", value: summary.skip },
    {
      label: "Needs a decision",
      value: summary.needsDecision,
      tone: summary.needsDecision ? "warn" : "",
    },
    {
      label: "Profiles to review",
      value: summary.incompleteProfiles,
      tone: summary.incompleteProfiles ? "warn" : "",
    },
    { label: "Rejected rows", value: summary.reject, tone: summary.reject ? "bad" : "" },
  ];
  return (
    <div className="tiles grid-cols-2 lg:grid-cols-7">
      {items.map((item) => (
        <div key={item.label} className={`tile${item.tone ? ` ${item.tone}` : ""}`}>
          <b>{item.value}</b>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function PreviewRow({
  row,
  days,
  decision,
  expanded,
  busy,
  onExpand,
  onDecide,
  onToggleDay,
}: {
  row: NormalizedRegistrationRow;
  days: ImportPreview["dayRule"]["days"];
  decision: RowDecision | undefined;
  expanded: boolean;
  busy: boolean;
  onExpand: () => void;
  onDecide: (decision: RowDecision | undefined) => void;
  onToggleDay: (day: number) => void;
}) {
  const selected = new Set(row.days);
  const errors = row.issues.filter((i) => i.severity === "error");
  const warnings = row.issues.filter((i) => i.severity === "warning");
  const actionTone =
    row.action === "insert"
      ? "ok"
      : row.action === "update"
        ? "info"
        : row.action === "skip"
          ? ""
          : "bad";
  return (
    <>
      <tr>
        <td className="num mono">{row.sourceRow}</td>
        <td>
          <button
            type="button"
            className="text-left font-semibold underline-offset-2 hover:underline"
            onClick={onExpand}
          >
            {row.name || "(no name)"}
          </button>
          {row.ngapId && <span className="hint block">NGAP {row.ngapId}</span>}
          {errors.map((issue) => (
            <span key={issue.message} className="hint block !text-danger">
              {issue.message}
            </span>
          ))}
          {warnings.length > 0 && (
            <span className="hint block">{warnings.map((i) => i.message).join(" ")}</span>
          )}
        </td>
        <td>
          <span className="pill">{row.membershipType ?? "unknown"}</span>
        </td>
        <td>
          <span className="flex flex-wrap gap-1">
            {days.map((day) => (
              <button
                key={day.dayNumber}
                type="button"
                className={`pill ${selected.has(day.dayNumber) ? "ok" : ""}`}
                title={`${day.label} · ${day.playDate}`}
                disabled={busy}
                onClick={() => onToggleDay(day.dayNumber)}
              >
                {day.dayNumber}
              </button>
            ))}
          </span>
        </td>
        <td>{row.shirtSize ?? "—"}</td>
        <td>
          <span className="pill">{row.paymentStatus ?? "not recorded"}</span>
          {row.paymentAmount !== null && (
            <span className="hint block">₱{row.paymentAmount.toFixed(2)}</span>
          )}
        </td>
        <td>
          {row.match.candidates.length === 0 ? (
            <span className="pill info">New player</span>
          ) : (
            <span className="grid gap-1">
              {row.match.candidates.map((candidate) => (
                <button
                  key={candidate.playerId}
                  type="button"
                  className="btn small ghost justify-start"
                  disabled={busy}
                  onClick={() => onDecide({ action: "link", playerId: candidate.playerId })}
                >
                  Link {candidate.name} ({candidate.confidence})
                </button>
              ))}
              <button
                type="button"
                className="btn small ghost justify-start"
                disabled={busy}
                onClick={() => onDecide({ action: "create" })}
              >
                Create separate
              </button>
            </span>
          )}
          {row.match.candidates.length > 0 && (
            <button
              type="button"
              className="btn small ghost"
              disabled={busy}
              onClick={() => onDecide({ action: "skip" })}
            >
              Skip
            </button>
          )}
          {decision && (
            <button
              type="button"
              className="btn small ghost"
              disabled={busy}
              onClick={() => onDecide(undefined)}
            >
              Clear
            </button>
          )}
        </td>
        <td>
          <span className={`pill ${actionTone}`}>
            {row.requiresDecision ? "Needs decision" : row.action}
          </span>
          {row.requiresDecision && <span className="hint block">Choose a match or the days.</span>}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td />
          <td colSpan={7}>
            <div className="grid gap-2 text-[13px] sm:grid-cols-2 xl:grid-cols-4">
              <Detail label="Birthdate" value={row.birthdate ?? "not on file"} />
              <Detail label="Gender" value={row.gender ?? "not on file"} />
              <Detail label="Contact" value={row.contactNumber ?? "not on file"} />
              <Detail label="Email" value={row.email ?? "not on file"} />
              <Detail label="Home course" value={row.homeCourse ?? "not on file"} />
              <Detail
                label="WHS / handicap"
                value={row.whsId ?? row.declaredHandicap ?? "not on file"}
              />
              <Detail
                label="Sponsor"
                value={row.sponsor === null ? "not asked" : row.sponsor ? "yes" : "no"}
              />
              <Detail label="Tee request" value={row.teeTimeNote ?? "none"} />
              <Detail
                label="Raw row"
                value={Object.entries(row.raw)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              />
            </div>
            {row.issues.length > 0 && (
              <ul className="mt-2 grid gap-1">
                {row.issues.map((issue) => (
                  <li key={`${issue.field}-${issue.message}`} className="hint">
                    <b>{issue.severity}</b> · {issue.field}: {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0">
      <b className="block">{label}</b>
      <span className="hint break-words">{value}</span>
    </span>
  );
}

const NOTICE_ICON = {
  good: CircleCheck,
  warn: TriangleAlert,
  bad: OctagonAlert,
  info: Info,
} as const;
const NOTICE_TEXT = {
  good: "text-success",
  warn: "text-warning",
  bad: "text-danger",
  info: "text-info",
} as const;

function Notice({
  tone,
  alert,
  children,
}: {
  tone: NoticeTone;
  alert?: boolean;
  children: ReactNode;
}) {
  const Icon = NOTICE_ICON[tone];
  return (
    <div
      className={`notice${tone === "info" || tone === "good" ? "" : ` ${tone}`} flex items-start gap-2.5`}
      role={alert ? "alert" : undefined}
    >
      <Icon className={`mt-0.5 size-4 shrink-0 ${NOTICE_TEXT[tone]}`} aria-hidden="true" />
      <div className="min-w-0 text-[14px]">{children}</div>
    </div>
  );
}
