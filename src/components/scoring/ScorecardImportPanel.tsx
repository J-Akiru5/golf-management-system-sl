"use client";

import { Download, FileJson } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { OpenRoundSnapshot } from "@/lib/data/open-round";
import type { ScoringRoundView } from "@/lib/data/scoring";
import { reciprocalRotation } from "@/lib/scoring";
import {
  buildScorecardImportTemplate,
  importCaptureKey,
  importCardEntries,
  parseScorecardImport,
  resolveScorecardImport,
  type ScorecardImportPlan,
  type ScorecardImportProblem,
} from "@/lib/scoring/import";
import { useDesk } from "@/lib/store/desk-store";

interface ImportFailure {
  cardKey: string;
  playerName: string;
  message: string;
}

interface ImportResult {
  imported: number;
  failed: ImportFailure[];
}

interface ScorecardImportPanelProps {
  view: ScoringRoundView;
  roundState: OpenRoundSnapshot | null;
  busy: boolean;
  onImported: (view: ScoringRoundView) => void;
}

function problemList(problems: readonly ScorecardImportProblem[], limit = 8) {
  if (problems.length === 0) return null;
  return (
    <ul className="m-0 grid gap-1 pl-5 text-[13px]">
      {problems.slice(0, limit).map((problem) => (
        <li key={`${problem.path}:${problem.message}`}>
          {problem.path ? <b className="mono">{problem.path}</b> : null}
          {problem.path ? " " : null}
          {problem.message}
        </li>
      ))}
      {problems.length > limit && <li>{problems.length - limit} more problems in this file.</li>}
    </ul>
  );
}

/**
 * Loads a scorecard transcription file into the open round.
 *
 * The file is never written as it arrives. It is parsed, matched against the round's players and
 * published groups, checked against the cards already in, and only the cards that pass every check
 * are submitted. A submitted card still needs the ordinary approval.
 */
export function ScorecardImportPanel({
  view,
  roundState,
  busy,
  onImported,
}: ScorecardImportPanelProps) {
  const { tournament, scoring } = useDesk();
  const [fileName, setFileName] = useState("");
  const [plan, setPlan] = useState<ScorecardImportPlan | null>(null);
  const [parseProblems, setParseProblems] = useState<ScorecardImportProblem[]>([]);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const groups = roundState?.draw.publishedGroups ?? null;
  const disabled = busy || importing;

  async function readFile(file: File | null) {
    setResult(null);
    setError("");
    setConfirmed(false);
    setPlan(null);
    setParseProblems([]);
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed = parseScorecardImport(JSON.parse(await file.text()));
      setParseProblems(parsed.problems);
      if (!parsed.file || !tournament) return;
      setPlan(
        resolveScorecardImport({
          file: parsed.file,
          roundId: view.roundId,
          tournamentId: view.tournamentId,
          players: view.players.map((player) => ({
            playerId: player.playerId,
            playerName: player.playerName,
          })),
          groups,
          cards: view.cards.map((card) => ({
            playerId: card.playerId,
            scorerId: card.scorerId,
            status: card.status,
            entries: card.entries.map((entry) => ({
              hole: entry.hole,
              strokes: entry.strokes,
            })),
            writtenTotal: card.writtenTotal,
          })),
        }),
      );
    } catch (reason) {
      setError(
        reason instanceof SyntaxError
          ? "That file is not valid JSON. Check it was saved as JSON, not as a spreadsheet."
          : reason instanceof Error
            ? reason.message
            : String(reason),
      );
    }
  }

  async function importCards() {
    if (!plan || !tournament || plan.ready.length === 0 || !confirmed) return;
    setImporting(true);
    setError("");
    setResult(null);
    setProgress({ done: 0, total: plan.ready.length });
    let imported = 0;
    let nextView: ScoringRoundView | null = null;
    const failed: ImportFailure[] = [];
    for (const [index, card] of plan.ready.entries()) {
      try {
        nextView = await scoring.submitCard(tournament.id, {
          playerId: card.playerId,
          scorerId: card.markerPlayerId,
          source: "manual",
          entries: importCardEntries(card),
          writtenTotal: card.card.writtenTotal,
          captureKey: importCaptureKey(card.card.cardKey),
        });
        imported += 1;
      } catch (reason) {
        failed.push({
          cardKey: card.card.cardKey,
          playerName: card.playerName,
          message: reason instanceof Error ? reason.message : String(reason),
        });
      }
      setProgress({ done: index + 1, total: plan.ready.length });
    }
    if (nextView) onImported(nextView);
    setResult({ imported, failed });
    setConfirmed(false);
    setPlan(null);
    setProgress(null);
    setImporting(false);
  }

  function downloadTemplate() {
    if (!tournament) return;
    const template = buildScorecardImportTemplate({
      tournamentId: view.tournamentId,
      roundId: view.roundId,
      dayNumber: view.dayNumber,
      players: view.players.map((player) => ({
        playerId: player.playerId,
        playerName: player.playerName,
      })),
      groups,
      holes: view.course.holes,
      markers: reciprocalRotation(view.players.map((player) => player.playerId)),
    });
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `scorecards-round-${view.roundId.slice(0, 8)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-3">
      <p className="hint m-0">
        Karl&apos;s transcription is checked here before anything is written. Every card is
        submitted, not approved, so the desk still checks it.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-h-[84px] min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[14px] border border-dashed border-line-strong bg-surface-sunken px-4 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-raised text-fairway shadow-card">
            <FileJson className="size-[18px]" aria-hidden="true" />
          </span>
          <span className="grid min-w-0">
            <span className="font-semibold">Scorecard JSON</span>
            <span className="truncate text-[13px] text-ink-muted">
              {fileName || "Choose the file Karl sent for this round"}
            </span>
          </span>
          <input
            type="file"
            accept=".json,application/json"
            className="absolute inset-0 cursor-pointer opacity-0"
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              void readFile(file);
            }}
          />
        </label>
        <Button
          variant="secondary"
          size="sm"
          onClick={downloadTemplate}
          disabled={disabled || view.players.length === 0}
        >
          <Download className="size-4" aria-hidden="true" />
          Download template
        </Button>
      </div>

      {error && (
        <div className="notice bad" role="alert">
          {error}
        </div>
      )}

      {parseProblems.length > 0 && (
        <div className="notice bad" role="alert">
          <b>The file has problems.</b>
          {problemList(parseProblems)}
        </div>
      )}

      {plan?.problems.map((problem) => (
        <div className="notice bad" role="alert" key={`${problem.path}:${problem.message}`}>
          <b>Nothing was imported.</b> {problem.message}
        </div>
      ))}

      {plan && plan.problems.length === 0 && (
        <>
          <div className="flex flex-wrap gap-2" aria-label="Import summary">
            <span className={`pill ${plan.ready.length > 0 ? "ok" : "info"}`}>
              {plan.ready.length} ready
            </span>
            <span className="pill info">{plan.alreadyIn.length} already in</span>
            <span className={`pill ${plan.blocked.length > 0 ? "bad" : "info"}`}>
              {plan.blocked.length} blocked
            </span>
            <span className={`pill ${plan.skipped.length > 0 ? "warn" : "info"}`}>
              {plan.skipped.length} skipped
            </span>
          </div>

          {plan.ready.length > 0 && (
            <div className="grid gap-2">
              <h3 className="m-0 text-[15px]">Ready to import</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th>Player</th>
                      <th>Marked by</th>
                      <th>Total</th>
                      <th>Holes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.ready.map((card) => (
                      <tr key={card.card.cardKey}>
                        <td className="mono">{card.groupNumber ?? "—"}</td>
                        <td>{card.playerName}</td>
                        <td>{card.markerName}</td>
                        <td className="mono">{card.card.writtenTotal ?? "—"}</td>
                        <td className="mono">{Object.keys(card.card.holes).length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="flex items-start gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={disabled}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  I checked the preview. These cards will be submitted as manual entries and still
                  need approval.
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void importCards()}
                  disabled={disabled || !confirmed}
                >
                  {importing
                    ? `Importing ${progress?.done ?? 0} of ${progress?.total ?? plan.ready.length}…`
                    : `Import ${plan.ready.length} ${plan.ready.length === 1 ? "card" : "cards"}`}
                </Button>
                <span className="hint">
                  One card per player per marker. A repeated file does not create a second revision.
                  A full field takes a few minutes, so keep this tab open until the count finishes.
                </span>
              </div>
            </div>
          )}

          {plan.alreadyIn.length > 0 && (
            <details>
              <summary className="hint cursor-pointer select-none">
                {plan.alreadyIn.length} identical{" "}
                {plan.alreadyIn.length === 1 ? "card is" : "cards are"} already in and will not be
                written again
              </summary>
              <div className="table-wrap mt-2">
                <table>
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th>Player</th>
                      <th>Marked by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.alreadyIn.map((card) => (
                      <tr key={card.card.cardKey}>
                        <td className="mono">{card.groupNumber ?? "—"}</td>
                        <td>{card.playerName}</td>
                        <td>{card.markerName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {plan.blocked.length > 0 && (
            <div className="grid gap-2">
              <h3 className="m-0 text-[15px]">Blocked</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Marked by</th>
                      <th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.blocked.map((blocked) => (
                      <tr key={blocked.card.cardKey}>
                        <td>{blocked.card.playerName ?? blocked.card.playerId ?? "Unknown"}</td>
                        <td>
                          {blocked.card.markerName ?? blocked.card.markerPlayerId ?? "Unknown"}
                        </td>
                        <td>{blocked.reasons.map((reason) => reason.message).join(" ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {plan.skipped.length > 0 && (
            <details>
              <summary className="hint cursor-pointer select-none">
                {plan.skipped.length} {plan.skipped.length === 1 ? "card was" : "cards were"}{" "}
                skipped by the transcriber and need manual entry
              </summary>
              <div className="table-wrap mt-2">
                <table>
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th>Player</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.skipped.map((skipped, index) => (
                      <tr key={`${skipped.playerName}:${index}`}>
                        <td className="mono">{skipped.groupNumber ?? "—"}</td>
                        <td>{skipped.playerName}</td>
                        <td>{skipped.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}

      {result && (
        <div
          className={`notice ${result.failed.length > 0 ? "warn" : "ok"}`}
          role="status"
          aria-live="polite"
        >
          <b>
            {result.imported} {result.imported === 1 ? "card" : "cards"} submitted.
          </b>{" "}
          They still need approval on the Cards table.
          {result.failed.length > 0 && (
            <>
              {" "}
              {result.failed.length} failed:
              <ul className="m-0 grid gap-1 pl-5">
                {result.failed.map((failure) => (
                  <li key={failure.cardKey}>
                    <b>{failure.playerName}:</b> {failure.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
