"use client";

import { useMemo, useState } from "react";
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
    <div className="stack">
      <header>
        <h1>Import handicaps</h1>
        <p className="muted">
          Upload the NGAP export (CSV). Check what will change, then apply. Nothing is saved until
          you apply.
        </p>
      </header>

      <section className="card stack" style={{ gap: ".9rem" }}>
        <div className="row">
          <label className="field grow">
            <span>NGAP export file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) load(await f.text(), f.name);
              }}
            />
          </label>
          <button
            type="button"
            className="btn ghost"
            onClick={() => load(SAMPLE_NGAP_CSV, "sample-ngap.csv")}
          >
            Try the sample file
          </button>
        </div>
        <p className="hint">
          Excel files (.xlsx) are not supported yet. In Excel, use Save As and choose CSV.
        </p>
        {readError && (
          <div className="notice bad" role="alert">
            {readError}
          </div>
        )}
      </section>

      {file && (
        <section className="card stack" style={{ gap: ".9rem" }}>
          <h2>Which column is which?</h2>
          <p className="muted">
            {fileName}: {file.rows.length} rows. We guessed from the headers. Change any that look
            wrong.
          </p>
          <div className="form-grid">
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
        </section>
      )}

      {result && "error" in result && (
        <div className="notice bad" role="alert">
          {result.error}
        </div>
      )}

      {plan && (
        <section className="stack">
          <h2>What will change</h2>
          <div className="tiles">
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
            <div className="tile">
              <b>{plan.errors.length}</b>
              <span>Rows with problems</span>
            </div>
          </div>

          {plan.errors.length > 0 && (
            <div className="notice bad" role="alert">
              <b>These rows will be skipped:</b>
              <ul>
                {plan.errors.map((e) => (
                  <li key={`${e.row}-${e.message}`}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.warnings.length > 0 && (
            <div className="notice warn">
              <b>Please check:</b>
              <ul>
                {plan.warnings.map((w) => (
                  <li key={`${w.row}-${w.message}`}>
                    Row {w.row}: {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {newcomers.length > 0 && (
            <div className="notice">
              {newcomers.length} golfer(s) in the file are not on your list:{" "}
              {newcomers.map((n) => n.name).join(", ")}. They are not added here, because birthdate
              and gender are needed. Add them on the Players page.
            </div>
          )}

          <div className="table-wrap">
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

          <div className="row">
            <button
              type="button"
              className="btn gold"
              disabled={matched.length === 0}
              onClick={() => {
                dispatch({ type: "applyImport", records: plan.records });
                setApplied(
                  `Updated ${matched.length} player(s). Open Players to see their new flights.`,
                );
              }}
            >
              Apply to {matched.length} player{matched.length === 1 ? "" : "s"}
            </button>
            {applied && (
              <span role="status" className="pill ok">
                {applied}
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
