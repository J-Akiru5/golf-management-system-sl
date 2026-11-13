"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { applyPairingSheet, pairingMatchKey } from "@/lib/draw/apply-pairing-sheet";
import type { DrawGroup } from "@/lib/draw/validate";
import {
  matchPairingNames,
  type PairingCandidate,
  type PairingGroup,
  type PairingMatchResult,
  type ParsedPairingSheet,
  parsePairingSheet,
} from "@/lib/import/pairing-sheet";

/** The same limit the registration import applies to a workbook. */
const MAX_XLSX_BYTES = 10 * 1024 * 1024;

interface WorksheetMatrix {
  /** Worksheet names in the order the file holds them. */
  sheets: string[];
  sheetName: string;
  rows: unknown[][];
}

/**
 * Reads one worksheet as raw cells with the browser build of the same reader the registration
 * import uses. It is done here, in the browser, so the organizer's workbook is never uploaded.
 */
async function readWorksheet(file: File, worksheet?: string | null): Promise<WorksheetMatrix> {
  if (file.size === 0) throw new Error("The file is empty.");
  if (file.size > MAX_XLSX_BYTES) {
    throw new Error(`The file is larger than ${Math.round(MAX_XLSX_BYTES / 1024 / 1024)} MB.`);
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Choose an .xlsx file.");

  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file, { trim: false });
  if (!sheets.length) throw new Error("The workbook has no worksheets.");
  const names = sheets.map((sheet) => sheet.sheet);
  const selected = worksheet ? sheets.find((sheet) => sheet.sheet === worksheet) : sheets[0];
  if (!selected) {
    throw new Error(`Worksheet "${worksheet}" was not found. Choose one of: ${names.join(", ")}.`);
  }
  return {
    sheets: names,
    sheetName: selected.sheet,
    rows: selected.data as unknown[][],
  };
}

export interface PairingSheetImportProps {
  /** The playing day on screen, named in the dialog. */
  dayName: string;
  /** The players registered for that day, used for name matching. */
  candidates: PairingCandidate[];
  /** The day's groups before the import, counted in the review. */
  currentGroups: DrawGroup[];
  /** The flight of a registration, from the day's registrations. */
  flightOf: (registrationId: string) => string | null;
  /** One of the event's flights, for a group in which nobody has a flight yet. */
  fallbackFlightId: string | null;
  /** A tournament setting, so the parser can warn about a group that is too large. */
  maxGroupSize: number;
  /** Puts the new groups on the board through the page's existing state update. */
  onApply: (groups: DrawGroup[]) => void;
}

function where(group: PairingGroup | undefined): string {
  if (!group) return "the sheet";
  const slot = group.slot === "B" ? "B" : "";
  return `${group.session} session, hole ${group.hole}${slot}`;
}

function nameList(candidates: PairingCandidate[]): string {
  return candidates.map((candidate) => candidate.fullName).join(", ");
}

/**
 * Reads the organizer's own .xlsx pairing sheet in the browser, shows what will be placed, and
 * replaces only the playing day on screen. It never creates a player, changes a registration or
 * publishes. Replacing the groups is saved the same way a manual move on the board is saved; the
 * organizer still presses Publish.
 */
export function PairingSheetImport({
  dayName,
  candidates,
  currentGroups,
  flightOf,
  fallbackFlightId,
  maxGroupSize,
  onApply,
}: PairingSheetImportProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [parsed, setParsed] = useState<ParsedPairingSheet | null>(null);
  const [match, setMatch] = useState<PairingMatchResult | null>(null);
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function loadSheet(nextFile: File, worksheet?: string | null) {
    setBusy(true);
    setError("");
    try {
      const book = await readWorksheet(nextFile, worksheet);
      setFile(nextFile);
      setSheets(book.sheets);
      setSheetName(book.sheetName);
      const nextParsed = parsePairingSheet(book.rows, { maxGroupSize });
      setParsed(nextParsed);
      setMatch(matchPairingNames(nextParsed.groups, candidates));
      setConfirmed(new Set());
    } catch (readError) {
      setFile(nextFile);
      setSheets([]);
      setSheetName("");
      setParsed(null);
      setMatch(null);
      setConfirmed(new Set());
      setError(readError instanceof Error ? readError.message : "The workbook could not be read.");
    } finally {
      setBusy(false);
    }
  }

  function openDialog() {
    setFile(null);
    setSheets([]);
    setSheetName("");
    setParsed(null);
    setMatch(null);
    setConfirmed(new Set());
    setError("");
    setOpen(true);
  }

  function toggleConfirmed(key: string, checked: boolean) {
    setConfirmed((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  const preview = useMemo(() => {
    if (!parsed || !match) return null;
    return applyPairingSheet({
      sheetGroups: parsed.groups,
      match,
      confirmed,
      currentGroups,
      flightOf,
      fallbackFlightId,
    });
  }, [parsed, match, confirmed, currentGroups, flightOf, fallbackFlightId]);

  const fuzzy = match ? match.matches.filter((entry) => entry.status === "fuzzy") : [];
  const unplaced = match
    ? match.matches.filter((entry) => entry.status === "ambiguous" || entry.status === "not_found")
    : [];
  const summary = match?.summary ?? null;
  const canApply = Boolean(preview && preview.groups.length > 0 && !busy);

  return (
    <>
      <button type="button" className="btn ghost" onClick={openDialog}>
        Import pairing sheet
      </button>

      <dialog ref={ref} aria-labelledby="pairing-sheet-title" onClose={() => setOpen(false)}>
        <div className="dialog-body">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="pairing-sheet-title">Import pairing sheet</h2>
              <p className="muted">Replacing the groups on {dayName}.</p>
            </div>
            <button
              type="button"
              className="btn ghost small shrink-0"
              aria-label="Close"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              <X aria-hidden="true" />
            </button>
          </div>

          <p className="hint">
            Choose the club&apos;s .xlsx workbook, then the worksheet that holds the pairings. The
            workbook is read on this device. Nothing goes out to players until you publish.
          </p>

          <label className="field">
            <span className="overline">Pairing workbook</span>
            <input
              type="file"
              accept=".xlsx"
              disabled={busy}
              onChange={(event) => {
                const input = event.currentTarget;
                const chosen = input.files?.[0];
                input.value = "";
                if (chosen) void loadSheet(chosen);
              }}
            />
            {file && <span className="hint">{file.name}</span>}
          </label>

          {sheets.length > 0 && (
            <label className="field">
              <span className="overline">Worksheet</span>
              <select
                value={sheetName}
                disabled={busy}
                onChange={(event) => {
                  if (file) void loadSheet(file, event.target.value);
                }}
              >
                {sheets.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {busy && (
            <p className="hint" role="status">
              Reading the workbook...
            </p>
          )}
          {error && (
            <p className="notice bad" role="alert">
              {error}
            </p>
          )}

          {parsed && match && summary && (
            <>
              <div className="row" aria-label="Pairing sheet review">
                <span className="pill ok">{summary.matched} matched</span>
                <span className="pill warn">{summary.fuzzy} to confirm</span>
                <span className="pill bad">{summary.ambiguous} ambiguous</span>
                <span className="pill bad">{summary.not_found} not found</span>
              </div>

              {fuzzy.length > 0 && (
                <section className="stack tight">
                  <h3>Names to confirm</h3>
                  <ul className="plain stack tight">
                    {fuzzy.map((entry) => {
                      const key = pairingMatchKey(entry);
                      const group = parsed.groups[entry.groupIndex];
                      return (
                        <li key={key}>
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={confirmed.has(key)}
                              onChange={(event) => toggleConfirmed(key, event.target.checked)}
                            />
                            <span>
                              <b>{entry.raw}</b> ({where(group)}) suggests{" "}
                              <b>{entry.candidateName ?? "a registered player"}</b>.
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="hint">
                    Ticked names are placed. Unticked names stay off the board.
                  </p>
                </section>
              )}

              {unplaced.length > 0 && (
                <section className="stack tight">
                  <h3>Names not placed</h3>
                  <ul className="plain stack tight">
                    {unplaced.map((entry) => {
                      const group = parsed.groups[entry.groupIndex];
                      return (
                        <li key={pairingMatchKey(entry)}>
                          <b>{entry.raw}</b>{" "}
                          <span className="muted">
                            · {where(group)} ·{" "}
                            {entry.status === "ambiguous"
                              ? "more than one player fits"
                              : "not found"}
                          </span>
                          {entry.alternatives && entry.alternatives.length > 0 && (
                            <span className="hint"> Tied: {nameList(entry.alternatives)}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="hint">
                    Add or confirm this entry on the registration desk, then import again.
                  </p>
                </section>
              )}

              {match.unlisted.length > 0 && (
                <section className="stack tight">
                  <h3>Registered for this day, not on the sheet</h3>
                  <p className="hint">{nameList(match.unlisted)}</p>
                </section>
              )}

              {parsed.warnings.length > 0 && (
                <div className="notice warn">
                  <b>
                    {parsed.warnings.length} warning{parsed.warnings.length === 1 ? "" : "s"} from
                    the sheet
                  </b>
                  <ul>
                    {parsed.warnings.map((warning) => (
                      <li key={`${warning.code}-${warning.row}-${warning.message}`}>
                        {warning.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {preview && (
                <p className="hint">
                  {preview.groups.length} group{preview.groups.length === 1 ? "" : "s"} will replace{" "}
                  {currentGroups.length} group
                  {currentGroups.length === 1 ? "" : "s"} on {dayName}.
                </p>
              )}
            </>
          )}

          <p className="hint">
            Replacing the groups saves this day&apos;s board, the same as moving a player by hand.
            Players do not see it until you press Publish.
          </p>
          <div className="sticky bottom-0 -mx-5 -mb-5 row between border-t border-line bg-surface-raised px-5 py-3">
            <button
              type="button"
              className="btn ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn gold"
              disabled={!canApply}
              onClick={() => {
                if (!preview || preview.groups.length === 0) return;
                onApply(preview.groups);
                setOpen(false);
              }}
            >
              Replace this day&apos;s groups with the sheet
            </button>
          </div>
          {preview && preview.groups.length === 0 && (
            <p className="hint" role="status">
              Nothing on this sheet can be placed yet. Fix the names above and import again.
            </p>
          )}
        </div>
      </dialog>
    </>
  );
}
