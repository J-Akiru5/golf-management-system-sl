"use client";

import { Download, FileJson } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { OpenRoundSnapshot } from "@/lib/data/open-round";
import type { ScoringRoundView } from "@/lib/data/scoring";
import {
  buildScorecardImportTemplate,
  importCaptureKey,
  importCardEntries,
  parseScorecardImport,
  resolveScorecardImport,
  type ScorecardImportFile,
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
  alreadyIn: number;
  failed: ImportFailure[];
}

interface ScorecardImportPanelProps {
  view: ScoringRoundView;
  roundState: OpenRoundSnapshot | null;
  busy: boolean;
  onImported: (view: ScoringRoundView) => void;
  onImportingChange?: (importing: boolean) => void;
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

function existingCards(view: ScoringRoundView) {
  return view.cards.map((card) => ({
    playerId: card.playerId,
    scorerId: card.scorerId,
    status: card.status,
    entries: card.entries.map((entry) => ({
      hole: entry.hole,
      strokes: entry.strokes,
    })),
    writtenTotal: card.writtenTotal,
  }));
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
  onImportingChange,
}: ScorecardImportPanelProps) {
  const { tournament, scoring, member } = useDesk();
  const [fileName, setFileName] = useState("");
  const [parsedFile, setParsedFile] = useState<ScorecardImportFile | null>(null);
  const [parseProblems, setParseProblems] = useState<ScorecardImportProblem[]>([]);
  const [fileCardCount, setFileCardCount] = useState(0);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const readRequest = useRef(0);

  const publishedGroups = roundState?.draw.publishedGroups ?? null;
  const groups = useMemo(() => {
    if (publishedGroups === null) return null;
    return publishedGroups.filter(
      (group) => group.dayNumber === undefined || group.dayNumber === view.dayNumber,
    );
  }, [publishedGroups, view.dayNumber]);
  const groupCheck =
    roundState === null
      ? "loading"
      : groups === null || groups.length === 0
        ? "unavailable"
        : "ready";
  const eighteenHoles = view.course.holes.length === 18;
  const disabled = busy || importing || groupCheck !== "ready" || !eighteenHoles;

  const plan = useMemo<ScorecardImportPlan | null>(() => {
    if (!parsedFile) return null;
    return resolveScorecardImport({
      file: parsedFile,
      roundId: view.roundId,
      tournamentId: view.tournamentId,
      dayNumber: view.dayNumber,
      players: view.players.map((player) => ({
        playerId: player.playerId,
        playerName: player.playerName,
      })),
      groups,
      cards: existingCards(view),
    });
  }, [parsedFile, view, groups]);

  const planKey = plan ? plan.ready.map((card) => card.card.cardKey).join("|") : "";

  // A plan belongs to one round of one event. Do not carry it across a switch.
  useEffect(() => {
    readRequest.current += 1;
    setFileName("");
    setParsedFile(null);
    setParseProblems([]);
    setFileCardCount(0);
    setError("");
    setConfirmed(false);
    setResult(null);
  }, [view.roundId, tournament?.id]);

  // If a manual card or another tab changes what is ready, the acknowledgement is stale.
  useEffect(() => {
    setConfirmed(false);
  }, [planKey]);

  async function readFile(file: File | null) {
    const requestId = readRequest.current + 1;
    readRequest.current = requestId;
    setResult(null);
    setError("");
    setConfirmed(false);
    setParsedFile(null);
    setParseProblems([]);
    setFileCardCount(0);
    if (!file) return;
    setFileName(file.name);
    if (!tournament) {
      setError("Choose an event before importing cards.");
      return;
    }
    if (groupCheck !== "ready") {
      setError("The published draw for this day is not ready, so the group check cannot run.");
      return;
    }
    if (!eighteenHoles) {
      setError("This import is for an 18-hole round. Enter the cards by hand for this round.");
      return;
    }
    try {
      const parsed = parseScorecardImport(JSON.parse(await file.text()), {
        strokeLimits: view.strokeLimits,
      });
      if (requestId !== readRequest.current) return;
      setParseProblems(parsed.problems);
      setFileCardCount(parsed.cardCount);
      setParsedFile(parsed.file);
    } catch (reason) {
      if (requestId !== readRequest.current) return;
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
    if (!parsedFile || !plan || !tournament || plan.ready.length === 0 || !confirmed) return;
    setImporting(true);
    onImportingChange?.(true);
    setError("");
    setResult(null);
    try {
      // The page could have moved to another event or round since the preview.
      const current = await scoring.loadRound(tournament.id);
      if (!current || current.roundId !== view.roundId) {
        setError(
          "The Scores screen is showing a different round from the one this page would write to. Reload the page and open the round again.",
        );
        return;
      }

      // Re-resolve against the live view, so a card added after the preview is not written twice.
      const fresh = resolveScorecardImport({
        file: parsedFile,
        roundId: view.roundId,
        tournamentId: view.tournamentId,
        dayNumber: view.dayNumber,
        players: view.players.map((player) => ({
          playerId: player.playerId,
          playerName: player.playerName,
        })),
        groups,
        cards: existingCards(view),
      });
      if (fresh.problems.length > 0) {
        setError(fresh.problems[0]?.message ?? "The file no longer matches this round.");
        return;
      }
      if (fresh.ready.length === 0) {
        setError("Nothing is ready to import now. Check the preview again.");
        return;
      }

      setProgress({ done: 0, total: fresh.ready.length });
      let nextView: ScoringRoundView | null = null;
      let imported = 0;
      let alreadyIn = 0;
      const failed: ImportFailure[] = [];
      for (const [index, card] of fresh.ready.entries()) {
        try {
          nextView = await scoring.submitCard(tournament.id, {
            playerId: card.playerId,
            scorerId: card.markerPlayerId,
            source: "manual",
            entries: importCardEntries(card),
            writtenTotal: card.card.writtenTotal,
            captureKey: importCaptureKey(view.roundId, card.card.cardKey),
            extraction: {
              engine: "scorecard-transcription",
              engineVersion: "1",
              raw: {
                cardKey: card.card.cardKey,
                extractedBy: parsedFile.extractedBy,
                extractedAt: parsedFile.extractedAt,
                notes: card.card.notes,
                source: "json-import",
              },
            },
          });
          imported += 1;
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : String(reason);
          if (/duplicate key|capture_key_reused|already attached/i.test(message)) {
            alreadyIn += 1;
          } else {
            failed.push({
              cardKey: card.card.cardKey,
              playerName: card.playerName,
              message,
            });
          }
        }
        setProgress({ done: index + 1, total: fresh.ready.length });
      }
      if (nextView) onImported(nextView);
      setResult({ imported, alreadyIn, failed });
      setParsedFile(null);
      setConfirmed(false);
    } finally {
      setProgress(null);
      setImporting(false);
      onImportingChange?.(false);
    }
  }

  function downloadTemplate() {
    if (!tournament || groupCheck !== "ready" || !eighteenHoles) return;
    const markers = (groups ?? []).flatMap((group) =>
      group.playerIds.map((playerId, index) => ({
        playerId,
        scorerId: group.playerIds[(index + 1) % group.playerIds.length] ?? playerId,
      })),
    );
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
      markers,
    });
    template.extractedBy = member?.displayName?.trim() || "Desk";
    template.extractedAt = new Date().toISOString();
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `scorecards-round-${view.roundId.slice(0, 8)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="grid gap-3">
      <p className="hint m-0">
        The transcription is checked here before anything is written. Every card is submitted, not
        approved, so the desk still checks it.
      </p>

      {groupCheck === "loading" && (
        <div className="notice info" role="status">
          Loading the published draw. The file picker opens when the group check is ready.
        </div>
      )}
      {groupCheck === "unavailable" && (
        <div className="notice warn" role="status">
          The published draw has no player ids for this day, so the group check cannot run. Publish
          the pairings again before importing.
        </div>
      )}
      {!eighteenHoles && (
        <div className="notice warn" role="status">
          This import is for an 18-hole round. This round has {view.course.holes.length} holes;
          enter the cards by hand.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-h-[84px] min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[14px] border border-dashed border-line-strong bg-surface-sunken px-4 py-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
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
              // Clear the input so choosing the same path again after a fix still fires.
              event.target.value = "";
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
      <p className="hint m-0">
        The template fills the round, player ids, groups, proposed markers, your name and the time.
        Change the name to the transcriber and check the marker against the paper card.
      </p>

      {error && (
        <div className="notice bad" role="alert">
          {error}
        </div>
      )}

      {parseProblems.length > 0 && (
        <div className="notice bad" role="alert">
          <b>The file has problems.</b> Cards with a problem are left out of the preview; the cards
          listed below can still be imported.
          {problemList(parseProblems)}
        </div>
      )}

      {parsedFile && fileCardCount > parsedFile.cards.length && (
        <div className="notice warn" role="status">
          <b>{fileCardCount - parsedFile.cards.length} card(s) were left out.</b> They are not in
          this preview and will not be imported.
        </div>
      )}

      {parsedFile && (
        <p className="hint m-0">
          Transcribed by <b>{parsedFile.extractedBy}</b> at {parsedFile.extractedAt}.
        </p>
      )}

      {plan?.problems.map((problem) => (
        <div className="notice bad" role="alert" key={`${problem.path}:${problem.message}`}>
          <b>Nothing was imported.</b> {problem.message}
        </div>
      ))}

      {plan && plan.problems.length === 0 && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Import summary">
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
                      <th scope="col">Group</th>
                      <th scope="col">Player</th>
                      <th scope="col">Marked by</th>
                      <th scope="col">Total</th>
                      <th scope="col">Holes</th>
                      <th scope="col">Notes</th>
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
                        <td>{card.card.notes ?? "—"}</td>
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
              <span className="sr" role="status" aria-live="polite">
                {importing
                  ? `Importing ${progress?.done ?? 0} of ${progress?.total ?? plan.ready.length}.`
                  : ""}
              </span>
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
                      <th scope="col">Group</th>
                      <th scope="col">Player</th>
                      <th scope="col">Marked by</th>
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
                      <th scope="col">Player</th>
                      <th scope="col">Marked by</th>
                      <th scope="col">Why</th>
                      <th scope="col">Notes</th>
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
                        <td>{blocked.card.notes ?? "—"}</td>
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
                      <th scope="col">Group</th>
                      <th scope="col">Player</th>
                      <th scope="col">Reason</th>
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
            {result.imported} {result.imported === 1 ? "card" : "cards"} sent.
          </b>{" "}
          {result.alreadyIn > 0 &&
            `${result.alreadyIn} ${result.alreadyIn === 1 ? "was" : "were"} already in. `}
          Check the Cards table to approve them.
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
