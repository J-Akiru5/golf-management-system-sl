"use client";

import { FileJson } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ScoringRoundView } from "@/lib/data/scoring";
import { eventRulesFor } from "@/lib/scoring/event-rules";
import {
  parseSheetExport,
  type ResolvedSheetCard,
  resolveSheetImport,
  type SheetExport,
  type SheetImportPlan,
} from "@/lib/scoring/import";
import { useDesk } from "@/lib/store/desk-store";

interface ImportFailure {
  sheetCardId: string;
  playerName: string;
  message: string;
}

interface ImportResult {
  approved: number;
  saved: number;
  alreadyIn: number;
  failed: ImportFailure[];
}

interface SheetImportPanelProps {
  view: ScoringRoundView;
  busy: boolean;
  onImported: (view: ScoringRoundView) => void;
  onImportingChange?: (importing: boolean) => void;
  /** A submission selected in the tabulator queue, read as soon as it changes. */
  initialFile?: { name: string; text: string } | null;
}

/** What importing the file into this round would do, or null when the round is not on card rules. */
function buildPlan(round: ScoringRoundView, file: SheetExport): SheetImportPlan | null {
  const rules = eventRulesFor(round.rulesVersion);
  if (!rules) return null;
  return resolveSheetImport({
    file,
    roundId: round.roundId,
    rules,
    strokeLimits: round.strokeLimits,
    holes: round.course.holes,
    players: round.players.map((player) => ({
      playerId: player.playerId,
      playerName: player.playerName,
      frozenIndex: player.frozenIndex,
      tee: player.tee,
    })),
    cards: round.cards,
    tee: round.course.tee,
  });
}

/**
 * Loads the export of the standalone scoring sheet (`bamboo-scores-edit`) into the open round.
 *
 * Nothing is written as the file arrives. It is read, every card is matched to a player by exact
 * name or listed as unmatched, and the desk sees what would happen to each card before pressing
 * Import. A card the sheet marks verified is saved and approved under the event's card rules; one
 * it does not is saved and left for the desk to approve.
 */
export function SheetImportPanel({
  view,
  busy,
  onImported,
  onImportingChange,
  initialFile,
}: SheetImportPanelProps) {
  const { tournament, scoring } = useDesk();
  const rules = eventRulesFor(view.rulesVersion);
  const [fileName, setFileName] = useState("");
  const [parsedFile, setParsedFile] = useState<SheetExport | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [fileCardCount, setFileCardCount] = useState(0);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const readRequest = useRef(0);

  const eighteenHoles = view.course.holes.length === 18;
  const disabled = busy || importing || !rules || !eighteenHoles;

  const plan = useMemo(() => (parsedFile ? buildPlan(view, parsedFile) : null), [parsedFile, view]);
  const planKey = plan ? plan.ready.map((card) => card.captureKey).join("|") : "";

  // A plan belongs to one round of one event. Do not carry it across a switch.
  useEffect(() => {
    readRequest.current += 1;
    setFileName("");
    setParsedFile(null);
    setProblems([]);
    setFileCardCount(0);
    setError("");
    setConfirmed(false);
    setResult(null);
  }, [view.roundId, tournament?.id]);

  // A submission picked in the tabulator queue is read at once, so the desk sees the same preview
  // an uploaded file would show before anything is written.
  useEffect(() => {
    if (!initialFile) return;
    void readFile(new File([initialFile.text], initialFile.name, { type: "application/json" }));
  }, [initialFile]);

  // If a card is added while the preview is open, the tick no longer covers what is ready.
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
    setProblems([]);
    setFileCardCount(0);
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed = parseSheetExport(JSON.parse(await file.text()));
      if (requestId !== readRequest.current) return;
      setProblems(parsed.problems);
      setFileCardCount(parsed.cardCount);
      setParsedFile(parsed.file);
    } catch (reason) {
      if (requestId !== readRequest.current) return;
      setError(
        reason instanceof SyntaxError
          ? "That file is not valid JSON. Use the file the sheet's Export JSON button saved."
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
      // The page could have moved to another event or round since the preview. Plan again from the
      // round as it is now, so a card added in the meantime is not written twice.
      const current = await scoring.loadRound(tournament.id, view.dayNumber);
      if (!current || current.roundId !== view.roundId) {
        setError(
          "The Scores screen is showing a different round from the one this page would write to. Reload the page and open the round again.",
        );
        return;
      }
      const fresh = buildPlan(current, parsedFile);
      if (!fresh || fresh.fileProblems.length > 0) {
        setError(fresh?.fileProblems[0] ?? "The file no longer matches this round.");
        return;
      }
      if (fresh.ready.length === 0) {
        setError("Nothing is ready to import now. Check the preview again.");
        return;
      }

      setProgress({ done: 0, total: fresh.ready.length });
      let latest: ScoringRoundView | null = null;
      const tally: ImportResult = { approved: 0, saved: 0, alreadyIn: 0, failed: [] };
      for (const [index, card] of fresh.ready.entries()) {
        try {
          const saved = await scoring.saveEventCard(
            tournament.id,
            {
              playerId: card.playerId,
              entries: card.entries,
              cardHandicap: card.cardHandicap.trim() === "" ? null : card.cardHandicap.trim(),
              writtenTotal: card.writtenTotal,
              captureKey: card.captureKey,
              approve: card.approve,
              extraction: {
                engine: "bamboo-scores-edit",
                engineVersion: "1",
                raw: { source: "sheet-export", note: card.note, ...card.trace },
              },
            },
            view.dayNumber,
          );
          latest = saved.view;
          if (saved.outcome === "approved") tally.approved += 1;
          else if (saved.outcome === "saved") tally.saved += 1;
          else tally.alreadyIn += 1;
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : String(reason);
          if (/duplicate key|capture_key_reused|already attached/i.test(message)) {
            tally.alreadyIn += 1;
          } else {
            tally.failed.push({
              sheetCardId: card.sheetCardId,
              playerName: card.playerName,
              message,
            });
          }
        }
        setProgress({ done: index + 1, total: fresh.ready.length });
      }
      if (latest) onImported(latest);
      setResult(tally);
      setParsedFile(null);
      setConfirmed(false);
    } finally {
      setProgress(null);
      setImporting(false);
      onImportingChange?.(false);
    }
  }

  const toApprove = plan?.ready.filter((card) => card.approve).length ?? 0;
  const toSave = (plan?.ready.length ?? 0) - toApprove;

  return (
    <div className="grid gap-3">
      <p className="hint m-0">
        For the export of the scoring sheet (the JSON its Export button saves). Each card is matched
        to a player by exact name, then saved under the event's card rules. Nothing is written until
        you press Import.
      </p>

      {!rules && (
        <div className="notice warn" role="status">
          This round is not on the event's card rules (its rules version is{" "}
          {view.rulesVersion ? <b className="mono">{view.rulesVersion}</b> : "not set"}), so sheet
          cards cannot be saved here. Open the round with the event's rules version.
        </div>
      )}
      {!eighteenHoles && (
        <div className="notice warn" role="status">
          The sheet has 18 holes per card. This round has {view.course.holes.length}.
        </div>
      )}

      <label className="relative flex min-h-[84px] min-w-0 cursor-pointer items-center gap-3 rounded-[14px] border border-dashed border-line-strong bg-surface-sunken px-4 py-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-raised text-fairway shadow-card">
          <FileJson className="size-[18px]" aria-hidden="true" />
        </span>
        <span className="grid min-w-0">
          <span className="font-semibold">Sheet export JSON</span>
          <span className="truncate text-[13px] text-ink-muted">
            {fileName || "Choose the file exported from the scoring sheet"}
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

      {error && (
        <div className="notice bad" role="alert">
          {error}
        </div>
      )}

      {problems.length > 0 && (
        <div className="notice bad" role="alert">
          <b>
            {problems.length} {problems.length === 1 ? "problem" : "problems"} in the file.
          </b>{" "}
          A card with a problem is left out of the preview.
          <ul className="m-0 grid gap-1 pl-5 text-[13px]">
            {problems.slice(0, 8).map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
            {problems.length > 8 && <li>{problems.length - 8} more.</li>}
          </ul>
        </div>
      )}

      {parsedFile && (
        <p className="hint m-0">
          <b>{parsedFile.label || parsedFile.slug}</b>
          {parsedFile.exportedAt ? `, exported ${parsedFile.exportedAt}` : ""}. {fileCardCount}{" "}
          {fileCardCount === 1 ? "card" : "cards"} in the file.
        </p>
      )}

      {plan?.fileProblems.map((message) => (
        <div className="notice bad" role="alert" key={message}>
          <b>Nothing was imported.</b> {message}
        </div>
      ))}

      {plan && plan.fileProblems.length === 0 && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Import summary">
            <span className={`pill ${toApprove > 0 ? "ok" : "info"}`}>
              {toApprove} to save and approve
            </span>
            <span className="pill info">{toSave} to save only</span>
            <span className="pill info">{plan.alreadyIn.length} already in</span>
            <span className={`pill ${plan.unmatched.length > 0 ? "warn" : "info"}`}>
              {plan.unmatched.length} unmatched
            </span>
            <span className={`pill ${plan.blocked.length > 0 ? "bad" : "info"}`}>
              {plan.blocked.length} blocked
            </span>
          </div>

          {plan.ready.length > 0 && (
            <div className="grid gap-2">
              <h3 className="m-0 text-[15px]">Ready to import</h3>
              <ReadyTable cards={plan.ready} />
              <label className="flex items-start gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={disabled}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  I checked the preview. Verified cards are saved and approved and count at once;
                  the rest are saved for approval.
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
                  A repeated file does not add a second card. Keep this tab open until the count
                  finishes.
                </span>
              </div>
              <span className="sr" role="status" aria-live="polite">
                {importing
                  ? `Importing ${progress?.done ?? 0} of ${progress?.total ?? plan.ready.length}.`
                  : ""}
              </span>
            </div>
          )}

          {plan.unmatched.length > 0 && (
            <div className="grid gap-2">
              <h3 className="m-0 text-[15px]">Unmatched</h3>
              <p className="hint m-0">
                No single player in this day's round carries the name. Nothing was guessed. Fix the
                name on the sheet, or enter the card by hand.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Name on the sheet</th>
                      <th scope="col">Group</th>
                      <th scope="col">HDCP</th>
                      <th scope="col">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.unmatched.map((entry) => (
                      <tr key={entry.card.id}>
                        <td>{entry.card.name || "(no name)"}</td>
                        <td className="mono">{entry.card.group || "—"}</td>
                        <td className="mono">{entry.card.hdcp || "—"}</td>
                        <td>{entry.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {plan.blocked.length > 0 && (
            <div className="grid gap-2">
              <h3 className="m-0 text-[15px]">Blocked</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Player</th>
                      <th scope="col">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.blocked.map((blocked) => (
                      <tr key={blocked.card.id}>
                        <td>{blocked.playerName ?? blocked.card.name}</td>
                        <td>{blocked.reasons.join(" ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
              <div className="mt-2">
                <ReadyTable cards={plan.alreadyIn} />
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
            {result.approved} saved and approved, {result.saved} saved for approval.
          </b>{" "}
          {result.alreadyIn > 0 &&
            `${result.alreadyIn} ${result.alreadyIn === 1 ? "was" : "were"} already in. `}
          {result.failed.length > 0 && (
            <>
              {result.failed.length} failed:
              <ul className="m-0 grid gap-1 pl-5">
                {result.failed.map((failure) => (
                  <li key={failure.sheetCardId}>
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

function ReadyTable({ cards }: { cards: readonly ResolvedSheetCard[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Group</th>
            <th scope="col">Player</th>
            <th scope="col">HDCP</th>
            <th scope="col">Plays off</th>
            <th scope="col">Strokes</th>
            <th scope="col">X</th>
            <th scope="col">Then</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => (
            <tr key={card.sheetCardId}>
              <td className="mono">{card.group || "—"}</td>
              <td>{card.playerName}</td>
              <td className="mono">{card.cardHandicap || "blank"}</td>
              <td className="mono">{card.playingHandicap ?? "—"}</td>
              <td className="mono">{card.gross}</td>
              <td className="mono">{card.pickups}</td>
              <td>{card.approve ? "Approve" : "Wait for approval"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
